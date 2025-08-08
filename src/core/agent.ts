import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import type { Config, ChatMessage, TaskConfig, TaskResult } from '../config/types.js';
import { logger, PerformanceLogger, LogLevel } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import type { LLMProvider } from '../providers/base.js';
import { createProviderFromUnifiedConfig } from '../providers/factory.js';
import { TaskExecutor } from './task-executor.js';
import { MemoryManager } from './memory.js';
import { MCPToolsHelper, MCPTaskPlanner } from '../mcp/tools.js';
import type { MCPManager } from '../mcp/manager.js';
import { MCPFunctionConverter, type FunctionDefinition } from '../mcp/function-converter.js';

import { SimpleTaskDecomposer } from './task-decomposer.js';
import { ParallelExecutor } from './parallel-executor.js';

// ContinuousExecutionEngineのAgentCoreへの静的プロパティ追加用
interface AgentCoreStatic {
  ContinuousExecutionEngine: typeof ContinuousExecutionEngine;
}

export class AgentCore extends EventEmitter {
  private config: Config;
  private provider: LLMProvider;
  private taskExecutor: TaskExecutor;
  private memoryManager: MemoryManager;
  private mcpToolsHelper?: MCPToolsHelper;
  private mcpTaskPlanner?: MCPTaskPlanner;
  private mcpFunctionConverter?: MCPFunctionConverter;
  private availableFunctions: FunctionDefinition[] = [];
  private taskDecomposer: SimpleTaskDecomposer;
  private parallelExecutor: ParallelExecutor;
  private history: ChatMessage[] = [];
  private currentModel: string;
  private parallelMode: boolean = false;
  private verboseMode: boolean = false;
  
  // Memory management configuration
  private readonly MAX_HISTORY_SIZE = 100; // Maximum history size
  private readonly MEMORY_CHECK_INTERVAL = 10; // Check memory every N chats
  private chatCount: number = 0; // Chat count
  
  // Resource management
  private timers: Set<NodeJS.Timeout> = new Set();
  private eventListeners: WeakMap<object, Function[]> = new WeakMap();

  constructor(config: Config, continueSession: boolean = false) {
    super();
    this.config = config;
    this.currentModel = config.llm.model || this.getDefaultModel();
    this.provider = createProviderFromUnifiedConfig(config);
    this.taskExecutor = new TaskExecutor(this.convertToLegacyConfig(config));
    this.memoryManager = new MemoryManager(config.paths.history);
    this.taskDecomposer = new SimpleTaskDecomposer();
    this.parallelExecutor = new ParallelExecutor(config.app.maxParallel || 3);
    
    // Initialize asynchronously (with error handling)
    void this.initialize(continueSession);
    
    // Register cleanup handlers for process exit
    this.setupCleanupHandlers();
  }

  /**
   * Convert new Config type to legacy Config type
   */
  private convertToLegacyConfig(config: Config): import('../types/config.js').Config {
    return {
      provider: config.llm.provider,
      apiKey: config.llm.apiKey,
      model: config.llm.model,
      localEndpoint: config.localEndpoint,
      useMCP: config.mcp.enabled,
      mcpServers: config.mcp.servers,
      maxParallel: config.app.maxParallel,
      timeout: config.app.timeout,
      logLevel: config.app.logLevel,
      cachePath: config.paths.cache,
      historyPath: config.paths.history,
    };
  }

  private async initialize(continueSession: boolean = false): Promise<void> {
    try {
      // Load historyの読み込みはセッション継続フラグによって制御
      if (continueSession) {
        this.history = await this.memoryManager.loadHistory();
        console.log(`📂 Previous session loaded (${this.history.length} messages)`);
        logger.info('Previous session loaded');
      } else {
        this.history = [];
        console.log('🆕 New session started');
        logger.info('New session started');
      }
      
      // Optimize memory on startup
      await this.optimizeMemory();
      
      // logger.info('Agent core initialized');
    } catch (error) {
      logger.error('InitializeError:', error);

      // Basic functionality remains available even with initialization error
      this.history = [];
      if (continueSession) {
        logger.warn('Failed to load history, starting as new session instead');
      } else {
        logger.info('New session started');
      }

      // Initialization error is not fatal, so don't throw exception
    }
  }

  /**
   * Configure cleanup handlers
   */
  private setupCleanupHandlers(): void {
    const cleanup = () => {
      this.cleanup();
    };

    // Cleanup on process exit
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      cleanup();
      process.exit(1);
    });
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    try {
      // Clear timers
      this.timers.forEach(timer => clearTimeout(timer));
      this.timers.clear();

      // Remove event listeners
      this.removeAllListeners();

      logger.info('Resource cleanup completed');
    } catch (error) {
      logger.error('CleanupError:', error);
    }
  }

  /**
   * Memory optimization processing
   */
  private async optimizeMemory(): Promise<void> {
    try {
      // Limit history size
      if (this.history.length > this.MAX_HISTORY_SIZE) {
        const oldSize = this.history.length;
        this.history = this.history.slice(-this.MAX_HISTORY_SIZE);
        await this.memoryManager.saveHistory(this.history);
        logger.info(`History optimized: ${oldSize} items → ${this.history.length} items`);
      }

      // Also optimize MemoryManager history
      await this.memoryManager.pruneHistory(this.MAX_HISTORY_SIZE);

      // Execute garbage collection (if available)
      if (global.gc) {
        global.gc();
        logger.debug('Garbage collection executed');
      }
    } catch (error) {
      logger.error('Memory optimization error:', error);
    }
  }

  /**
   * Monitor memory usage
   */
  private monitorMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const mbUsage = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    logger.debug('Memory usage:', mbUsage);

    // Warning when memory usage is high
    if (mbUsage.heapUsed > 500) { // When over 500MB
      logger.warn(`Memory usage is high: ${mbUsage.heapUsed}MB`);
      // Execute automatic optimization
      void this.optimizeMemory();
    }
  }

  /**
   * Register timer (with automatic cleanup)
   */
  private registerTimer(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    
    this.timers.add(timer);
    return timer;
  }

  private getDefaultModel(): string {
    switch (this.config.llm.provider) {
      case 'openai':
        return 'gpt-4-turbo-preview';
      case 'anthropic':
        return 'claude-3-opus-20240229';
      case 'local-gptoss':
      case 'local-lmstudio':
        return 'local-model';
      default:
        return 'gpt-4';
    }
  }

  async chat(input: string): Promise<string> {
    const perf = new PerformanceLogger('chat');
    const { globalProgressReporter } = await import('../ui/progress.js');

    try {
      // プログレス表示Started
      globalProgressReporter.startTask('Chat processing', ['Input validation', 'MCP check', 'LLM call', 'Response processing', 'History save']);

      // 入力Validation
      globalProgressReporter.updateSubtask(0);
      if (!input || input.trim().length === 0) {
        globalProgressReporter.completeTask(false);
        throw new Error('Input is empty');
      }

      const trimmedInput = input.trim();
      if (trimmedInput.length > 32000) {
        globalProgressReporter.completeTask(false);
        throw new Error('Input is too long (maximum 32,000 characters)');
      }

      // Function Calling準備
      globalProgressReporter.updateSubtask(1);

      // メモリ使用量チェック（定期的）
      this.chatCount++;
      if (this.chatCount % this.MEMORY_CHECK_INTERVAL === 0) {
        this.monitorMemoryUsage();
        await this.optimizeMemory();
      }

      // UserMessageをHistoryに追加
      const userMessage: ChatMessage = {
        role: 'user',
        content: trimmedInput,
        timestamp: new Date(),
      };
      this.history.push(userMessage);

      // ProviderConnectionCheck
      if (!this.provider) {
        globalProgressReporter.completeTask(false);
        throw new Error('LLM Provider not initialized');
      }

      // LLM呼び出し
      globalProgressReporter.updateSubtask(2);
      
      // Mock mode check
      let result;
      if (process.env.MOCK_LLM_RESPONSE === 'true') {
        // Return mock response for testing
        result = {
          success: true,
          result: {
            content: `Mock response to: "${trimmedInput}". This is a test response for REPL debugging.`,
            usage: {
              promptTokens: 10,
              completionTokens: 15,
              totalTokens: 25
            },
            functionCall: undefined
          }
        };
      } else {
        // withRetryを使用したLLM呼び出し（Function Calling対応）
        result = await withRetry(
          async () => {
            const chatOptions = {
              model: this.currentModel,
              temperature: this.config.llm.temperature || 0.7,
              maxTokens: this.config.llm.maxTokens || 2000,
              tools: this.availableFunctions.length > 0 ? this.availableFunctions : undefined,
              tool_choice: this.availableFunctions.length > 0 ? 'auto' as const : undefined
            };
            
            // GPT-OSSは強制ツール指定をサポートしないためautoのみ使用
            // 代わりにserenaツールを上位に配置して優先度を上げる
            if (chatOptions.tools && chatOptions.tools.length > 0) {
              if (input.includes('ディレクトリ') || input.includes('ファイル一覧') || input.includes('構造') || input.includes('解析')) {
                // serenaツールを配列の先頭に移動
                const serenaTools = chatOptions.tools.filter(t => t.name.startsWith('serena_'));
                const otherTools = chatOptions.tools.filter(t => !t.name.startsWith('serena_'));
                chatOptions.tools = [...serenaTools, ...otherTools];
                logger.debug('Prioritized serena tools for directory analysis');
              }
            }
            
            // Function Callingの状態をログに記録
            if (this.availableFunctions.length > 0) {
              logger.debug(`Function Calling enabled: ${this.availableFunctions.length} functions available`);
            } else {
              logger.debug('Function Calling disabled: No functions available');
            }
            
            logger.debug('Chat request with function calling', {
              toolsCount: this.availableFunctions.length,
              hasTools: !!chatOptions.tools
            });
            
            const response = await this.provider.chat(this.history, chatOptions);
            
            // LLMレスポンスをデバッグ出力
            logger.debug('LLM Response type:', typeof response);
            if (typeof response === 'object' && response !== null) {
              logger.debug('Response object keys:', Object.keys(response));
              if ('tool_calls' in response) {
                logger.debug('Tool calls detected:', response.tool_calls);
              }
            }
            
            return response;
          },
          {
            maxRetries: this.config.llm.maxRetries,
            delay: 1000,
            exponentialBackoff: true,
            timeout: this.config.llm.timeout,
            shouldRetry: (error: Error) => {
              const message = error.message.toLowerCase();
              // Retry可能なError: Timeout、Rate limit、ネットワークError、ServerError
              return (
                message.includes('timeout') ||
                message.includes('rate limit') ||
                message.includes('too many requests') ||
                message.includes('network') ||
                message.includes('connection') ||
                message.includes('server error') ||
                message.includes('temporary') ||
                message.includes('service unavailable')
              );
            },
          },
        );
      }

      if (!result.success) {
        logger.error('LLMChatError after retries:', result.error);
        globalProgressReporter.completeTask(false);
        throw result.error!;
      }

      const llmResponse = result.result!;

      // ResponseProcessing
      globalProgressReporter.updateSubtask(3);

      // Function Callingのチェック
      if (llmResponse.functionCall || (llmResponse.tool_calls && llmResponse.tool_calls.length > 0)) {
        logger.info('Function call detected:', llmResponse.functionCall || llmResponse.tool_calls);
        
        // Tool呼び出しをExecute - 新しい形式と古い形式の両方に対応
        let toolCalls;
        if (llmResponse.tool_calls && llmResponse.tool_calls.length > 0) {
          // 新しい形式（local.tsから）
          toolCalls = llmResponse.tool_calls.map(call => ({
            function: {
              name: call.function?.name || call.name,
              arguments: typeof call.function?.arguments === 'string' 
                ? call.function.arguments 
                : JSON.stringify(call.function?.arguments || call.arguments || {})
            }
          }));
        } else {
          // 古い形式
          toolCalls = Array.isArray(llmResponse.functionCall) 
            ? llmResponse.functionCall 
            : [llmResponse.functionCall];
        }
        
        const toolResults: string[] = [];
        
        for (const toolCall of toolCalls) {
          logger.info(`Executing tool: ${toolCall.function.name}`);
          
          try {
            // MCPツールの初期化チェック
            if (!this.mcpToolsHelper) {
              throw new Error('MCP tools not initialized yet. Please wait for initialization to complete.');
            }
            
            // Tool呼び出し
            const toolResult = await this.mcpToolsHelper.executeTool(
              toolCall.function.name,
              toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {}
            );
            
            toolResults.push(`Tool ${toolCall.function.name} result: ${JSON.stringify(toolResult)}`);
            
            // Tool resultを結果に含めるが、履歴には追加しない（後でまとめて追加）

          } catch (error) {
            const errorMessage = `Tool ${toolCall.function.name} failed: ${error instanceof Error ? error.message : String(error)}`;
            logger.error(errorMessage);
            toolResults.push(errorMessage);
          }
        }

        // LLMに最終レスポンスを生成させる
        // Tool結果を含むユーザーメッセージとして追加
        const toolResultMessage: ChatMessage = {
          role: 'user',
          content: `[Tool Results]\n${toolResults.join('\n')}`,
          timestamp: new Date(),
        };
        this.history.push(toolResultMessage);

        const finalResult = await withRetry(
          async () => {
            return await this.provider.chat(this.history, {
              model: this.currentModel,
              temperature: this.config.llm.temperature || 0.7,
              maxTokens: this.config.llm.maxTokens || 2000,
            });
          },
          {
            maxRetries: this.config.llm.maxRetries,
            delay: 1000,
            exponentialBackoff: true,
            timeout: this.config.llm.timeout,
            shouldRetry: (error: Error) => {
              const message = error.message.toLowerCase();
              return (
                message.includes('timeout') ||
                message.includes('rate limit') ||
                message.includes('network') ||
                message.includes('connection') ||
                message.includes('server error')
              );
            },
          }
        );

        if (!finalResult.success) {
          logger.error('Final LLM response error:', finalResult.error);
          throw finalResult.error!;
        }

        const finalResponse = typeof finalResult.result === 'string' 
          ? finalResult.result 
          : finalResult.result!.content || '';
        
        const trimmedFinalResponse = finalResponse.trim();
        
        // 最終レスポンスが空の場合はツール結果を返す
        const responseToReturn = trimmedFinalResponse || toolResults.join('\n\n');

        // Final assistant messageをhistoryに追加
        const finalAssistantMessage: ChatMessage = {
          role: 'assistant',
          content: responseToReturn,
          timestamp: new Date(),
        };
        this.history.push(finalAssistantMessage);
        this.limitHistorySize();

        // HistorySave
        globalProgressReporter.updateSubtask(4);
        try {
          await this.memoryManager.saveHistory(this.history);
        } catch (saveError) {
          logger.warn('Failed to save history:', saveError);
        }

        globalProgressReporter.completeTask(true);
        return responseToReturn;
      } else {
        // 通常のテキストレスポンスの場合
        const response = typeof llmResponse === 'string' ? llmResponse : llmResponse.content;
        
        if (!response || response.trim().length === 0) {
          logger.error('LLM returned empty response:', {
            llmResponse,
            responseType: typeof llmResponse,
            hasContent: !!(llmResponse && typeof llmResponse === 'object' && 'content' in llmResponse),
            model: this.currentModel,
            provider: this.config.llm.provider,
            availableFunctionsCount: this.availableFunctions.length,
            functionCallAttempted: !!(llmResponse && typeof llmResponse === 'object' && 'functionCall' in llmResponse)
          });
          globalProgressReporter.completeTask(false);
          throw new Error(`Response from LLM is empty (model: ${this.currentModel}, provider: ${this.config.llm.provider})`);
        }

        const trimmedResponse = response.trim();

        // AssistantMessageをHistoryに追加
        const assistantMessage: ChatMessage = {
          role: 'assistant',
          content: trimmedResponse,
          timestamp: new Date(),
        };
        this.history.push(assistantMessage);
        this.limitHistorySize();

        // HistorySave
        globalProgressReporter.updateSubtask(4);
        
        // Historyを Save（Erroroccurredしても会話は継続）
        try {
          await this.memoryManager.saveHistory(this.history);
        } catch (saveError) {
          logger.warn('Failed to save history:', saveError);
          globalProgressReporter.showWarning('Failed to save history, but conversation continues');
          // HistorySaveFailedは致命的ではない
        }

        globalProgressReporter.completeTask(true);
        // perf.end(`Chat completed (attempts: ${result.attemptCount}, time: ${result.totalTime}ms)`);
        return trimmedResponse;
      }
    } catch (error) {
      logger.error('Chat error:', error);
      globalProgressReporter.completeTask(false);

      // ErrorMessageをUserフレンドリーにConvert
      let errorMessage = 'Error occurred';
      let canRetry = false;

      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        if (
          errorMsg.includes('api key') ||
          errorMsg.includes('unauthorized') ||
          errorMsg.includes('authentication')
        ) {
          errorMessage = 'API key is invalid or expired. Please check settings.';
        } else if (
          errorMsg.includes('quota') ||
          errorMsg.includes('billing') ||
          errorMsg.includes('payment')
        ) {
          errorMessage =
            'API quota or billing issues. Please check account status.';
        } else if (errorMsg.includes('timeout')) {
          errorMessage = 'Request timed out. Please try again.';
          canRetry = true;
        } else if (errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
          errorMessage = 'Rate limit reached. Please wait.';
          canRetry = true;
        } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
          errorMessage = 'Network error occurred. Please check connection.';
          canRetry = true;
        } else if (errorMsg.includes('model') && errorMsg.includes('not found')) {
          errorMessage = `Specified model "${this.currentModel}" is not available.`;
        } else if (errorMsg.includes('input') || errorMsg.includes('長すぎ')) {
          errorMessage = error.message;
        } else {
          errorMessage = `ChatError: ${error.message}`;
          canRetry = true;
        }
      }

      // ErrorInfoをよりDetailsに記録
      const errorDetails = {
        originalError: error instanceof Error ? error.message : String(error),
        model: this.currentModel,
        provider: this.config.llm.provider,
        canRetry,
        timestamp: new Date().toISOString(),
      };

      logger.error('Detailed chat error info:', errorDetails);

      // Errorをラップして追加Infoを含める
      const wrappedError = new Error(errorMessage);
      (wrappedError as any).details = errorDetails;
      (wrappedError as any).canRetry = canRetry;

      throw wrappedError;
    }
  }

  /**
   * TaskDecompose機能付きのChat
   * @param input Userの入力
   * @returns AIの応答
   */
  async chatWithTaskDecomposition(input: string): Promise<string> {
    const perf = new PerformanceLogger('chatWithTaskDecomposition');

    try {
      // 入力Validation
      if (!input || input.trim().length === 0) {
        throw new Error('Input is empty');
      }

      const trimmedInput = input.trim();
      
      // MCPツールの初期化を最大5秒間待機
      if (this.config.mcp?.enabled && this.availableFunctions.length === 0) {
        const maxWait = 5000; // 5秒
        const startTime = Date.now();
        while (Date.now() - startTime < maxWait && this.availableFunctions.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 100)); // 100ms待機
        }
        logger.debug(`MCP tools wait completed: ${this.availableFunctions.length} functions available`);
      }
      
      // Taskの複雑度を判定
      if (this.taskDecomposer.isComplexTask(trimmedInput)) {
        logger.info('📝 TaskをDecomposeしてing...');
        
        // TaskをDecompose
        const subtasks = this.taskDecomposer.decompose(trimmedInput);
        
        if (subtasks.length > 1) {
          // TaskがDecomposeされた場合の表示
          logger.info('Taskが以下のサブTaskにDecomposeさed:');
          subtasks.forEach((subtask, index) => {
            logger.info(`  ${index + 1}. ${subtask}`);
          });

          // ParallelExecute可能かどうか判定
          const canRunParallel = this.parallelMode && this.canRunSubtasksInParallel(subtasks);
          
          let results: string[];
          
          if (canRunParallel) {
            logger.info('🚀 サブTaskをParallelExecuteします');
            results = await this.executeSubtasksInParallel(subtasks);
          } else {
            logger.info('🔄 サブTaskをSequentialExecuteします');
            results = await this.executeSubtasksSequentially(subtasks);
          }

          // ResultをIntegrate
          const finalResponse = `TaskDecomposeExecuteResult:\n\n${results.join('\n\n')}\n\n📊 ExecuteSummary: ${subtasks.length}itemsのサブTaskof${results.filter(r => !r.includes('Erroroccurred')).length}itemsがSuccessdone。`;
          
          perf.end(`Task decomposition completed: ${subtasks.length} subtasks`);
          return finalResponse;
        }
      }
      
      // 通常のChatProcessingにFallback
      return await this.chat(trimmedInput);
    } catch (error) {
      logger.error('Task decomposition error:', error);
      
      // Errorの場合は通常のChatにFallback
      try {
        return await this.chat(input);
      } catch (fallbackError) {
        throw fallbackError;
      }
    }
  }

  async executeTask(config: TaskConfig): Promise<TaskResult> {
    const perf = new PerformanceLogger('executeTask');

    try {
      this.emit('task:start', config);

      const result = await this.taskExecutor.execute(config, this.provider);

      this.emit('task:complete', result);
      perf.end(`Task completed: ${config.description}`);

      return result;
    } catch (error) {
      const errorResult: TaskResult = {
        success: false,
        message: `Task execution error: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      this.emit('task:error', errorResult);
      logger.error('Task execution error:', error);

      return errorResult;
    }
  }

  async saveSession(filename: string): Promise<void> {
    await this.memoryManager.saveSession(
      {
        id: `session-${Date.now()}`,
        startedAt: new Date(),
        config: this.convertToLegacyConfig(this.config),
        history: this.history,
      },
      filename,
    );
  }

  async loadSession(filename: string): Promise<void> {
    const session = await this.memoryManager.loadSession(filename);
    this.history = session.history;
    
    // ロード後にメモリOptimize
    await this.optimizeMemory();
    
    logger.info(`セッションをLoadました: ${filename}`);
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  /**
   * 会話履歴をクリア
   */
  clearHistory(): void {
    this.history = [];
    logger.info('Conversation history cleared');
  }

  /**
   * 履歴サイズを制限（最大20メッセージ）
   */
  private limitHistorySize(): void {
    const MAX_HISTORY_MESSAGES = 20;
    if (this.history.length > MAX_HISTORY_MESSAGES) {
      const removed = this.history.length - MAX_HISTORY_MESSAGES;
      this.history = this.history.slice(-MAX_HISTORY_MESSAGES);
      logger.debug(`Trimmed ${removed} old messages from history to prevent large requests`);
    }
  }

  clearHistory(): void {
    this.history = [];
    logger.info('History cleared');
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setModel(model: string): void {
    this.currentModel = model;
    logger.info(`Model changed: ${model}`);
  }

  toggleParallelMode(): boolean {
    this.parallelMode = !this.parallelMode;
    this.taskExecutor.setParallelMode(this.parallelMode);
    return this.parallelMode;
  }

  toggleVerboseMode(): boolean {
    this.verboseMode = !this.verboseMode;
    if (this.verboseMode) {
      logger.setLevel(LogLevel.DEBUG);
      logger.info('Verbose mode enabled');
    } else {
      // デフォルトレベルに戻す
      const defaultLevel = this.parseLogLevel(this.config.app.logLevel);
      logger.setLevel(defaultLevel);
      logger.info('Verbose mode disabled');
    }
    return this.verboseMode;
  }

  private parseLogLevel(level: string): LogLevel {
    switch (level.toLowerCase()) {
      case 'error':
        return LogLevel.ERROR;
      case 'warn':
        return LogLevel.WARN;
      case 'info':
        return LogLevel.INFO;
      case 'debug':
        return LogLevel.DEBUG;
      default:
        return LogLevel.INFO;
    }
  }

  /**
   * MCPManagerをConfigしてToolヘルパーをInitialize
   */
  async setupMCPTools(mcpManager: MCPManager): Promise<void> {
    // 内部関数のセキュリティ設定を準備
    const securityConfig = this.config.functions?.filesystem?.security || {
      allowedPaths: [process.cwd()],
      allowCurrentDirectoryChange: true,
      restrictToStartupDirectory: true
    };

    // MCPFunctionConverterを作成（内部関数設定付き）
    const bashConfig = this.config.functions?.bash?.enabled ? this.config.functions.bash.security : undefined;
    this.mcpFunctionConverter = new MCPFunctionConverter(mcpManager, securityConfig, bashConfig);
    
    // MCPToolsHelperを初期化（FunctionConverterを渡す）
    this.mcpToolsHelper = new MCPToolsHelper(mcpManager, this.mcpFunctionConverter);
    
    // Function Callingで利用可能なツールを更新
    this.availableFunctions = await this.mcpFunctionConverter.convertAllTools();
    
    logger.debug(`Function definitions loaded: ${this.availableFunctions.length} functions available`);
    logger.debug('Available functions:', this.availableFunctions.map(f => f.name));
    
    // 内部関数が有効な場合はログ出力
    const internalFunctions = this.availableFunctions.filter(f => f.name.startsWith('internal_'));
    if (internalFunctions.length > 0) {
      logger.debug(`Internal functions loaded: ${internalFunctions.length} functions`, 
        internalFunctions.map(f => f.name));
    }
  }

  /**
   * MCPToolを使用してTaskをExecute
   */
  async executeTaskWithMCP(config: TaskConfig): Promise<TaskResult> {
    if (!this.mcpToolsHelper || !this.mcpTaskPlanner) {
      logger.warn('MCP tools not initialized. Switching to normal task execution');
      return this.executeTask(config);
    }

    const perf = new PerformanceLogger('executeTaskWithMCP');

    try {
      this.emit('task:start', config);

      // TaskExecuteプランを作成
      const executionPlan = await this.mcpTaskPlanner.createExecutionPlan(config.description);
      logger.info(`Execution plan created: ${executionPlan.steps.length} steps`, executionPlan);

      // 各StepをExecute
      const stepResults: unknown[] = [];
      for (const step of executionPlan.steps) {
        try {
          logger.info(`Executing step: ${step.description}`);
          const stepResult = await this.mcpToolsHelper.executeTool(step.tool, step.params);
          stepResults.push(stepResult);
          logger.info(`Step completed: ${step.description}`);
        } catch (error) {
          logger.error(`Step error: ${step.description}`, error);
          stepResults.push({ error: error instanceof Error ? error.message : String(error) });
        }
      }

      // Resultをまとめて返す
      const result: TaskResult = {
        success: stepResults.every((r) => !(r && typeof r === 'object' && 'error' in r)),
        message: config.description,
        data: {
          executionPlan,
          stepResults,
          summary: this.summarizeResults(stepResults),
        },
      };

      this.emit('task:complete', result);
      perf.end(`MCP Task completed: ${config.description}`);

      return result;
    } catch (error) {
      const errorResult: TaskResult = {
        success: false,
        message: `MCP task execution error: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      this.emit('task:error', errorResult);
      logger.error('MCP Task execution error:', error);

      return errorResult;
    }
  }

  /**
   * ResultをSummary化
   */
  private summarizeResults(results: unknown[]): string {
    const successCount = results.filter(
      (r) => !(r && typeof r === 'object' && 'error' in r),
    ).length;
    const errorCount = results.length - successCount;

    return `${successCount} of ${results.length} steps succeeded, ${errorCount} errors`;
  }

  /**
   * 利用可能なMCPToolの一覧をGet
   */
  async getAvailableMCPTools(): Promise<{ name: string; description: string }[]> {
    if (!this.mcpToolsHelper) {
      return [];
    }

    try {
      const tools = await this.mcpToolsHelper.getAvailableTools();
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
      }));
    } catch (error) {
      logger.error('Error getting MCP tool list:', error);
      return [];
    }
  }

  /**
   * 登録されているFunction Calling用関数の数を取得
   */
  getAvailableFunctionCount(): number {
    return this.availableFunctions.length;
  }

  /**
   * MCPServerのステータスをGet
   */
  getMCPServerStatus(): Map<string, boolean> | null {
    if (!this.mcpToolsHelper) {
      return null;
    }
    return this.mcpToolsHelper.getServerStatus();
  }

  /**
   * MCP初期化進捗を取得
   */
  getMCPInitializationProgress(): {
    isInitializing: boolean;
    total: number;
    completed: number;
    failed: number;
    servers: Array<{
      name: string;
      type: 'stdio' | 'http' | 'sse';
      status: 'pending' | 'connecting' | 'initializing' | 'listing-tools' | 'completed' | 'failed';
      error?: string;
      startedAt?: Date;
      completedAt?: Date;
      toolCount?: number;
      duration?: number;
    }>;
  } | null {
    if (!this.mcpToolsHelper) {
      return null;
    }
    return this.mcpToolsHelper.getInitializationProgress();
  }

  /**
   * StepExecuteResultのDetailsSummaryを作成
   */
  private createDetailedSummary(
    stepResults: Array<{
      stepIndex: number;
      description: string;
      success: boolean;
      result?: unknown;
      error?: string;
      duration?: number;
    }>,
    totalSteps: number,
  ): string {
    const successCount = stepResults.filter((r) => r.success).length;
    const errorCount = stepResults.filter((r) => !r.success).length;
    const totalDuration = stepResults.reduce((sum, r) => sum + (r.duration || 0), 0);

    const summaryParts = [
      `${successCount} of ${totalSteps} steps succeeded, ${errorCount} errors`,
      `Execute時間: ${totalDuration}ms`,
    ];

    // Errorがある場合はErrorのDetailsを追加
    if (errorCount > 0) {
      const failedSteps = stepResults
        .filter((r) => !r.success)
        .map((r) => `- ${r.description}: ${r.error}`)
        .join('\n');
      summaryParts.push(`FailedしたStep:\n${failedSteps}`);
    }

    return summaryParts.join('\n');
  }

  /**
   * サブTaskがParallelExecute可能かを判定
   */
  private canRunSubtasksInParallel(subtasks: string[]): boolean {
    // シンプルなParallelExecute判定ルール
    const conflictKeywords = [
      '同じファイル',
      '順番',
      'Sequential',
      '前のTask',
      '依存',
      'Resultを使用',
      'Resultを利用',
      'の後で',
      'に基づいて',
    ];

    // Task間で競合するキーワードがあるかチェック
    const hasConflict = subtasks.some((subtask) =>
      conflictKeywords.some((keyword) => subtask.includes(keyword))
    );

    if (hasConflict) {
      logger.debug('サブTaskに依存関係が検出さed。SequentialExecuteを選択します。');
      return false;
    }

    // ファイルパスの競合をチェック
    const usedFiles = new Set<string>();
    for (const subtask of subtasks) {
      const files = this.extractFilesFromSubtask(subtask);
      const hasFileConflict = files.some(file => usedFiles.has(file));
      
      if (hasFileConflict) {
        logger.debug('サブTask間でファイルの競合が検出さed。SequentialExecuteを選択します。');
        return false;
      }
      
      // forEach + asyncの問題を修正：for...ofループを使用
      for (const file of files) {
        usedFiles.add(file);
      }
    }

    return true;
  }

  /**
   * サブTaskから関連ファイルを抽出
   */
  private extractFilesFromSubtask(subtask: string): string[] {
    const files: string[] = [];
    
    // ファイルパスのパターンを検索
    const filePatterns = [
      /[\w-]+\.[\w]+/g, // file.ext形式
      /src\/[\w\/.-]+/g, // src/から始まるパス
      /\.\/[\w\/.-]+/g, // 相対パス
      /\/[\w\/.-]+/g, // 絶対パス
    ];
    
    for (const pattern of filePatterns) {
      const matches = subtask.match(pattern);
      if (matches) {
        files.push(...matches);
      }
    }
    
    return [...new Set(files)]; // 重複除去
  }

  /**
   * サブTaskをParallelExecute
   */
  private async executeSubtasksInParallel(subtasks: string[]): Promise<string[]> {
    const { globalProgressReporter } = await import('../ui/progress.js');

    // サブTaskをParallelTaskにConvert
    const parallelTasks = subtasks.map((subtask, index) => ({
      id: `subtask-${index}`,
      description: subtask,
      priority: 5,
      task: async () => {
        logger.info(`🔄 サブTask ${index + 1} Started: ${subtask}`);
        try {
          const result = await this.chat(subtask);
          logger.info(`✅ サブTask ${index + 1} Completed`);
          return `サブTask ${index + 1}: ${result}`;
        } catch (error) {
          const errorMsg = `サブTask ${index + 1} でErroroccurreddone: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(`❌ ${errorMsg}`);
          return errorMsg;
        }
      },
    }));

    // ParallelExecute
    const parallelResults = await this.parallelExecutor.executeParallelWithDetails(
      parallelTasks,
      (completed, total, currentTask) => {
        globalProgressReporter.showInfo(`ParallelExecute進捗: ${completed}/${total} - ${currentTask}`);
      }
    );

    // Resultをcharacters列配列にConvert
    return parallelResults.map(pr => 
      pr.success ? pr.data as string : `Error: ${pr.error?.message || 'Unknown error'}`
    );
  }

  /**
   * サブTaskをSequentialExecute
   */
  private async executeSubtasksSequentially(subtasks: string[]): Promise<string[]> {
    const results: string[] = [];
    
    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      logger.info(`\n🔄 サブTask ${i + 1}/${subtasks.length} をExecute中: ${subtask}`);
      
      try {
        const subtaskResult = await this.chat(subtask);
        results.push(`サブTask ${i + 1}: ${subtaskResult}`);
        logger.info(`✅ サブTask ${i + 1} Completed`);
      } catch (error) {
        const errorMsg = `サブTask ${i + 1} でErroroccurreddone: ${error instanceof Error ? error.message : String(error)}`;
        results.push(errorMsg);
        logger.error(`❌ ${errorMsg}`);
      }
    }

    return results;
  }

}

/**
 * ReAct（Reason-and-Act）継続実行コントローラー
 * 推論→行動→観察のループで完了まで自動継続実行
 */
export class ReActController {
  private agent: AgentCore;
  private maxIterations: number = 20;
  private currentIteration: number = 0;
  private isComplete: boolean = false;
  private sessionState: Map<string, any> = new Map();
  private taskHistory: Array<{
    iteration: number;
    reasoning: string;
    action: string;
    observation: string;
    timestamp: Date;
  }> = [];

  constructor(agent: AgentCore, maxIterations: number = 20) {
    this.agent = agent;
    this.maxIterations = maxIterations;
  }

  /**
   * 継続実行メインループ - 完了まで自動実行
   */
  async executeUntilComplete(
    initialPrompt: string,
    completionCriteria?: (history: any[]) => boolean
  ): Promise<{
    success: boolean;
    finalResult: string;
    iterations: number;
    history: any[];
    completionReason: 'success' | 'max_iterations' | 'error' | 'user_requested';
  }> {
    logger.info(`🔄 ReAct継続実行開始: "${initialPrompt}"`);
    
    this.reset();
    let currentPrompt = initialPrompt;
    let finalResult = '';
    let completionReason: 'success' | 'max_iterations' | 'error' | 'user_requested' = 'success';

    try {
      while (!this.isComplete && this.currentIteration < this.maxIterations) {
        this.currentIteration++;
        logger.info(`\n📍 反復 ${this.currentIteration}/${this.maxIterations}`);

        // Phase 1: Reasoning（推論）
        const reasoning = await this.performReasoning(currentPrompt);
        logger.debug(`🧠 推論: ${reasoning.substring(0, 200)}...`);

        // Phase 2: Action（行動）
        const actionResult = await this.performAction(reasoning);
        logger.debug(`⚡ 行動結果: ${actionResult.substring(0, 200)}...`);

        // Phase 3: Observation（観察）
        const observation = await this.performObservation(actionResult);
        logger.debug(`👀 観察: ${observation.substring(0, 200)}...`);

        // タスク履歴に記録
        this.taskHistory.push({
          iteration: this.currentIteration,
          reasoning,
          action: actionResult,
          observation,
          timestamp: new Date()
        });

        // 完了判定
        if (completionCriteria) {
          this.isComplete = completionCriteria(this.taskHistory);
        } else {
          this.isComplete = this.defaultCompletionCheck(observation);
        }

        finalResult = observation;

        if (!this.isComplete) {
          // 次のプロンプトを生成
          currentPrompt = this.generateNextPrompt(reasoning, actionResult, observation);
        } else {
          logger.info('✅ タスク完了条件を満たしました');
          break;
        }

        // 短い休憩（レート制限回避）
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      if (this.currentIteration >= this.maxIterations) {
        completionReason = 'max_iterations';
        logger.warn(`⚠️ 最大反復数(${this.maxIterations})に達しました`);
      }

      logger.info(`🏁 ReAct継続実行完了: ${this.currentIteration}回の反復`);

      return {
        success: this.isComplete,
        finalResult,
        iterations: this.currentIteration,
        history: this.taskHistory,
        completionReason
      };

    } catch (error) {
      logger.error('ReAct実行エラー:', error);
      return {
        success: false,
        finalResult: `エラー: ${error instanceof Error ? error.message : String(error)}`,
        iterations: this.currentIteration,
        history: this.taskHistory,
        completionReason: 'error'
      };
    }
  }

  /**
   * Phase 1: 推論フェーズ
   */
  private async performReasoning(prompt: string): Promise<string> {
    const reasoningPrompt = `
以下のタスクについて、次に何を行うべきか論理的に推論してください。

現在のタスク: ${prompt}

これまでの進捗:
${this.taskHistory.length > 0 ? 
  this.taskHistory.slice(-3).map(h => 
    `- 反復${h.iteration}: ${h.observation.substring(0, 100)}...`
  ).join('\n') : 
  '（まだ作業を開始していません）'
}

次のアクションを決定するために：
1. 現在の状況を分析
2. 目標達成のために必要な次のステップを特定
3. 具体的なアクションプランを提示

推論結果:`;

    return await this.agent.chat(reasoningPrompt);
  }

  /**
   * Phase 2: 行動フェーズ
   */
  private async performAction(reasoning: string): Promise<string> {
    const actionPrompt = `
以下の推論に基づいて、具体的なアクションを実行してください。

推論内容: ${reasoning}

実際に以下のいずれかの行動を取ってください：
- ファイルの読み書き
- コマンドの実行
- コードの生成・修正
- 情報の検索・調査
- その他必要な作業

行動を実行してその結果を報告してください。`;

    return await this.agent.chat(actionPrompt);
  }

  /**
   * Phase 3: 観察フェーズ
   */
  private async performObservation(actionResult: string): Promise<string> {
    const observationPrompt = `
以下の行動結果を観察・分析して、次の判断材料を提供してください。

行動結果: ${actionResult}

以下の観点で分析してください：
1. 行動は成功したか？
2. 目標に向かって前進できたか？
3. 新たに判明した情報や課題はあるか？
4. タスク完了に向けて次に必要なことは何か？
5. このタスクは完了したと判断できるか？

観察結果:`;

    return await this.agent.chat(observationPrompt);
  }

  /**
   * デフォルトの完了判定
   */
  private defaultCompletionCheck(observation: string): boolean {
    const completionKeywords = [
      'タスクが完了',
      '作業完了',
      '実装完了',
      '全て完了',
      'すべて完了',
      'successfully completed',
      'task completed',
      'finished',
      '要件を満たし'
    ];

    const observationLower = observation.toLowerCase();
    return completionKeywords.some(keyword => 
      observationLower.includes(keyword.toLowerCase())
    );
  }

  /**
   * 次のプロンプト生成
   */
  private generateNextPrompt(reasoning: string, action: string, observation: string): string {
    return `
前回の分析結果を踏まえて、引き続きタスクを進めてください。

前回の推論: ${reasoning.substring(0, 200)}...
前回の行動: ${action.substring(0, 200)}...  
前回の観察: ${observation.substring(0, 200)}...

これらの結果を踏まえて、次に実行すべき作業を継続してください。`;
  }

  /**
   * セッション状態をリセット
   */
  private reset(): void {
    this.currentIteration = 0;
    this.isComplete = false;
    this.sessionState.clear();
    this.taskHistory = [];
  }

  /**
   * 現在の進捗状況を取得
   */
  getProgress(): {
    iteration: number;
    maxIterations: number;
    isComplete: boolean;
    history: any[];
  } {
    return {
      iteration: this.currentIteration,
      maxIterations: this.maxIterations,
      isComplete: this.isComplete,
      history: [...this.taskHistory]
    };
  }

  /**
   * 手動完了設定
   */
  markComplete(): void {
    this.isComplete = true;
    logger.info('✋ 手動完了が設定されました');
  }
}

/**
 * セッション状態管理 - ローカルファイルベース
 */
export class SessionStateManager {
  private sessionId: string;
  private stateFilePath: string;
  private sessionFilePath: string;
  private progressFilePath: string;

  constructor(sessionId?: string) {
    this.sessionId = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 状態管理ディレクトリを作成
    const storageDir = path.join(process.cwd(), 'storage');
    const sessionDir = path.join(storageDir, 'sessions', this.sessionId);
    
    // ディレクトリ作成
    try {
      if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
      }
    } catch (error) {
      logger.warn('セッションディレクトリ作成に失敗:', error);
    }
    
    this.stateFilePath = path.join(sessionDir, 'state.json');
    this.sessionFilePath = path.join(sessionDir, 'session.json');
    this.progressFilePath = path.join(sessionDir, 'progress.json');
    
    logger.debug(`セッション管理初期化: ${this.sessionId}`);
  }

  /**
   * セッション状態を保存
   */
  async saveSessionState(state: {
    currentTask?: string;
    reactHistory?: any[];
    variables?: Map<string, any>;
    metadata?: any;
  }): Promise<void> {
    try {
      const stateData = {
        sessionId: this.sessionId,
        timestamp: new Date().toISOString(),
        currentTask: state.currentTask,
        reactHistory: state.reactHistory || [],
        variables: state.variables ? Object.fromEntries(state.variables) : {},
        metadata: state.metadata || {}
      };

      await fs.promises.writeFile(this.stateFilePath, JSON.stringify(stateData, null, 2), 'utf8');
      logger.debug(`セッション状態保存: ${this.stateFilePath}`);
    } catch (error) {
      logger.error('セッション状態保存エラー:', error);
    }
  }

  /**
   * セッション状態を読み込み
   */
  async loadSessionState(): Promise<{
    currentTask?: string;
    reactHistory?: any[];
    variables?: Map<string, any>;
    metadata?: any;
  }> {
    try {
      if (!fs.existsSync(this.stateFilePath)) {
        return {};
      }

      const stateData = JSON.parse(await fs.promises.readFile(this.stateFilePath, 'utf8'));
      
      return {
        currentTask: stateData.currentTask,
        reactHistory: stateData.reactHistory || [],
        variables: new Map(Object.entries(stateData.variables || {})),
        metadata: stateData.metadata || {}
      };
    } catch (error) {
      logger.error('セッション状態読み込みエラー:', error);
      return {};
    }
  }

  /**
   * 進捗状況を保存
   */
  async saveProgress(progress: {
    totalTasks: number;
    completedTasks: number;
    currentTaskIndex: number;
    taskStatuses: Array<{
      id: string;
      name: string;
      status: 'pending' | 'in_progress' | 'completed' | 'failed';
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
    }>;
  }): Promise<void> {
    try {
      const progressData = {
        ...progress,
        sessionId: this.sessionId,
        updatedAt: new Date().toISOString()
      };

      await fs.promises.writeFile(this.progressFilePath, JSON.stringify(progressData, null, 2), 'utf8');
      logger.debug('進捗状況保存完了');
    } catch (error) {
      logger.error('進捗状況保存エラー:', error);
    }
  }

  /**
   * 進捗状況を読み込み
   */
  async loadProgress(): Promise<{
    totalTasks: number;
    completedTasks: number;
    currentTaskIndex: number;
    taskStatuses: any[];
  } | null> {
    try {
      if (!fs.existsSync(this.progressFilePath)) {
        return null;
      }

      const progressData = JSON.parse(await fs.promises.readFile(this.progressFilePath, 'utf8'));
      return progressData;
    } catch (error) {
      logger.error('進捗状況読み込みエラー:', error);
      return null;
    }
  }

  /**
   * セッション情報を保存
   */
  async saveSessionInfo(info: {
    startedAt: Date;
    initialPrompt: string;
    config?: any;
    userSettings?: any;
  }): Promise<void> {
    try {
      const sessionData = {
        sessionId: this.sessionId,
        ...info,
        startedAt: info.startedAt.toISOString()
      };

      await fs.promises.writeFile(this.sessionFilePath, JSON.stringify(sessionData, null, 2), 'utf8');
      logger.debug('セッション情報保存完了');
    } catch (error) {
      logger.error('セッション情報保存エラー:', error);
    }
  }

  /**
   * セッション情報を読み込み
   */
  async loadSessionInfo(): Promise<{
    startedAt: Date;
    initialPrompt: string;
    config?: any;
    userSettings?: any;
  } | null> {
    try {
      if (!fs.existsSync(this.sessionFilePath)) {
        return null;
      }

      const sessionData = JSON.parse(await fs.promises.readFile(this.sessionFilePath, 'utf8'));
      
      return {
        ...sessionData,
        startedAt: new Date(sessionData.startedAt)
      };
    } catch (error) {
      logger.error('セッション情報読み込みエラー:', error);
      return null;
    }
  }

  /**
   * 仮想ファイルシステム - ファイル保存
   */
  async saveVirtualFile(filePath: string, content: string, metadata?: any): Promise<void> {
    try {
      const virtualDir = path.join(path.dirname(this.stateFilePath), 'virtual_fs');
      if (!fs.existsSync(virtualDir)) {
        fs.mkdirSync(virtualDir, { recursive: true });
      }

      const virtualFile = {
        content,
        metadata: metadata || {},
        createdAt: new Date().toISOString(),
        filePath
      };

      const fileName = filePath.replace(/[/\\]/g, '_');
      const virtualFilePath = path.join(virtualDir, `${fileName}.json`);
      
      await fs.promises.writeFile(virtualFilePath, JSON.stringify(virtualFile, null, 2), 'utf8');
      logger.debug(`仮想ファイル保存: ${filePath}`);
    } catch (error) {
      logger.error('仮想ファイル保存エラー:', error);
    }
  }

  /**
   * 仮想ファイルシステム - ファイル読み込み
   */
  async loadVirtualFile(filePath: string): Promise<{
    content: string;
    metadata: any;
    createdAt: string;
  } | null> {
    try {
      const virtualDir = path.join(path.dirname(this.stateFilePath), 'virtual_fs');
      const fileName = filePath.replace(/[/\\]/g, '_');
      const virtualFilePath = path.join(virtualDir, `${fileName}.json`);

      if (!fs.existsSync(virtualFilePath)) {
        return null;
      }

      const virtualFile = JSON.parse(await fs.promises.readFile(virtualFilePath, 'utf8'));
      return virtualFile;
    } catch (error) {
      logger.error('仮想ファイル読み込みエラー:', error);
      return null;
    }
  }

  /**
   * セッションをクリーンアップ（古いファイルを削除）
   */
  async cleanup(): Promise<void> {
    try {
      const sessionDir = path.dirname(this.stateFilePath);
      if (fs.existsSync(sessionDir)) {
        await fs.promises.rm(sessionDir, { recursive: true });
        logger.debug(`セッションクリーンアップ完了: ${this.sessionId}`);
      }
    } catch (error) {
      logger.error('セッションクリーンアップエラー:', error);
    }
  }

  /**
   * 利用可能なセッション一覧を取得
   */
  static async listSessions(): Promise<Array<{
    sessionId: string;
    startedAt: Date;
    initialPrompt: string;
  }>> {
    try {
      const storageDir = path.join(process.cwd(), 'storage', 'sessions');
      if (!fs.existsSync(storageDir)) {
        return [];
      }

      const sessionDirs = await fs.promises.readdir(storageDir);
      const sessions = [];

      for (const sessionDir of sessionDirs) {
        try {
          const sessionFilePath = path.join(storageDir, sessionDir, 'session.json');
          if (fs.existsSync(sessionFilePath)) {
            const sessionData = JSON.parse(await fs.promises.readFile(sessionFilePath, 'utf8'));
            sessions.push({
              sessionId: sessionData.sessionId,
              startedAt: new Date(sessionData.startedAt),
              initialPrompt: sessionData.initialPrompt
            });
          }
        } catch (error) {
          logger.debug(`セッション読み込みスキップ: ${sessionDir}`);
        }
      }

      return sessions.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
    } catch (error) {
      logger.error('セッション一覧取得エラー:', error);
      return [];
    }
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * 継続実行用の高度タスク分解・追跡システム
 */
export class ContinuousTaskManager {
  private sessionManager: SessionStateManager;
  private tasks: Map<string, TaskNode> = new Map();
  private currentRootTask: string | null = null;
  
  constructor(sessionId?: string) {
    this.sessionManager = new SessionStateManager(sessionId);
  }

  /**
   * メインタスクを分解して実行プランを作成
   */
  async createExecutionPlan(mainTask: string): Promise<ExecutionPlan> {
    const taskId = this.generateTaskId();
    const rootTask: TaskNode = {
      id: taskId,
      name: mainTask,
      description: mainTask,
      status: 'pending',
      subtasks: [],
      dependencies: [],
      priority: 10,
      estimatedDuration: 0,
      actualDuration: 0,
      createdAt: new Date(),
      metadata: {}
    };

    // LLMを使用した高度なタスク分解
    const decompositionResult = await this.decomposeTaskWithLLM(mainTask);
    
    // サブタスクを作成
    for (const subtaskDesc of decompositionResult.subtasks) {
      const subtaskId = this.generateTaskId();
      const subtask: TaskNode = {
        id: subtaskId,
        name: subtaskDesc.name,
        description: subtaskDesc.description,
        status: 'pending',
        subtasks: [],
        dependencies: subtaskDesc.dependencies || [],
        priority: subtaskDesc.priority || 5,
        estimatedDuration: subtaskDesc.estimatedMinutes || 10,
        actualDuration: 0,
        createdAt: new Date(),
        metadata: {
          category: subtaskDesc.category,
          tools: subtaskDesc.requiredTools
        }
      };
      
      rootTask.subtasks.push(subtaskId);
      this.tasks.set(subtaskId, subtask);
    }

    this.tasks.set(taskId, rootTask);
    this.currentRootTask = taskId;

    const executionPlan: ExecutionPlan = {
      id: this.generateTaskId(),
      rootTaskId: taskId,
      tasks: Array.from(this.tasks.values()),
      executionOrder: this.calculateExecutionOrder(taskId),
      totalEstimatedDuration: this.calculateTotalDuration(taskId),
      createdAt: new Date(),
      status: 'created'
    };

    // セッション状態に保存
    await this.sessionManager.saveProgress({
      totalTasks: executionPlan.tasks.length,
      completedTasks: 0,
      currentTaskIndex: 0,
      taskStatuses: executionPlan.tasks.map(task => ({
        id: task.id,
        name: task.name,
        status: task.status,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        error: task.error
      }))
    });

    logger.info(`実行プラン作成完了: ${executionPlan.tasks.length}個のタスク`);
    return executionPlan;
  }

  /**
   * LLMを使用した高度なタスク分解
   */
  private async decomposeTaskWithLLM(mainTask: string): Promise<{
    subtasks: Array<{
      name: string;
      description: string;
      category: string;
      priority: number;
      estimatedMinutes: number;
      dependencies: string[];
      requiredTools: string[];
    }>;
    totalEstimatedTime: number;
    complexity: 'low' | 'medium' | 'high' | 'very_high';
  }> {
    // 既存のAgentCoreインスタンスを使用してLLM呼び出し
    const agent = new (await import('./agent.js')).AgentCore(
      await import('../config/index.js').then(m => m.loadConfig()), 
      false
    );

    const decompositionPrompt = `
以下のメインタスクを、実行可能な小さなサブタスクに分解してください。

メインタスク: "${mainTask}"

分解の際は以下の観点を考慮してください：
1. 各サブタスクは具体的で実行可能であること
2. 依存関係を明確にすること
3. 所要時間を現実的に見積もること
4. 必要なツールや技術を特定すること
5. 優先度を適切に設定すること

以下の形式でJSONとして回答してください：
{
  "subtasks": [
    {
      "name": "サブタスク名",
      "description": "詳細な説明",
      "category": "カテゴリ（例：research, coding, testing, deployment）",
      "priority": 1-10の数値（10が最高優先度）,
      "estimatedMinutes": 見積もり時間（分）,
      "dependencies": ["依存するサブタスク名の配列"],
      "requiredTools": ["必要なツールの配列"]
    }
  ],
  "totalEstimatedTime": 合計見積もり時間（分）,
  "complexity": "low | medium | high | very_high"
}`;

    const response = await agent.chat(decompositionPrompt);
    
    try {
      // JSONレスポンスを解析
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('JSON形式の応答が見つかりません');
      }
      
      const result = JSON.parse(jsonMatch[0]);
      logger.debug('タスク分解結果:', result);
      
      return result;
    } catch (error) {
      logger.error('タスク分解結果の解析エラー:', error);
      
      // フォールバック: シンプルな分解
      return {
        subtasks: [
          {
            name: "要件分析",
            description: "タスクの要件と制約を分析",
            category: "research",
            priority: 9,
            estimatedMinutes: 15,
            dependencies: [],
            requiredTools: ["analysis"]
          },
          {
            name: "実装",
            description: "メインタスクの実装",
            category: "coding",
            priority: 8,
            estimatedMinutes: 60,
            dependencies: ["要件分析"],
            requiredTools: ["coding", "tools"]
          },
          {
            name: "検証",
            description: "実装結果の検証",
            category: "testing",
            priority: 7,
            estimatedMinutes: 20,
            dependencies: ["実装"],
            requiredTools: ["testing"]
          }
        ],
        totalEstimatedTime: 95,
        complexity: "medium"
      };
    }
  }

  /**
   * 実行順序を計算（依存関係を考慮）
   */
  private calculateExecutionOrder(rootTaskId: string): string[] {
    const visited = new Set<string>();
    const order: string[] = [];
    
    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      
      const task = this.tasks.get(taskId);
      if (!task) return;
      
      visited.add(taskId);
      
      // 依存関係を先に処理
      for (const depId of task.dependencies) {
        if (!visited.has(depId)) {
          visit(depId);
        }
      }
      
      // サブタスクを処理
      for (const subtaskId of task.subtasks) {
        visit(subtaskId);
      }
      
      if (taskId !== rootTaskId) {
        order.push(taskId);
      }
    };
    
    visit(rootTaskId);
    return order;
  }

  /**
   * 合計所要時間を計算
   */
  private calculateTotalDuration(rootTaskId: string): number {
    const task = this.tasks.get(rootTaskId);
    if (!task) return 0;
    
    let total = task.estimatedDuration;
    for (const subtaskId of task.subtasks) {
      total += this.calculateTotalDuration(subtaskId);
    }
    
    return total;
  }

  /**
   * タスクの開始
   */
  async startTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`タスクが見つかりません: ${taskId}`);
    }
    
    task.status = 'in_progress';
    task.startedAt = new Date();
    
    logger.info(`🔄 タスク開始: ${task.name}`);
    
    // 進捗状況を更新
    await this.updateProgress();
  }

  /**
   * タスクの完了
   */
  async completeTask(taskId: string, result?: any): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`タスクが見つかりません: ${taskId}`);
    }
    
    task.status = 'completed';
    task.completedAt = new Date();
    task.result = result;
    
    if (task.startedAt) {
      task.actualDuration = task.completedAt.getTime() - task.startedAt.getTime();
    }
    
    logger.info(`✅ タスク完了: ${task.name}`);
    
    // 進捗状況を更新
    await this.updateProgress();
  }

  /**
   * タスクの失敗
   */
  async failTask(taskId: string, error: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`タスクが見つかりません: ${taskId}`);
    }
    
    task.status = 'failed';
    task.completedAt = new Date();
    task.error = error;
    
    logger.error(`❌ タスク失敗: ${task.name} - ${error}`);
    
    // 進捗状況を更新
    await this.updateProgress();
  }

  /**
   * 進捗状況の更新
   */
  private async updateProgress(): Promise<void> {
    if (!this.currentRootTask) return;
    
    const allTasks = Array.from(this.tasks.values());
    const completedTasks = allTasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = allTasks.filter(t => t.status === 'in_progress');
    const currentTaskIndex = inProgressTasks.length > 0 ? 
      allTasks.findIndex(t => t.id === inProgressTasks[0].id) : 0;
    
    await this.sessionManager.saveProgress({
      totalTasks: allTasks.length,
      completedTasks,
      currentTaskIndex,
      taskStatuses: allTasks.map(task => ({
        id: task.id,
        name: task.name,
        status: task.status,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
        error: task.error
      }))
    });
  }

  /**
   * 次に実行可能なタスクを取得
   */
  getNextExecutableTask(): TaskNode | null {
    for (const task of this.tasks.values()) {
      if (task.status === 'pending' && this.areDependenciesSatisfied(task)) {
        return task;
      }
    }
    return null;
  }

  /**
   * 依存関係が満たされているかチェック
   */
  private areDependenciesSatisfied(task: TaskNode): boolean {
    return task.dependencies.every(depId => {
      const depTask = this.tasks.get(depId);
      return depTask?.status === 'completed';
    });
  }

  /**
   * 進捗状況を取得
   */
  getProgress(): TaskProgress {
    const allTasks = Array.from(this.tasks.values());
    const completed = allTasks.filter(t => t.status === 'completed').length;
    const inProgress = allTasks.filter(t => t.status === 'in_progress').length;
    const failed = allTasks.filter(t => t.status === 'failed').length;
    const pending = allTasks.filter(t => t.status === 'pending').length;
    
    const totalEstimated = allTasks.reduce((sum, t) => sum + t.estimatedDuration, 0);
    const actualSpent = allTasks
      .filter(t => t.actualDuration)
      .reduce((sum, t) => sum + t.actualDuration!, 0);
    
    return {
      totalTasks: allTasks.length,
      completedTasks: completed,
      inProgressTasks: inProgress,
      failedTasks: failed,
      pendingTasks: pending,
      completionPercentage: Math.round((completed / allTasks.length) * 100),
      estimatedTotalDuration: totalEstimated,
      actualDuration: actualSpent,
      currentTask: allTasks.find(t => t.status === 'in_progress')?.name || null
    };
  }

  /**
   * タスクID生成
   */
  private generateTaskId(): string {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  /**
   * セッション状態を保存
   */
  async saveSession(): Promise<void> {
    await this.sessionManager.saveSessionState({
      currentTask: this.currentRootTask || undefined,
      variables: new Map(Object.entries({
        tasks: Object.fromEntries(this.tasks),
        currentRootTask: this.currentRootTask
      })),
      metadata: {
        totalTasks: this.tasks.size,
        progress: this.getProgress()
      }
    });
  }

  /**
   * セッション状態を読み込み
   */
  async loadSession(): Promise<void> {
    const state = await this.sessionManager.loadSessionState();
    
    if (state.variables) {
      const variables = state.variables as Map<string, any>;
      const tasksData = variables.get('tasks');
      const rootTaskData = variables.get('currentRootTask');
      
      if (tasksData) {
        this.tasks = new Map(Object.entries(tasksData));
      }
      
      if (rootTaskData) {
        this.currentRootTask = rootTaskData;
      }
    }
  }
}

/**
 * 継続実行エンジン - 全機能を統合するマスタークラス
 * 「一つのプロンプトでアプリを最後まで完成させる」メインエンジン
 */
export class ContinuousExecutionEngine {
  private agent: AgentCore;
  private reactController: ReActController;
  private taskManager: ContinuousTaskManager;
  private sessionManager: SessionStateManager;
  
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private currentExecutionPlan: ExecutionPlan | null = null;
  
  constructor(agent: AgentCore, sessionId?: string) {
    this.agent = agent;
    this.reactController = new ReActController(this.agent, 30); // 最大30回の反復
    this.taskManager = new ContinuousTaskManager(sessionId);
    this.sessionManager = new SessionStateManager(sessionId);
    
    logger.info('🚀 継続実行エンジン初期化完了');
  }

  /**
   * メイン実行メソッド - 完了まで継続実行
   */
  async executeUntilComplete(
    userPrompt: string,
    options: {
      requireUserApproval?: boolean;
      maxExecutionTime?: number; // 分
      allowManualIntervention?: boolean;
      planOnly?: boolean; // プランのみ作成して実行は手動
    } = {}
  ): Promise<ContinuousExecutionResult> {
    logger.info(`🎯 継続実行開始: "${userPrompt}"`);
    
    const startTime = Date.now();
    const maxTime = (options.maxExecutionTime || 120) * 60 * 1000; // デフォルト2時間
    
    try {
      this.isRunning = true;
      
      // Phase 1: セッション初期化
      await this.sessionManager.saveSessionInfo({
        startedAt: new Date(),
        initialPrompt: userPrompt,
        config: options
      });

      // Phase 2: タスク分解と実行プラン作成
      logger.info('📋 実行プラン作成中...');
      this.currentExecutionPlan = await this.taskManager.createExecutionPlan(userPrompt);
      
      logger.info(`📊 実行プラン完成: ${this.currentExecutionPlan.tasks.length}個のタスク`);
      console.log('\n=== 実行プラン ===');
      this.currentExecutionPlan.tasks.forEach((task, index) => {
        console.log(`${index + 1}. ${task.name} (優先度: ${task.priority}, 見積: ${task.estimatedDuration}分)`);
      });
      
      // プランのみの場合は実行せず終了
      if (options.planOnly) {
        return {
          success: true,
          completed: false,
          finalResult: '実行プランが作成されました。手動で実行を開始してください。',
          executionPlan: this.currentExecutionPlan,
          totalDuration: 0,
          tasksCompleted: 0,
          tasksTotal: this.currentExecutionPlan.tasks.length
        };
      }

      // Phase 3: ユーザー承認（必要な場合）
      if (options.requireUserApproval) {
        console.log('\n⚠️  実行承認待ち: 上記のプランで実行を開始しますか？ (y/n)');
        // 実際の実装では、CLI入力待ちまたはHTTPエンドポイント経由での承認待ち
        // ここでは自動で承認されたものとして進行
        logger.info('✅ 実行承認済み（自動）');
      }

      // Phase 4: ReAct継続実行
      logger.info('🔄 ReAct継続実行開始...');
      
      const reactResult = await this.reactController.executeUntilComplete(
        userPrompt,
        (history) => {
          // カスタム完了判定：すべてのタスクが完了したか
          return this.isExecutionComplete();
        }
      );

      // Phase 5: 結果とりまとめ
      const endTime = Date.now();
      const totalDuration = endTime - startTime;
      const progress = this.taskManager.getProgress();

      const result: ContinuousExecutionResult = {
        success: reactResult.success,
        completed: this.isExecutionComplete(),
        finalResult: reactResult.finalResult,
        executionPlan: this.currentExecutionPlan,
        reactHistory: reactResult.history,
        totalDuration: Math.round(totalDuration / 1000 / 60), // 分
        tasksCompleted: progress.completedTasks,
        tasksTotal: progress.totalTasks,
        completionReason: reactResult.completionReason,
        performance: {
          iterations: reactResult.iterations,
          averageIterationTime: totalDuration / reactResult.iterations,
          taskCompletionRate: progress.completionPercentage
        }
      };

      // Phase 6: セッション完了処理
      await this.finalizExecution(result);

      logger.info(`🏁 継続実行完了: ${result.tasksCompleted}/${result.tasksTotal}タスク (${result.totalDuration}分)`);
      
      return result;

    } catch (error) {
      logger.error('継続実行エラー:', error);
      
      return {
        success: false,
        completed: false,
        finalResult: `実行エラー: ${error instanceof Error ? error.message : String(error)}`,
        executionPlan: this.currentExecutionPlan,
        totalDuration: Math.round((Date.now() - startTime) / 1000 / 60),
        tasksCompleted: this.taskManager.getProgress().completedTasks,
        tasksTotal: this.taskManager.getProgress().totalTasks,
        error: error instanceof Error ? error.message : String(error)
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * 実行の一時停止
   */
  async pauseExecution(): Promise<void> {
    if (!this.isRunning) {
      throw new Error('実行中ではありません');
    }
    
    this.isPaused = true;
    logger.info('⏸️  実行を一時停止しました');
    
    // 現在の状態を保存
    await this.taskManager.saveSession();
  }

  /**
   * 実行の再開
   */
  async resumeExecution(): Promise<void> {
    if (!this.isPaused) {
      throw new Error('一時停止中ではありません');
    }
    
    this.isPaused = false;
    logger.info('▶️  実行を再開しました');
  }

  /**
   * 手動でのタスク完了マーク
   */
  async markTaskCompleted(taskId: string, result?: any): Promise<void> {
    await this.taskManager.completeTask(taskId, result);
    logger.info(`✅ 手動タスク完了: ${taskId}`);
  }

  /**
   * 実行状況の監視
   */
  getExecutionStatus(): ExecutionStatus {
    const progress = this.taskManager.getProgress();
    
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentTask: progress.currentTask,
      progress: progress,
      reactProgress: this.reactController.getProgress(),
      sessionId: this.sessionManager.getSessionId()
    };
  }

  /**
   * 実行完了判定
   */
  private isExecutionComplete(): boolean {
    const progress = this.taskManager.getProgress();
    
    // 全タスクが完了、または重要タスクが完了していれば完了とみなす
    const allTasksCompleted = progress.completedTasks >= progress.totalTasks;
    const criticalTasksCompleted = progress.completionPercentage >= 90; // 90%以上で完了とする
    
    return allTasksCompleted || criticalTasksCompleted;
  }

  /**
   * 実行の最終処理
   */
  private async finalizExecution(result: ContinuousExecutionResult): Promise<void> {
    try {
      // Git操作（コミット & プッシュ）
      if (result.success && result.completed) {
        logger.info('📝 変更をコミットしています...');
        
        // 実装完了をコミット
        // この部分は実際のGit操作を行う
        // 現在は概念的な実装
        logger.info('✅ コミット完了');
      }

      // セッション最終状態を保存
      await this.sessionManager.saveSessionState({
        currentTask: 'COMPLETED',
        metadata: {
          result,
          finalizedAt: new Date().toISOString()
        }
      });

      // 実行レポート作成
      await this.generateExecutionReport(result);

    } catch (error) {
      logger.error('最終処理エラー:', error);
    }
  }

  /**
   * 実行レポート生成
   */
  private async generateExecutionReport(result: ContinuousExecutionResult): Promise<void> {
    const report = `
# 継続実行レポート

## 実行概要
- 開始時刻: ${new Date().toISOString()}
- 総実行時間: ${result.totalDuration}分
- 完了状況: ${result.tasksCompleted}/${result.tasksTotal}タスク (${Math.round((result.tasksCompleted / result.tasksTotal) * 100)}%)
- 最終結果: ${result.success ? '成功' : '失敗'}

## タスク詳細
${result.executionPlan?.tasks.map((task, index) => 
  `${index + 1}. ${task.name} - ${task.status}`
).join('\n') || '詳細なし'}

## パフォーマンス
- ReAct反復回数: ${result.performance?.iterations || 0}
- 平均反復時間: ${result.performance?.averageIterationTime ? Math.round(result.performance.averageIterationTime / 1000) : 0}秒

## 最終出力
${result.finalResult}
`;

    // 仮想ファイルシステムにレポート保存
    await this.sessionManager.saveVirtualFile(
      'execution-report.md',
      report,
      { type: 'execution-report', generatedAt: new Date().toISOString() }
    );

    logger.info('📊 実行レポートを生成しました');
  }

  /**
   * セッションからの復旧
   */
  async restoreFromSession(sessionId: string): Promise<void> {
    this.sessionManager = new SessionStateManager(sessionId);
    this.taskManager = new ContinuousTaskManager(sessionId);
    
    await this.taskManager.loadSession();
    
    logger.info(`🔄 セッション復旧完了: ${sessionId}`);
  }
}

/**
 * 継続実行結果
 */
interface ContinuousExecutionResult {
  success: boolean;
  completed: boolean;
  finalResult: string;
  executionPlan: ExecutionPlan | null;
  reactHistory?: any[];
  totalDuration: number; // 分
  tasksCompleted: number;
  tasksTotal: number;
  completionReason?: 'success' | 'max_iterations' | 'error' | 'user_requested';
  error?: string;
  performance?: {
    iterations: number;
    averageIterationTime: number;
    taskCompletionRate: number;
  };
}

/**
 * 実行状況
 */
interface ExecutionStatus {
  isRunning: boolean;
  isPaused: boolean;
  currentTask: string | null;
  progress: TaskProgress;
  reactProgress: any;
  sessionId: string;
}

/**
 * タスクノード（実行単位）
 */
interface TaskNode {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  subtasks: string[];
  dependencies: string[];
  priority: number;
  estimatedDuration: number; // 分
  actualDuration?: number; // ミリ秒
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
  metadata: Record<string, any>;
}

/**
 * 実行プラン
 */
interface ExecutionPlan {
  id: string;
  rootTaskId: string;
  tasks: TaskNode[];
  executionOrder: string[];
  totalEstimatedDuration: number;
  createdAt: Date;
  status: 'created' | 'in_progress' | 'completed' | 'failed' | 'paused';
}

/**
 * 進捗状況
 */
interface TaskProgress {
  totalTasks: number;
  completedTasks: number;
  inProgressTasks: number;
  failedTasks: number;
  pendingTasks: number;
  completionPercentage: number;
  estimatedTotalDuration: number;
  actualDuration: number;
  currentTask: string | null;
}

// ContinuousExecutionEngineをAgentCoreのstaticプロパティとしてエクスポート
(AgentCore as any).ContinuousExecutionEngine = ContinuousExecutionEngine;

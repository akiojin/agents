import EventEmitter from 'events';
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
            // Tool呼び出し
            const toolResult = await this.mcpToolsHelper?.executeTool(
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
          : finalResult.result!.content || 'Tool execution completed.';
        
        const trimmedFinalResponse = finalResponse.trim();

        // Final assistant messageをhistoryに追加
        const finalAssistantMessage: ChatMessage = {
          role: 'assistant',
          content: trimmedFinalResponse,
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
        return trimmedFinalResponse;
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
    // MCPFunctionConverterを作成
    this.mcpFunctionConverter = new MCPFunctionConverter(mcpManager);
    
    // MCPToolsHelperを初期化（FunctionConverterを渡す）
    this.mcpToolsHelper = new MCPToolsHelper(mcpManager, this.mcpFunctionConverter);
    
    // Function Callingで利用可能なツールを更新
    this.availableFunctions = await this.mcpFunctionConverter.convertAllTools();
    
    logger.debug(`Function definitions loaded: ${this.availableFunctions.length} functions available`);
    logger.debug('Available functions:', this.availableFunctions.map(f => f.name));
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

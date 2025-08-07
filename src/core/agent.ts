import EventEmitter from 'events';
import type { Config, ChatMessage, TaskConfig, TaskResult } from '../types/config.js';
import { logger, PerformanceLogger } from '../utils/logger.js';
import type { LLMProvider } from '../providers/base.js';
import { createProvider } from '../providers/factory.js';
import { TaskExecutor } from './task-executor.js';
import { MemoryManager } from './memory.js';
import { MCPToolsHelper, MCPTaskPlanner } from '../mcp/tools.js';
import type { MCPManager } from '../mcp/manager.js';

export class AgentCore extends EventEmitter {
  private config: Config;
  private provider: LLMProvider;
  private taskExecutor: TaskExecutor;
  private memoryManager: MemoryManager;
  private mcpToolsHelper?: MCPToolsHelper;
  private mcpTaskPlanner?: MCPTaskPlanner;
  private history: ChatMessage[] = [];
  private currentModel: string;
  private parallelMode: boolean = false;
  private verboseMode: boolean = false;

  constructor(config: Config) {
    super();
    this.config = config;
    this.currentModel = config.model || this.getDefaultModel();
    this.provider = createProvider(config);
    this.taskExecutor = new TaskExecutor(config);
    this.memoryManager = new MemoryManager(config.historyPath);
    // 初期化を非同期で実行（エラーハンドリングを含む）
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      // 履歴を読み込む
      this.history = await this.memoryManager.loadHistory();
      logger.info('エージェントコアを初期化しました');
    } catch (error) {
      logger.error('初期化エラー:', error);
      
      // 初期化エラーでも基本的な機能は利用可能にする
      this.history = [];
      logger.warn('履歴の読み込みに失敗しましたが、新しいセッションとして開始します');
      
      // 初期化エラーは致命的ではないので例外を投げない
    }
  }

  private getDefaultModel(): string {
    switch (this.config.provider) {
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

    try {
      // 入力検証
      if (!input || input.trim().length === 0) {
        throw new Error('入力が空です');
      }

      const trimmedInput = input.trim();
      if (trimmedInput.length > 32000) {
        throw new Error('入力が長すぎます（最大32,000文字）');
      }

      // ユーザーメッセージを履歴に追加
      const userMessage: ChatMessage = {
        role: 'user',
        content: trimmedInput,
        timestamp: new Date(),
      };
      this.history.push(userMessage);

      // プロバイダー接続確認
      if (!this.provider) {
        throw new Error('LLMプロバイダーが初期化されていません');
      }

      // LLMに送信（複数回のリトライ機能付き）
      let response: string;
      let lastError: Error | null = null;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount < maxRetries) {
        try {
          response = await this.provider.chat(this.history, {
            model: this.currentModel,
            temperature: 0.7,
            maxTokens: 2000,
          });
          break; // 成功した場合はループを抜ける
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          retryCount++;
          
          logger.warn(`LLMリクエスト失敗 (試行 ${retryCount}/${maxRetries}):`, lastError.message);

          if (retryCount < maxRetries) {
            // リトライ前に少し待機
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
      }

      if (!response!) {
        throw lastError || new Error('LLMからのレスポンス取得に失敗しました');
      }

      // 応答検証
      if (!response || response.trim().length === 0) {
        throw new Error('LLMからの応答が空です');
      }

      const trimmedResponse = response.trim();

      // アシスタントメッセージを履歴に追加
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: trimmedResponse,
        timestamp: new Date(),
      };
      this.history.push(assistantMessage);

      // 履歴を保存（エラーが発生しても会話は続行）
      try {
        await this.memoryManager.saveHistory(this.history);
      } catch (saveError) {
        logger.warn('履歴保存に失敗しました:', saveError);
        // 履歴保存失敗は致命的ではない
      }

      perf.end('Chat completed');
      return trimmedResponse;

    } catch (error) {
      logger.error('Chat error:', error);

      // エラーメッセージをユーザーフレンドリーに変換
      let errorMessage = 'エラーが発生しました';
      let canRetry = false;

      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();
        
        if (errorMsg.includes('api key') || errorMsg.includes('unauthorized') || errorMsg.includes('authentication')) {
          errorMessage = 'APIキーが無効または期限切れです。設定を確認してください。';
        } else if (errorMsg.includes('quota') || errorMsg.includes('billing') || errorMsg.includes('payment')) {
          errorMessage = 'APIの利用枠または請求に問題があります。アカウント状況を確認してください。';
        } else if (errorMsg.includes('timeout')) {
          errorMessage = 'リクエストがタイムアウトしました。もう一度お試しください。';
          canRetry = true;
        } else if (errorMsg.includes('rate limit') || errorMsg.includes('too many requests')) {
          errorMessage = 'レート制限に達しました。しばらくお待ちください。';
          canRetry = true;
        } else if (errorMsg.includes('network') || errorMsg.includes('connection')) {
          errorMessage = 'ネットワークエラーが発生しました。接続を確認してください。';
          canRetry = true;
        } else if (errorMsg.includes('model') && errorMsg.includes('not found')) {
          errorMessage = `指定されたモデル "${this.currentModel}" が利用できません。';
        } else if (errorMsg.includes('input') || errorMsg.includes('長すぎ')) {
          errorMessage = error.message;
        } else {
          errorMessage = `チャットエラー: ${error.message}`;
          canRetry = true;
        }
      }

      // エラー情報をより詳細に記録
      const errorDetails = {
        originalError: error instanceof Error ? error.message : String(error),
        model: this.currentModel,
        provider: this.config.provider,
        canRetry,
        timestamp: new Date().toISOString(),
      };

      logger.error('詳細なチャットエラー情報:', errorDetails);

      // エラーをラップして追加情報を含める
      const wrappedError = new Error(errorMessage);
      (wrappedError as any).details = errorDetails;
      (wrappedError as any).canRetry = canRetry;

      throw wrappedError;
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
        message: `タスク実行エラー: ${error instanceof Error ? error.message : String(error)}`,
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
        config: this.config,
        history: this.history,
      },
      filename,
    );
  }

  async loadSession(filename: string): Promise<void> {
    const session = await this.memoryManager.loadSession(filename);
    this.history = session.history;
    logger.info(`セッションを読み込みました: ${filename}`);
  }

  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
    logger.info('履歴をクリアしました');
  }

  getCurrentModel(): string {
    return this.currentModel;
  }

  setModel(model: string): void {
    this.currentModel = model;
    logger.info(`モデルを変更しました: ${model}`);
  }

  toggleParallelMode(): boolean {
    this.parallelMode = !this.parallelMode;
    this.taskExecutor.setParallelMode(this.parallelMode);
    return this.parallelMode;
  }

  toggleVerboseMode(): boolean {
    this.verboseMode = !this.verboseMode;
    if (this.verboseMode) {
      logger.level = 'debug';
    } else {
      logger.level = this.config.logLevel;
    }
    return this.verboseMode;
  }

  /**
   * MCPManagerを設定してツールヘルパーを初期化
   */
  setupMCPTools(mcpManager: MCPManager): void {
    this.mcpToolsHelper = new MCPToolsHelper(mcpManager);
    this.mcpTaskPlanner = new MCPTaskPlanner(this.mcpToolsHelper);
    logger.info('MCPツールが初期化されました');
  }

  /**
   * MCPツールを使用してタスクを実行
   */
  async executeTaskWithMCP(config: TaskConfig): Promise<TaskResult> {
    if (!this.mcpToolsHelper || !this.mcpTaskPlanner) {
      logger.warn('MCPツールが初期化されていません。通常のタスク実行に切り替えます');
      return this.executeTask(config);
    }

    const perf = new PerformanceLogger('executeTaskWithMCP');

    try {
      this.emit('task:start', config);

      // タスク実行プランを作成
      let executionPlan;
      try {
        executionPlan = await this.mcpTaskPlanner.createExecutionPlan(config.description);
        logger.info(`実行プラン作成完了: ${executionPlan.steps.length}ステップ`, executionPlan);
      } catch (planError) {
        logger.error('実行プラン作成エラー:', planError);
        
        // プラン作成に失敗した場合は通常のタスク実行にフォールバック
        logger.info('通常のタスク実行にフォールバックします');
        return this.executeTask(config);
      }

      // 各ステップを実行
      const stepResults: Array<{
        stepIndex: number;
        description: string;
        success: boolean;
        result?: unknown;
        error?: string;
        duration?: number;
      }> = [];

      let successCount = 0;
      let hasPartialSuccess = false;

      for (let i = 0; i < executionPlan.steps.length; i++) {
        const step = executionPlan.steps[i];
        const stepStartTime = Date.now();

        try {
          logger.info(`ステップ実行中 (${i + 1}/${executionPlan.steps.length}): ${step.description}`);

          // MCPツール実行にタイムアウトを設定
          const stepExecutionPromise = this.mcpToolsHelper.executeTool(step.tool, step.params);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Step timeout')), 60000)
          );

          const stepResult = await Promise.race([stepExecutionPromise, timeoutPromise]);
          const duration = Date.now() - stepStartTime;

          stepResults.push({
            stepIndex: i,
            description: step.description,
            success: true,
            result: stepResult,
            duration,
          });

          successCount++;
          logger.info(`ステップ完了 (${i + 1}/${executionPlan.steps.length}): ${step.description} (${duration}ms)`);

        } catch (stepError) {
          const duration = Date.now() - stepStartTime;
          const errorMessage = stepError instanceof Error ? stepError.message : String(stepError);
          
          logger.error(`ステップエラー (${i + 1}/${executionPlan.steps.length}): ${step.description}`, stepError);

          stepResults.push({
            stepIndex: i,
            description: step.description,
            success: false,
            error: errorMessage,
            duration,
          });

          // 重要でないステップのエラーは続行
          if (!step.critical) {
            logger.info('非重要ステップのため実行を継続します');
            hasPartialSuccess = true;
          } else {
            logger.warn('重要ステップが失敗しました');
            break; // 重要なステップが失敗した場合は停止
          }
        }
      }

      // 結果をまとめて返す
      const isSuccess = successCount > 0 && (successCount === executionPlan.steps.length || hasPartialSuccess);
      const summary = this.createDetailedSummary(stepResults, executionPlan.steps.length);

      const result: TaskResult = {
        success: isSuccess,
        message: `MCPタスク実行: ${config.description}`,
        data: {
          executionPlan,
          stepResults,
          summary,
          totalSteps: executionPlan.steps.length,
          successfulSteps: successCount,
          failedSteps: stepResults.length - successCount,
          hasPartialSuccess,
        },
      };

      this.emit('task:complete', result);
      perf.end(`MCP Task completed: ${config.description}`);

      return result;

    } catch (error) {
      const errorResult: TaskResult = {
        success: false,
        message: `MCPタスク実行エラー: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
        data: {
          executionError: true,
          errorDetails: {
            message: error instanceof Error ? error.message : String(error),
            timestamp: new Date().toISOString(),
            task: config.description,
          },
        },
      };

      this.emit('task:error', errorResult);
      logger.error('MCP Task execution error:', error);

      return errorResult;
    }
  }

    const perf = new PerformanceLogger('executeTaskWithMCP');

    try {
      this.emit('task:start', config);

      // タスク実行プランを作成
      const executionPlan = await this.mcpTaskPlanner.createExecutionPlan(config.description);
      logger.info(`実行プラン作成完了: ${executionPlan.steps.length}ステップ`, executionPlan);

      // 各ステップを実行
      const stepResults: unknown[] = [];
      for (const step of executionPlan.steps) {
        try {
          logger.info(`ステップ実行中: ${step.description}`);
          const stepResult = await this.mcpToolsHelper.executeTool(step.tool, step.params);
          stepResults.push(stepResult);
          logger.info(`ステップ完了: ${step.description}`);
        } catch (error) {
          logger.error(`ステップエラー: ${step.description}`, error);
          stepResults.push({ error: error instanceof Error ? error.message : String(error) });
        }
      }

      // 結果をまとめて返す
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
        message: `MCPタスク実行エラー: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      this.emit('task:error', errorResult);
      logger.error('MCP Task execution error:', error);

      return errorResult;
    }
  }

  /**
   * 結果をサマリー化
   */
  private summarizeResults(results: unknown[]): string {
    const successCount = results.filter(
      (r) => !(r && typeof r === 'object' && 'error' in r),
    ).length;
    const errorCount = results.length - successCount;

    return `${results.length}ステップ中 ${successCount}成功、${errorCount}エラー`;
  }

  /**
   * 利用可能なMCPツールの一覧を取得
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
      logger.error('MCPツール一覧取得エラー:', error);
      return [];
    }
  }

  /**
   * MCPサーバーのステータスを取得
   */
  getMCPServerStatus(): Map<string, boolean> | null {
    if (!this.mcpToolsHelper) {
      return null;
    }
    return this.mcpToolsHelper.getServerStatus();
  }

  /**
   * ステップ実行結果の詳細サマリーを作成
   */
  private createDetailedSummary(stepResults: Array<{
    stepIndex: number;
    description: string;
    success: boolean;
    result?: unknown;
    error?: string;
    duration?: number;
  }>, totalSteps: number): string {
    const successCount = stepResults.filter(r => r.success).length;
    const errorCount = stepResults.filter(r => !r.success).length;
    const totalDuration = stepResults.reduce((sum, r) => sum + (r.duration || 0), 0);

    const summaryParts = [
      `${totalSteps}ステップ中 ${successCount}成功、${errorCount}エラー`,
      `実行時間: ${totalDuration}ms`,
    ];

    // エラーがある場合はエラーの詳細を追加
    if (errorCount > 0) {
      const failedSteps = stepResults
        .filter(r => !r.success)
        .map(r => `- ${r.description}: ${r.error}`)
        .join('
');
      summaryParts.push(`失敗したステップ:
${failedSteps}`);
    }

    return summaryParts.join('
');
  }
}

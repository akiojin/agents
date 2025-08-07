import EventEmitter from 'events';
import type { Config } from '../config/types.js';
import type { ChatMessage, TaskConfig, TaskResult } from '../types/config.js';
import { logger, PerformanceLogger, LogLevel } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import type { LLMProvider } from '../providers/base.js';
import { createProviderFromUnifiedConfig } from '../providers/factory.js';
import { TaskExecutor } from './task-executor.js';
import { MemoryManager } from './memory.js';
import { MCPToolsHelper, MCPTaskPlanner } from '../mcp/tools.js';
import type { MCPManager } from '../mcp/manager.js';

import { SimpleTaskDecomposer } from './task-decomposer.js';
import { ParallelExecutor } from './parallel-executor.js';

export class AgentCore extends EventEmitter {
  private config: Config;
  private provider: LLMProvider;
  private taskExecutor: TaskExecutor;
  private memoryManager: MemoryManager;
  private mcpToolsHelper?: MCPToolsHelper;
  private mcpTaskPlanner?: MCPTaskPlanner;
  private taskDecomposer: SimpleTaskDecomposer;
  private parallelExecutor: ParallelExecutor;
  private history: ChatMessage[] = [];
  private currentModel: string;
  private parallelMode: boolean = false;
  private verboseMode: boolean = false;
  
  // メモリ管理関連の設定
  private readonly MAX_HISTORY_SIZE = 100; // 最大履歴サイズ
  private readonly MEMORY_CHECK_INTERVAL = 10; // N回のチャット毎にメモリチェック
  private chatCount: number = 0; // チャット回数カウンター
  
  // リソース管理用
  private timers: Set<NodeJS.Timeout> = new Set();
  private eventListeners: WeakMap<object, Function[]> = new WeakMap();

  constructor(config: Config) {
    super();
    this.config = config;
    this.currentModel = config.llm.model || this.getDefaultModel();
    this.provider = createProviderFromUnifiedConfig(config);
    this.taskExecutor = new TaskExecutor(this.convertToLegacyConfig(config));
    this.memoryManager = new MemoryManager(config.paths.history);
    this.taskDecomposer = new SimpleTaskDecomposer();
    this.parallelExecutor = new ParallelExecutor(config.app.maxParallel || 3);
    
    // 初期化を非同期で実行（エラーハンドリングを含む）
    void this.initialize();
    
    // プロセス終了時のクリーンアップ処理を登録
    this.setupCleanupHandlers();
  }

  /**
   * 新しいConfig型を既存のLegacy Config型に変換
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

  private async initialize(): Promise<void> {
    try {
      // 履歴を読み込む
      this.history = await this.memoryManager.loadHistory();
      
      // 初回起動時にメモリ最適化
      await this.optimizeMemory();
      
      logger.info('エージェントコアを初期化しました');
    } catch (error) {
      logger.error('初期化エラー:', error);

      // 初期化エラーでも基本的な機能は利用可能にする
      this.history = [];
      logger.warn('履歴の読み込みに失敗しましたが、新しいセッションとして開始します');

      // 初期化エラーは致命的ではないので例外を投げない
    }
  }

  /**
   * クリーンアップハンドラーの設定
   */
  private setupCleanupHandlers(): void {
    const cleanup = () => {
      this.cleanup();
    };

    // プロセス終了時のクリーンアップ
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
   * リソースのクリーンアップ
   */
  public cleanup(): void {
    try {
      // タイマーのクリア
      this.timers.forEach(timer => clearTimeout(timer));
      this.timers.clear();

      // イベントリスナーの解除
      this.removeAllListeners();

      logger.info('リソースのクリーンアップが完了しました');
    } catch (error) {
      logger.error('クリーンアップエラー:', error);
    }
  }

  /**
   * メモリ最適化処理
   */
  private async optimizeMemory(): Promise<void> {
    try {
      // 履歴のサイズ制限
      if (this.history.length > this.MAX_HISTORY_SIZE) {
        const oldSize = this.history.length;
        this.history = this.history.slice(-this.MAX_HISTORY_SIZE);
        await this.memoryManager.saveHistory(this.history);
        logger.info(`履歴を最適化しました: ${oldSize}件 → ${this.history.length}件`);
      }

      // MemoryManagerの履歴も最適化
      await this.memoryManager.pruneHistory(this.MAX_HISTORY_SIZE);

      // ガベージコレクションの実行（可能であれば）
      if (global.gc) {
        global.gc();
        logger.debug('ガベージコレクションを実行しました');
      }
    } catch (error) {
      logger.error('メモリ最適化エラー:', error);
    }
  }

  /**
   * メモリ使用量の監視
   */
  private monitorMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const mbUsage = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    logger.debug('メモリ使用量:', mbUsage);

    // メモリ使用量が高い場合の警告
    if (mbUsage.heapUsed > 500) { // 500MB以上の場合
      logger.warn(`メモリ使用量が高くなっています: ${mbUsage.heapUsed}MB`);
      // 自動最適化を実行
      void this.optimizeMemory();
    }
  }

  /**
   * タイマーの登録（自動クリーンアップ対応）
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
      // プログレス表示開始
      globalProgressReporter.startTask('チャット処理', ['入力検証', 'LLM呼び出し', 'レスポンス処理', '履歴保存']);

      // 入力検証
      globalProgressReporter.updateSubtask(0);
      if (!input || input.trim().length === 0) {
        globalProgressReporter.completeTask(false);
        throw new Error('入力が空です');
      }

      const trimmedInput = input.trim();
      if (trimmedInput.length > 32000) {
        globalProgressReporter.completeTask(false);
        throw new Error('入力が長すぎます（最大32,000文字）');
      }

      // メモリ使用量チェック（定期的）
      this.chatCount++;
      if (this.chatCount % this.MEMORY_CHECK_INTERVAL === 0) {
        this.monitorMemoryUsage();
        await this.optimizeMemory();
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
        globalProgressReporter.completeTask(false);
        throw new Error('LLMプロバイダーが初期化されていません');
      }

      // LLM呼び出し
      globalProgressReporter.updateSubtask(1);
      
      // withRetryを使用したLLM呼び出し
      const result = await withRetry(
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
            // リトライ可能なエラー: タイムアウト、レート制限、ネットワークエラー、サーバーエラー
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

      if (!result.success) {
        logger.error('LLMチャットエラー after retries:', result.error);
        globalProgressReporter.completeTask(false);
        throw result.error!;
      }

      const response = result.result!;

      // レスポンス処理
      globalProgressReporter.updateSubtask(2);
      
      // 応答検証
      if (!response || response.trim().length === 0) {
        globalProgressReporter.completeTask(false);
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

      // 履歴保存
      globalProgressReporter.updateSubtask(3);
      
      // 履歴を保存（エラーが発生しても会話は継続）
      try {
        await this.memoryManager.saveHistory(this.history);
      } catch (saveError) {
        logger.warn('履歴保存に失敗しました:', saveError);
        globalProgressReporter.showWarning('履歴保存に失敗しましたが、会話は継続します');
        // 履歴保存失敗は致命的ではない
      }

      globalProgressReporter.completeTask(true);
      perf.end(`Chat completed (attempts: ${result.attemptCount}, time: ${result.totalTime}ms)`);
      return trimmedResponse;
    } catch (error) {
      logger.error('Chat error:', error);
      globalProgressReporter.completeTask(false);

      // エラーメッセージをユーザーフレンドリーに変換
      let errorMessage = 'エラーが発生しました';
      let canRetry = false;

      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase();

        if (
          errorMsg.includes('api key') ||
          errorMsg.includes('unauthorized') ||
          errorMsg.includes('authentication')
        ) {
          errorMessage = 'APIキーが無効または期限切れです。設定を確認してください。';
        } else if (
          errorMsg.includes('quota') ||
          errorMsg.includes('billing') ||
          errorMsg.includes('payment')
        ) {
          errorMessage =
            'APIの利用枠または請求に問題があります。アカウント状況を確認してください。';
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
          errorMessage = `指定されたモデル "${this.currentModel}" が利用できません。`;
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
        provider: this.config.llm.provider,
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

  /**
   * タスク分解機能付きのチャット
   * @param input ユーザーの入力
   * @returns AIの応答
   */
  async chatWithTaskDecomposition(input: string): Promise<string> {
    const perf = new PerformanceLogger('chatWithTaskDecomposition');

    try {
      // 入力検証
      if (!input || input.trim().length === 0) {
        throw new Error('入力が空です');
      }

      const trimmedInput = input.trim();
      
      // タスクの複雑度を判定
      if (this.taskDecomposer.isComplexTask(trimmedInput)) {
        logger.info('📝 タスクを分解しています...');
        
        // タスクを分解
        const subtasks = this.taskDecomposer.decompose(trimmedInput);
        
        if (subtasks.length > 1) {
          // タスクが分解された場合の表示
          logger.info('タスクが以下のサブタスクに分解されました:');
          subtasks.forEach((subtask, index) => {
            logger.info(`  ${index + 1}. ${subtask}`);
          });

          // 並列実行可能かどうか判定
          const canRunParallel = this.parallelMode && this.canRunSubtasksInParallel(subtasks);
          
          let results: string[];
          
          if (canRunParallel) {
            logger.info('🚀 サブタスクを並列実行します');
            results = await this.executeSubtasksInParallel(subtasks);
          } else {
            logger.info('🔄 サブタスクを順次実行します');
            results = await this.executeSubtasksSequentially(subtasks);
          }

          // 結果を統合
          const finalResponse = `タスク分解実行結果:\n\n${results.join('\n\n')}\n\n📊 実行サマリー: ${subtasks.length}個のサブタスクのうち${results.filter(r => !r.includes('エラーが発生')).length}個が成功しました。`;
          
          perf.end(`Task decomposition completed: ${subtasks.length} subtasks`);
          return finalResponse;
        }
      }
      
      // 通常のチャット処理にフォールバック
      return await this.chat(trimmedInput);
    } catch (error) {
      logger.error('Task decomposition error:', error);
      
      // エラーの場合は通常のチャットにフォールバック
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
        config: this.convertToLegacyConfig(this.config),
        history: this.history,
      },
      filename,
    );
  }

  async loadSession(filename: string): Promise<void> {
    const session = await this.memoryManager.loadSession(filename);
    this.history = session.history;
    
    // ロード後にメモリ最適化
    await this.optimizeMemory();
    
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
      `${totalSteps}ステップ中 ${successCount}成功、${errorCount}エラー`,
      `実行時間: ${totalDuration}ms`,
    ];

    // エラーがある場合はエラーの詳細を追加
    if (errorCount > 0) {
      const failedSteps = stepResults
        .filter((r) => !r.success)
        .map((r) => `- ${r.description}: ${r.error}`)
        .join('\n');
      summaryParts.push(`失敗したステップ:\n${failedSteps}`);
    }

    return summaryParts.join('\n');
  }

  /**
   * サブタスクが並列実行可能かを判定
   */
  private canRunSubtasksInParallel(subtasks: string[]): boolean {
    // シンプルな並列実行判定ルール
    const conflictKeywords = [
      '同じファイル',
      '順番',
      '順次',
      '前のタスク',
      '依存',
      '結果を使用',
      '結果を利用',
      'の後で',
      'に基づいて',
    ];

    // タスク間で競合するキーワードがあるかチェック
    const hasConflict = subtasks.some((subtask) =>
      conflictKeywords.some((keyword) => subtask.includes(keyword))
    );

    if (hasConflict) {
      logger.debug('サブタスクに依存関係が検出されました。順次実行を選択します。');
      return false;
    }

    // ファイルパスの競合をチェック
    const usedFiles = new Set<string>();
    for (const subtask of subtasks) {
      const files = this.extractFilesFromSubtask(subtask);
      const hasFileConflict = files.some(file => usedFiles.has(file));
      
      if (hasFileConflict) {
        logger.debug('サブタスク間でファイルの競合が検出されました。順次実行を選択します。');
        return false;
      }
      
      files.forEach(file => usedFiles.add(file));
    }

    return true;
  }

  /**
   * サブタスクから関連ファイルを抽出
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
   * サブタスクを並列実行
   */
  private async executeSubtasksInParallel(subtasks: string[]): Promise<string[]> {
    const { globalProgressReporter } = await import('../ui/progress.js');

    // サブタスクをParallelTaskに変換
    const parallelTasks = subtasks.map((subtask, index) => ({
      id: `subtask-${index}`,
      description: subtask,
      priority: 5,
      task: async () => {
        logger.info(`🔄 サブタスク ${index + 1} 開始: ${subtask}`);
        try {
          const result = await this.chat(subtask);
          logger.info(`✅ サブタスク ${index + 1} 完了`);
          return `サブタスク ${index + 1}: ${result}`;
        } catch (error) {
          const errorMsg = `サブタスク ${index + 1} でエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(`❌ ${errorMsg}`);
          return errorMsg;
        }
      },
    }));

    // 並列実行
    const parallelResults = await this.parallelExecutor.executeParallelWithDetails(
      parallelTasks,
      (completed, total, currentTask) => {
        globalProgressReporter.showInfo(`並列実行進捗: ${completed}/${total} - ${currentTask}`);
      }
    );

    // 結果を文字列配列に変換
    return parallelResults.map(pr => 
      pr.success ? pr.data as string : `エラー: ${pr.error?.message || 'Unknown error'}`
    );
  }

  /**
   * サブタスクを順次実行
   */
  private async executeSubtasksSequentially(subtasks: string[]): Promise<string[]> {
    const results: string[] = [];
    
    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      logger.info(`\n🔄 サブタスク ${i + 1}/${subtasks.length} を実行中: ${subtask}`);
      
      try {
        const subtaskResult = await this.chat(subtask);
        results.push(`サブタスク ${i + 1}: ${subtaskResult}`);
        logger.info(`✅ サブタスク ${i + 1} 完了`);
      } catch (error) {
        const errorMsg = `サブタスク ${i + 1} でエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
        results.push(errorMsg);
        logger.error(`❌ ${errorMsg}`);
      }
    }

    return results;
  }
}

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

      // ユーザーメッセージを履歴に追加
      const userMessage: ChatMessage = {
        role: 'user',
        content: input,
        timestamp: new Date(),
      };
      this.history.push(userMessage);

      // LLMに送信
      const response = await this.provider.chat(this.history, {
        model: this.currentModel,
        temperature: 0.7,
        maxTokens: 2000,
      });

      // 応答検証
      if (!response || response.trim().length === 0) {
        throw new Error('LLMからの応答が空です');
      }

      // アシスタントメッセージを履歴に追加
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      this.history.push(assistantMessage);

      // 履歴を保存
      await this.memoryManager.saveHistory(this.history);

      perf.end('Chat completed');
      return response;
    } catch (error) {
      logger.error('Chat error:', error);

      // エラーメッセージをユーザーフレンドリーに変換
      let errorMessage = 'エラーが発生しました';
      if (error instanceof Error) {
        if (error.message.includes('API')) {
          errorMessage = 'APIエラーが発生しました。APIキーと接続を確認してください。';
        } else if (error.message.includes('timeout')) {
          errorMessage = 'タイムアウトしました。もう一度お試しください。';
        } else if (error.message.includes('rate limit')) {
          errorMessage = 'レート制限に達しました。しばらくお待ちください。';
        } else {
          errorMessage = `エラー: ${error.message}`;
        }
      }

      throw new Error(errorMessage);
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
}

import EventEmitter from 'events';
import type { Config, ChatMessage, TaskConfig, TaskResult } from '../types/config.js';
import { logger, PerformanceLogger } from '../utils/logger.js';
import { LLMProvider } from '../providers/base.js';
import { createProvider } from '../providers/factory.js';
import { TaskExecutor } from './task-executor.js';
import { MemoryManager } from './memory.js';

export class AgentCore extends EventEmitter {
  private config: Config;
  private provider: LLMProvider;
  private taskExecutor: TaskExecutor;
  private memoryManager: MemoryManager;
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
    this.initialize();
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
      throw error;
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
    await this.memoryManager.saveSession({
      id: `session-${Date.now()}`,
      startedAt: new Date(),
      config: this.config,
      history: this.history,
    }, filename);
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
}
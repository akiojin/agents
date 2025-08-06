import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import type { Config, TaskConfig, TaskResult } from '../types/config.js';
import type { LLMProvider } from '../providers/base.js';
import { logger } from '../utils/logger.js';

export class TaskExecutor extends EventEmitter {
  // private _config: Config;
  private parallelMode: boolean = false;
  private limit: ReturnType<typeof pLimit>;

  constructor(config: Config) {
    super();
    // this._config = config;
    this.limit = pLimit(config.maxParallel);
  }

  async execute(taskConfig: TaskConfig, provider: LLMProvider): Promise<TaskResult> {
    const startTime = Date.now();

    try {
      logger.info(`タスク実行開始: ${taskConfig.description}`);

      // タスクを細分化
      const subtasks = this.decomposeTasks(taskConfig);

      let results: TaskResult[];

      if (this.parallelMode && taskConfig.parallel !== false) {
        // 並列実行
        results = await this.executeParallel(subtasks, provider);
      } else {
        // 順次実行
        results = await this.executeSequential(subtasks, provider);
      }

      // 結果を統合
      const finalResult = this.mergeResults(results);
      finalResult.duration = Date.now() - startTime;

      logger.info(`タスク実行完了: ${taskConfig.description} (${finalResult.duration}ms)`);

      return finalResult;
    } catch (error) {
      logger.error('タスク実行エラー:', error);

      return {
        success: false,
        message: `タスク実行エラー: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
      };
    }
  }

  private decomposeTasks(taskConfig: TaskConfig): TaskConfig[] {
    // タスクの分解ロジック
    // 現在は単純に元のタスクをそのまま返す
    // 将来的にはAIを使用してタスクを細分化
    return [taskConfig];
  }

  private async executeSequential(
    tasks: TaskConfig[],
    provider: LLMProvider,
  ): Promise<TaskResult[]> {
    const results: TaskResult[] = [];

    for (const task of tasks) {
      const result = await this.executeSingleTask(task, provider);
      results.push(result);

      // エラーが発生した場合は中断
      if (!result.success) {
        break;
      }
    }

    return results;
  }

  private async executeParallel(tasks: TaskConfig[], provider: LLMProvider): Promise<TaskResult[]> {
    const promises = tasks.map((task) => this.limit(() => this.executeSingleTask(task, provider)));

    return Promise.all(promises);
  }

  private async executeSingleTask(task: TaskConfig, provider: LLMProvider): Promise<TaskResult> {
    try {
      this.emit('subtask:start', task);

      // タスクをプロンプトに変換
      const prompt = this.buildPrompt(task);

      // LLMに実行を依頼
      const response = await provider.complete({
        prompt,
        temperature: 0.3,
        maxTokens: 4000,
      });

      const result: TaskResult = {
        success: true,
        message: task.description,
        data: response,
      };

      this.emit('subtask:complete', result);
      return result;
    } catch (error) {
      const errorResult: TaskResult = {
        success: false,
        message: `サブタスクエラー: ${task.description}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      this.emit('subtask:error', errorResult);
      return errorResult;
    }
  }

  private buildPrompt(task: TaskConfig): string {
    let prompt = `以下のタスクを実行してください:\n\n${task.description}\n`;

    if (task.files && task.files.length > 0) {
      prompt += `\n対象ファイル:\n${task.files.map((f) => `- ${f}`).join('\n')}\n`;
    }

    if (task.context) {
      prompt += `\nコンテキスト:\n${JSON.stringify(task.context, null, 2)}\n`;
    }

    return prompt;
  }

  private mergeResults(results: TaskResult[]): TaskResult {
    const allSuccess = results.every((r) => r.success);
    // const messages = results.map((r) => r.message).join('\n');
    const data = results.map((r) => r.data).filter(Boolean);

    return {
      success: allSuccess,
      message: allSuccess ? 'すべてのタスクが完了しました' : 'タスクの一部が失敗しました',
      data: data.length === 1 ? data[0] : data,
    };
  }

  setParallelMode(enabled: boolean): void {
    this.parallelMode = enabled;
    logger.info(`並列実行モード: ${enabled ? '有効' : '無効'}`);
  }
}

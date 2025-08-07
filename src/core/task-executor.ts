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
    // maxConcurrencyまたはmaxParallelをチェックし、デフォルト値を設定
    const concurrency = config.maxConcurrency || config.maxParallel || 3;
    this.limit = pLimit(concurrency);
  }

  async execute(taskConfig: TaskConfig, provider: LLMProvider): Promise<TaskResult> {
    const startTime = Date.now();
    const { globalProgressReporter } = await import('../ui/progress.js');

    try {
      // タスクを細分化
      const subtasks = this.decomposeTasks(taskConfig);
      const subtaskNames = subtasks.map((task, index) => `サブタスク${index + 1}: ${task.description}`);
      
      // プログレス表示開始
      globalProgressReporter.startTask(
        `タスク実行: ${taskConfig.description}`,
        ['タスク分解', this.parallelMode ? '並列実行' : '順次実行', '結果統合']
      );
      
      logger.info(`タスク実行開始: ${taskConfig.description}`);

      // タスク分解完了
      globalProgressReporter.updateSubtask(0);
      
      let results: TaskResult[];

      if (this.parallelMode && taskConfig.parallel !== false) {
        // 並列実行
        globalProgressReporter.updateSubtask(1);
        globalProgressReporter.showInfo(`${subtasks.length}個のサブタスクを並列実行します`);
        results = await this.executeParallel(subtasks, provider);
      } else {
        // 順次実行
        globalProgressReporter.updateSubtask(1);
        globalProgressReporter.showInfo(`${subtasks.length}個のサブタスクを順次実行します`);
        results = await this.executeSequential(subtasks, provider);
      }

      // 結果統合
      globalProgressReporter.updateSubtask(2);
      const finalResult = this.mergeResults(results);
      finalResult.duration = Date.now() - startTime;

      // 成功/失敗の判定
      const successCount = results.filter(r => r.success).length;
      const success = successCount === results.length;
      
      globalProgressReporter.completeTask(success);
      logger.info(`タスク実行完了: ${taskConfig.description} (${finalResult.duration}ms)`);
      
      if (!success) {
        globalProgressReporter.showWarning(`${results.length}個中${successCount}個のサブタスクが成功しました`);
      }

      return finalResult;
    } catch (error) {
      logger.error('タスク実行エラー:', error);
      globalProgressReporter.completeTask(false);
      globalProgressReporter.showError(error instanceof Error ? error.message : String(error));

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
    const { globalProgressReporter } = await import('../ui/progress.js');

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      
      // 個別タスクの進捗表示
      globalProgressReporter.showInfo(`[${i + 1}/${tasks.length}] ${task.description}`);
      
      const result = await this.executeSingleTask(task, provider);
      results.push(result);

      if (result.success) {
        globalProgressReporter.showInfo(`✅ サブタスク${i + 1}完了: ${task.description}`);
      } else {
        globalProgressReporter.showError(`❌ サブタスク${i + 1}失敗: ${task.description}`);
        // エラーが発生した場合は中断
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

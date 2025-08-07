import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import type { Config, TaskConfig, TaskResult } from '../types/config.js';
import type { LLMProvider } from '../providers/base.js';
import { logger } from '../utils/logger.js';
import { ParallelExecutor, ParallelTask } from './parallel-executor.js';

export class TaskExecutor extends EventEmitter {
  // private _config: Config;
  private parallelMode: boolean = false;
  private limit: ReturnType<typeof pLimit>;
  private parallelExecutor: ParallelExecutor;

  constructor(config: Config) {
    super();
    // this._config = config;
    // maxConcurrencyまたはmaxParallelをチェックし、デフォルト値を設定
    const concurrency = config.maxConcurrency || config.maxParallel || 3;
    this.limit = pLimit(concurrency);
    this.parallelExecutor = new ParallelExecutor(concurrency);
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
    const { globalProgressReporter } = await import('../ui/progress.js');

    // TaskConfigをParallelTaskに変換
    const parallelTasks: ParallelTask<TaskResult>[] = tasks.map((task, index) => ({
      id: `task-${index}`,
      description: task.description,
      priority: task.priority || 5,
      timeout: task.timeout,
      task: () => this.executeSingleTask(task, provider),
    }));

    // 独立したタスクを識別
    const independentTasks = this.identifyIndependentTasks(parallelTasks);
    const dependentTasks = parallelTasks.filter(t => !independentTasks.some(it => it.id === t.id));

    let results: TaskResult[] = [];

    // 独立したタスクを並列実行
    if (independentTasks.length > 0) {
      globalProgressReporter.showInfo(`${independentTasks.length}個の独立タスクを並列実行中...`);
      
      try {
        const parallelResults = await this.parallelExecutor.executeParallelWithDetails(
          independentTasks,
          (completed, total, currentTask) => {
            globalProgressReporter.showInfo(`並列実行進捗: ${completed}/${total} - ${currentTask}`);
          }
        );

        results = parallelResults.map(pr => pr.success ? {
          success: true,
          message: pr.taskId || 'Unknown task',
          data: pr.data,
          duration: pr.duration
        } : {
          success: false,
          message: `タスクエラー: ${pr.taskId}`,
          error: pr.error,
          duration: pr.duration
        });
      } catch (error) {
        // 並列実行でエラーが発生した場合のフォールバック処理
        logger.error('並列実行でエラーが発生しました。順次実行にフォールバックします:', error);
        globalProgressReporter.showWarning('並列実行でエラーが発生したため、順次実行に切り替えます');
        
        // 順次実行にフォールバック
        const fallbackResults = await this.executeSequentialTasks(independentTasks, provider);
        results.push(...fallbackResults);
      }
    }

    // 依存関係のあるタスクを順次実行
    if (dependentTasks.length > 0) {
      globalProgressReporter.showInfo(`${dependentTasks.length}個の依存タスクを順次実行中...`);
      
      try {
        const sequentialResults = await this.executeSequentialTasks(dependentTasks, provider);
        results.push(...sequentialResults);
      } catch (error) {
        logger.error('依存タスクの順次実行でエラーが発生:', error);
        // 依存タスクのエラーは致命的なので、エラー結果を追加
        results.push({
          success: false,
          message: `依存タスク実行エラー: ${error instanceof Error ? error.message : String(error)}`,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    return results;
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

  /**
   * 独立したタスクを識別する
   * ファイルの重複や依存関係を分析して並列実行可能なタスクを特定
   */
  private identifyIndependentTasks(tasks: ParallelTask<TaskResult>[]): ParallelTask<TaskResult>[] {
    // シンプルな独立性判定ルール
    const independentTasks: ParallelTask<TaskResult>[] = [];
    const usedFiles = new Set<string>();
    
    for (const task of tasks) {
      // タスクの説明から関連ファイルを推測
      const taskFiles = this.extractFilesFromTask(task);
      
      // ファイルの競合がないかチェック
      const hasConflict = taskFiles.some(file => usedFiles.has(file));
      
      if (!hasConflict) {
        independentTasks.push(task);
        // forEach + asyncの問題を修正：for...ofループを使用
        for (const file of taskFiles) {
          usedFiles.add(file);
        }
      }
    }
    
    // 最低でも1つのタスクは独立として扱う
    if (independentTasks.length === 0 && tasks.length > 0) {
      independentTasks.push(tasks[0]);
    }
    
    logger.debug(`${tasks.length}個中${independentTasks.length}個のタスクが独立として識別されました`);
    return independentTasks;
  }

  /**
   * タスクから関連ファイルを抽出
   */
  private extractFilesFromTask(task: ParallelTask<TaskResult>): string[] {
    const files: string[] = [];
    const description = task.description || '';
    
    // ファイルパスのパターンを検索
    const filePatterns = [
      /[\w-]+\.[\w]+/g, // file.ext形式
      /src\/[\w\/.-]+/g, // src/から始まるパス
      /\.\/[\w\/.-]+/g, // 相対パス
      /\/[\w\/.-]+/g, // 絶対パス
    ];
    
    for (const pattern of filePatterns) {
      const matches = description.match(pattern);
      if (matches) {
        files.push(...matches);
      }
    }
    
    return [...new Set(files)]; // 重複除去
  }

  /**
   * 依存関係のあるタスクを順次実行
   */
  private async executeSequentialTasks(
    tasks: ParallelTask<TaskResult>[],
    provider: LLMProvider
  ): Promise<TaskResult[]> {
    const results: TaskResult[] = [];
    const { globalProgressReporter } = await import('../ui/progress.js');

    for (let i = 0; i < tasks.length; i++) {
      const parallelTask = tasks[i];
      
      globalProgressReporter.showInfo(`[${i + 1}/${tasks.length}] ${parallelTask.description}`);
      
      try {
        const result = await parallelTask.task();
        results.push(result);

        if (result.success) {
          globalProgressReporter.showInfo(`✅ タスク${i + 1}完了: ${parallelTask.description}`);
        } else {
          globalProgressReporter.showError(`❌ タスク${i + 1}失敗: ${parallelTask.description}`);
          // 依存タスクでエラーが発生した場合は中断
          break;
        }
      } catch (error) {
        const errorResult: TaskResult = {
          success: false,
          message: `タスク実行エラー: ${parallelTask.description}`,
          error: error instanceof Error ? error : new Error(String(error)),
        };
        results.push(errorResult);
        globalProgressReporter.showError(`❌ タスク${i + 1}エラー: ${parallelTask.description}`);
        break;
      }
    }

    return results;
  }

  /**
   * 並列度を更新（ParallelExecutorにも反映）
   */
  updateConcurrency(newConcurrency: number): void {
    const concurrency = Math.max(1, newConcurrency);
    this.limit = pLimit(concurrency);
    this.parallelExecutor.setMaxConcurrency(concurrency);
    logger.info(`並列度を更新しました: ${concurrency}`);
  }

  /**
   * 現在の並列度を取得
   */
  getCurrentConcurrency(): number {
    return this.parallelExecutor.getMaxConcurrency();
  }
}

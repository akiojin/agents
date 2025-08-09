import { EventEmitter } from 'events';
import pLimit from 'p-limit';
import type { Config, TaskConfig, TaskResult } from '../config/types.js';
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
    // maxConcurrencyまたはmaxParallelをチェックし、デフォルト値をConfig
    const concurrency = config.maxConcurrency || config.maxParallel || 3;
    this.limit = pLimit(concurrency);
    this.parallelExecutor = new ParallelExecutor(concurrency);
  }

  async execute(taskConfig: TaskConfig, provider: LLMProvider): Promise<TaskResult> {
    const startTime = Date.now();
    const { globalProgressReporter } = await import('../ui/progress.js');

    try {
      // Taskを細minutes化
      const subtasks = this.decomposeTasks(taskConfig);
      const subtaskNames = subtasks.map((task, index) => `サブTask${index + 1}: ${task.description}`);
      
      // プログレス表示Started
      globalProgressReporter.startTask(
        `TaskExecute: ${taskConfig.description}`,
        ['TaskDecompose', this.parallelMode ? 'ParallelExecute' : 'SequentialExecute', 'ResultIntegrate']
      );
      
      logger.info(`TaskExecuteStarted: ${taskConfig.description}`);

      // TaskDecomposeCompleted
      globalProgressReporter.updateSubtask(0);
      
      let results: TaskResult[];

      if (this.parallelMode && taskConfig.parallel !== false) {
        // ParallelExecute
        globalProgressReporter.updateSubtask(1);
        globalProgressReporter.showInfo(`${subtasks.length}itemsのサブTaskをParallelExecuteします`);
        results = await this.executeParallel(subtasks, provider);
      } else {
        // SequentialExecute
        globalProgressReporter.updateSubtask(1);
        globalProgressReporter.showInfo(`${subtasks.length}itemsのサブTaskをSequentialExecuteします`);
        results = await this.executeSequential(subtasks, provider);
      }

      // ResultIntegrate
      globalProgressReporter.updateSubtask(2);
      const finalResult = this.mergeResults(results);
      finalResult.duration = Date.now() - startTime;

      // Success/Failedの判定
      const successCount = results.filter(r => r.success).length;
      const success = successCount === results.length;
      
      globalProgressReporter.completeTask(success);
      logger.info(`TaskExecuteCompleted: ${taskConfig.description} (${finalResult.duration}ms)`);
      
      if (!success) {
        globalProgressReporter.showWarning(`${results.length}items中${successCount}itemsのサブTaskがSuccessdone`);
      }

      return finalResult;
    } catch (error) {
      logger.error('TaskExecuteError:', error);
      globalProgressReporter.completeTask(false);
      globalProgressReporter.showError(error instanceof Error ? error.message : String(error));

      return {
        success: false,
        message: `TaskExecuteError: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error)),
        duration: Date.now() - startTime,
      };
    }
  }

  private decomposeTasks(taskConfig: TaskConfig): TaskConfig[] {
    // TaskのDecomposeロジック
    // 現在は単純に元のTaskをそのまま返す
    // 将来的にはAIを使用してTaskを細minutes化
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
      
      // items別Taskの進捗表示
      globalProgressReporter.showInfo(`[${i + 1}/${tasks.length}] ${task.description}`);
      
      const result = await this.executeSingleTask(task, provider);
      results.push(result);

      if (result.success) {
        globalProgressReporter.showInfo(`✅ サブTask${i + 1}Completed: ${task.description}`);
      } else {
        globalProgressReporter.showError(`❌ サブTask${i + 1}Failed: ${task.description}`);
        // Erroroccurredした場合は中断
        break;
      }
    }

    return results;
  }

  private async executeParallel(tasks: TaskConfig[], provider: LLMProvider): Promise<TaskResult[]> {
    const { globalProgressReporter } = await import('../ui/progress.js');

    // TaskConfigをParallelTaskにConvert
    const parallelTasks: ParallelTask<TaskResult>[] = tasks.map((task, index) => ({
      id: `task-${index}`,
      description: task.description,
      priority: task.priority || 5,
      timeout: task.timeout,
      task: () => this.executeSingleTask(task, provider),
    }));

    // 独立したTaskを識別
    const independentTasks = this.identifyIndependentTasks(parallelTasks);
    const dependentTasks = parallelTasks.filter(t => !independentTasks.some(it => it.id === t.id));

    let results: TaskResult[] = [];

    // 独立したTaskをParallelExecute
    if (independentTasks.length > 0) {
      globalProgressReporter.showInfo(`${independentTasks.length}itemsの独立TaskをParallelExecute中...`);
      
      try {
        const parallelResults = await this.parallelExecutor.executeParallelWithDetails(
          independentTasks,
          (completed, total, currentTask) => {
            globalProgressReporter.showInfo(`ParallelExecute進捗: ${completed}/${total} - ${currentTask}`);
          }
        );

        results = parallelResults.map(pr => pr.success ? {
          success: true,
          message: pr.taskId || 'Unknown task',
          data: pr.data,
          duration: pr.duration
        } : {
          success: false,
          message: `TaskError: ${pr.taskId}`,
          error: pr.error,
          duration: pr.duration
        });
      } catch (error) {
        // ParallelExecuteでErroroccurredした場合のFallbackProcessing
        logger.error('ParallelExecuteでErroroccurreddone。SequentialExecuteにFallbackします:', error);
        globalProgressReporter.showWarning('ParallelExecuteでErroroccurredしたため、SequentialExecuteswitching to');
        
        // SequentialExecuteにFallback
        const fallbackResults = await this.executeSequentialTasks(independentTasks, provider);
        results.push(...fallbackResults);
      }
    }

    // 依存関係のあるTaskをSequentialExecute
    if (dependentTasks.length > 0) {
      globalProgressReporter.showInfo(`${dependentTasks.length}itemsの依存TaskをSequentialExecute中...`);
      
      try {
        const sequentialResults = await this.executeSequentialTasks(dependentTasks, provider);
        results.push(...sequentialResults);
      } catch (error) {
        logger.error('依存TaskのSequentialExecuteでErroroccurred:', error);
        // 依存TaskのErrorは致命的なので、ErrorResultを追加
        results.push({
          success: false,
          message: `依存TaskExecuteError: ${error instanceof Error ? error.message : String(error)}`,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    return results;
  }

  private async executeSingleTask(task: TaskConfig, provider: LLMProvider): Promise<TaskResult> {
    try {
      this.emit('subtask:start', task);

      // Taskをプロンプトに変換
      const prompt = this.buildPrompt(task);

      // LLMにchatで実行を依頼（システムプロンプトが適用される）
      const response = await provider.chat([
        { role: 'user', content: prompt }
      ], {
        temperature: 0.3,
        maxTokens: 4000,
      });

      const result: TaskResult = {
        success: true,
        message: task.description,
        data: typeof response === 'string' ? response : response.content,
      };

      this.emit('subtask:complete', result);
      return result;
    } catch (error) {
      const errorResult: TaskResult = {
        success: false,
        message: `サブTaskError: ${task.description}`,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      this.emit('subtask:error', errorResult);
      return errorResult;
    }
  }

  private buildPrompt(task: TaskConfig): string {
    let prompt = `以下のTaskをExecuteしてplease:\n\n${task.description}\n`;

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
      message: allSuccess ? 'All tasks completed successfully' : 'Some tasks failed',
      data: data.length === 1 ? data[0] : data,
    };
  }

  setParallelMode(enabled: boolean): void {
    this.parallelMode = enabled;
    logger.info(`ParallelExecuteモード: ${enabled ? '有効' : '無効'}`);
  }

  /**
   * 独立したTaskを識別する
   * ファイルの重複や依存関係をminutes析してParallelExecute可能なTaskを特定
   */
  private identifyIndependentTasks(tasks: ParallelTask<TaskResult>[]): ParallelTask<TaskResult>[] {
    // シンプルな独立性判定ルール
    const independentTasks: ParallelTask<TaskResult>[] = [];
    const usedFiles = new Set<string>();
    
    for (const task of tasks) {
      // Taskの説明から関連ファイルを推測
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
    
    // 最低でも1つのTaskは独立として扱う
    if (independentTasks.length === 0 && tasks.length > 0) {
      independentTasks.push(tasks[0]);
    }
    
    logger.debug(`${tasks.length}items中${independentTasks.length}itemsのTaskが独立として識別さed`);
    return independentTasks;
  }

  /**
   * Taskから関連ファイルを抽出
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
   * 依存関係のあるTaskをSequentialExecute
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
          globalProgressReporter.showInfo(`✅ Task${i + 1}Completed: ${parallelTask.description}`);
        } else {
          globalProgressReporter.showError(`❌ Task${i + 1}Failed: ${parallelTask.description}`);
          // 依存TaskでErroroccurredした場合は中断
          break;
        }
      } catch (error) {
        const errorResult: TaskResult = {
          success: false,
          message: `TaskExecuteError: ${parallelTask.description}`,
          error: error instanceof Error ? error : new Error(String(error)),
        };
        results.push(errorResult);
        globalProgressReporter.showError(`❌ Task${i + 1}Error: ${parallelTask.description}`);
        break;
      }
    }

    return results;
  }

  /**
   * Parallel度をUpdate（ParallelExecutorにも反映）
   */
  updateConcurrency(newConcurrency: number): void {
    const concurrency = Math.max(1, newConcurrency);
    this.limit = pLimit(concurrency);
    this.parallelExecutor.setMaxConcurrency(concurrency);
    logger.info(`Parallel度をUpdatedone: ${concurrency}`);
  }

  /**
   * 現在のParallel度をGet
   */
  getCurrentConcurrency(): number {
    return this.parallelExecutor.getMaxConcurrency();
  }
}

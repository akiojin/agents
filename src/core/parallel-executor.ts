import { logger } from '../utils/logger.js';

/**
 * ParallelExecuteTaskの定義
 */
export interface ParallelTask<T = any> {
  /** TaskID（Options） */
  id?: string;
  /** Taskの説明 */
  description?: string;
  /** 実際にExecuteするPromise関数 */
  task: () => Promise<T>;
  /** Taskの優先度（1-10、デフォルト: 5） */
  priority?: number;
  /** Timeout時間（ミリseconds） */
  timeout?: number;
}

/**
 * ParallelExecuteResult
 */
export interface ParallelResult<T = any> {
  /** ExecuteSuccessかどうか */
  success: boolean;
  /** Resultデータ（Success時） */
  data?: T;
  /** Error（Failed時） */
  error?: Error;
  /** TaskID */
  taskId?: string;
  /** Execute時間（ミリseconds） */
  duration: number;
}

/**
 * 進捗レポートコールバック
 */
export type ProgressCallback = (completed: number, total: number, currentTask?: string) => void;

/**
 * 基本的なParallelProcessingExecuteクラス
 * シンプルで実用的なParallelTaskExecuteを提供
 */
export class ParallelExecutor {
  private maxConcurrency: number;

  constructor(maxConcurrency: number = 5) {
    this.maxConcurrency = Math.max(1, maxConcurrency);
  }

  /**
   * TaskをParallelExecuteする（基本版）
   * @param tasks ExecuteするTaskの配列
   * @param onProgress 進捗コールバック
   * @returns ExecuteResultの配列
   */
  async executeParallel<T>(
    tasks: (() => Promise<T>)[],
    onProgress?: ProgressCallback,
  ): Promise<T[]> {
    if (tasks.length === 0) {
      return [];
    }

    const results: T[] = [];
    let completed = 0;

    // チャンクminutes割してParallelExecute
    const chunks = this.chunkArray(tasks, this.maxConcurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (task) => {
        try {
          const result = await task();
          completed++;
          onProgress?.(completed, tasks.length, `Task ${completed}`);
          return result;
        } catch (error) {
          completed++;
          onProgress?.(completed, tasks.length, `Task ${completed} (Error)`);
          throw error;
        }
      });

      // Promise.allではなくPromise.allSettledを使用してErrorProcessingを改善
      const chunkSettledResults = await Promise.allSettled(chunkPromises);
      
      for (const settledResult of chunkSettledResults) {
        if (settledResult.status === 'fulfilled') {
          results.push(settledResult.value);
        } else {
          // Erroroccurredした場合はログに記録し、Errorを再スロー
          logger.error('ParallelTaskでErroroccurred:', settledResult.reason);
          throw settledResult.reason;
        }
      }
    }

    return results;
  }

  /**
   * TaskをParallelExecuteする（Details版）
   * @param tasks ParallelTaskの配列
   * @param onProgress 進捗コールバック
   * @returns DetailsなExecuteResultの配列
   */
  async executeParallelWithDetails<T>(
    tasks: ParallelTask<T>[],
    onProgress?: ProgressCallback,
  ): Promise<ParallelResult<T>[]> {
    if (tasks.length === 0) {
      return [];
    }

    // 優先度でソート（高い順）
    const sortedTasks = [...tasks].sort((a, b) => (b.priority || 5) - (a.priority || 5));

    const results: ParallelResult<T>[] = [];
    let completed = 0;

    // チャンクminutes割してParallelExecute
    const chunks = this.chunkArray(sortedTasks, this.maxConcurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (parallelTask, index) => {
        const startTime = Date.now();
        const taskId = parallelTask.id || `task-${Date.now()}-${index}`;

        try {
          logger.debug(`ParallelTaskStarted: ${taskId} - ${parallelTask.description || 'Unknown task'}`);

          let result: T;

          // TimeoutConfigがある場合
          if (parallelTask.timeout) {
            result = await Promise.race([
              parallelTask.task(),
              this.createTimeoutPromise<T>(parallelTask.timeout),
            ]);
          } else {
            result = await parallelTask.task();
          }

          const duration = Date.now() - startTime;
          completed++;

          onProgress?.(
            completed,
            sortedTasks.length,
            parallelTask.description || taskId,
          );

          logger.debug(`ParallelTaskCompleted: ${taskId} (${duration}ms)`);

          return {
            success: true,
            data: result,
            taskId,
            duration,
          } as ParallelResult<T>;
        } catch (error) {
          const duration = Date.now() - startTime;
          completed++;

          onProgress?.(
            completed,
            sortedTasks.length,
            `${parallelTask.description || taskId} (Error)`,
          );

          logger.error(`ParallelTaskError: ${taskId} (${duration}ms)`, error);

          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            taskId,
            duration,
          } as ParallelResult<T>;
        }
      });

      const chunkResults = await Promise.all(chunkPromises);
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * 独立したTaskを自動検出してParallelExecute
   * @param tasks ExecuteするTask
   * @param dependencyDetector 依存関係検出関数
   * @param onProgress 進捗コールバック
   */
  async executeWithDependencyAnalysis<T>(
    tasks: ParallelTask<T>[],
    dependencyDetector: (task: ParallelTask<T>) => string[],
    onProgress?: ProgressCallback,
  ): Promise<ParallelResult<T>[]> {
    // 依存関係グラフを構築
    const dependencyGraph = new Map<string, string[]>();
    const taskMap = new Map<string, ParallelTask<T>>();

    // forEach + asyncの問題を修正：for...ofループを使用
    for (const task of tasks) {
      const taskId = task.id || `task-${Date.now()}-${Math.random()}`;
      task.id = taskId;
      taskMap.set(taskId, task);
      dependencyGraph.set(taskId, dependencyDetector(task));
    }

    // トポロジカルソートでExecute順序を決定
    const executionLevels = this.topologicalSort(dependencyGraph);
    const results: ParallelResult<T>[] = [];
    let completed = 0;

    // 各レベルをParallelExecute
    for (const level of executionLevels) {
      const levelTasks = level.map((taskId) => taskMap.get(taskId)!);
      const levelResults = await this.executeParallelWithDetails(
        levelTasks,
        (levelCompleted, _levelTotal, currentTask) => {
          onProgress?.(completed + levelCompleted, tasks.length, currentTask);
        },
      );

      results.push(...levelResults);
      completed += level.length;
    }

    return results;
  }

  /**
   * 配列をチャンクにminutes割
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * TimeoutPromiseを作成
   */
  private createTimeoutPromise<T>(timeoutMs: number): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * トポロジカルソート（Kahn's algorithm）
   */
  private topologicalSort(dependencyGraph: Map<string, string[]>): string[][] {
    const inDegree = new Map<string, number>();
    const nodes = Array.from(dependencyGraph.keys());

    // 入次数を計算 - forEach + asyncの問題を修正：for...ofループを使用
    for (const node of nodes) {
      inDegree.set(node, 0);
    }
    
    for (const [, deps] of dependencyGraph) {
      for (const dep of deps) {
        if (dependencyGraph.has(dep)) {
          inDegree.set(dep, (inDegree.get(dep) || 0) + 1);
        }
      }
    }

    const levels: string[][] = [];
    const remaining = new Set(nodes);

    while (remaining.size > 0) {
      // 入次数0のノードを見つける
      const currentLevel = Array.from(remaining).filter(
        (node) => (inDegree.get(node) || 0) === 0,
      );

      if (currentLevel.length === 0) {
        // 循環依存が検出された場合、残りを最後のレベルに追加
        levels.push(Array.from(remaining));
        break;
      }

      levels.push(currentLevel);

      // 現在のレベルのノードをProcessing - forEach + asyncの問題を修正：for...ofループを使用
      for (const node of currentLevel) {
        remaining.delete(node);
        const deps = dependencyGraph.get(node) || [];
        for (const dep of deps) {
          if (inDegree.has(dep)) {
            inDegree.set(dep, (inDegree.get(dep) || 0) - 1);
          }
        }
      }
    }

    return levels;
  }

  /**
   * Parallel度changed
   */
  setMaxConcurrency(maxConcurrency: number): void {
    this.maxConcurrency = Math.max(1, maxConcurrency);
    logger.info(`Parallel度changeddone: ${this.maxConcurrency}`);
  }

  /**
   * 現在のParallel度をGet
   */
  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }
}
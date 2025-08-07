import { logger } from '../utils/logger.js';

/**
 * 並列実行タスクの定義
 */
export interface ParallelTask<T = any> {
  /** タスクID（オプション） */
  id?: string;
  /** タスクの説明 */
  description?: string;
  /** 実際に実行するPromise関数 */
  task: () => Promise<T>;
  /** タスクの優先度（1-10、デフォルト: 5） */
  priority?: number;
  /** タイムアウト時間（ミリ秒） */
  timeout?: number;
}

/**
 * 並列実行結果
 */
export interface ParallelResult<T = any> {
  /** 実行成功かどうか */
  success: boolean;
  /** 結果データ（成功時） */
  data?: T;
  /** エラー（失敗時） */
  error?: Error;
  /** タスクID */
  taskId?: string;
  /** 実行時間（ミリ秒） */
  duration: number;
}

/**
 * 進捗レポートコールバック
 */
export type ProgressCallback = (completed: number, total: number, currentTask?: string) => void;

/**
 * 基本的な並列処理実行クラス
 * シンプルで実用的な並列タスク実行を提供
 */
export class ParallelExecutor {
  private maxConcurrency: number;

  constructor(maxConcurrency: number = 5) {
    this.maxConcurrency = Math.max(1, maxConcurrency);
  }

  /**
   * タスクを並列実行する（基本版）
   * @param tasks 実行するタスクの配列
   * @param onProgress 進捗コールバック
   * @returns 実行結果の配列
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

    // チャンク分割して並列実行
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

      // Promise.allではなくPromise.allSettledを使用してエラー処理を改善
      const chunkSettledResults = await Promise.allSettled(chunkPromises);
      
      for (const settledResult of chunkSettledResults) {
        if (settledResult.status === 'fulfilled') {
          results.push(settledResult.value);
        } else {
          // エラーが発生した場合はログに記録し、エラーを再スロー
          logger.error('並列タスクでエラーが発生:', settledResult.reason);
          throw settledResult.reason;
        }
      }
    }

    return results;
  }

  /**
   * タスクを並列実行する（詳細版）
   * @param tasks 並列タスクの配列
   * @param onProgress 進捗コールバック
   * @returns 詳細な実行結果の配列
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

    // チャンク分割して並列実行
    const chunks = this.chunkArray(sortedTasks, this.maxConcurrency);

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(async (parallelTask, index) => {
        const startTime = Date.now();
        const taskId = parallelTask.id || `task-${Date.now()}-${index}`;

        try {
          logger.debug(`並列タスク開始: ${taskId} - ${parallelTask.description || 'Unknown task'}`);

          let result: T;

          // タイムアウト設定がある場合
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

          logger.debug(`並列タスク完了: ${taskId} (${duration}ms)`);

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

          logger.error(`並列タスクエラー: ${taskId} (${duration}ms)`, error);

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
   * 独立したタスクを自動検出して並列実行
   * @param tasks 実行するタスク
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

    // トポロジカルソートで実行順序を決定
    const executionLevels = this.topologicalSort(dependencyGraph);
    const results: ParallelResult<T>[] = [];
    let completed = 0;

    // 各レベルを並列実行
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
   * 配列をチャンクに分割
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * タイムアウトPromiseを作成
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

      // 現在のレベルのノードを処理 - forEach + asyncの問題を修正：for...ofループを使用
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
   * 並列度を変更
   */
  setMaxConcurrency(maxConcurrency: number): void {
    this.maxConcurrency = Math.max(1, maxConcurrency);
    logger.info(`並列度を変更しました: ${this.maxConcurrency}`);
  }

  /**
   * 現在の並列度を取得
   */
  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }
}
import EventEmitter from 'events';
import { logger } from '../utils/logger.js';

/**
 * タスクの優先度定義
 */
export enum TaskPriority {
  /** 緊急コマンド（/stop, /kill, /status等） */
  URGENT = 0,
  /** 通常のユーザー入力 */
  NORMAL = 1,
  /** バックグラウンドタスク */
  LOW = 2
}

/**
 * キューに格納されるタスクアイテム
 */
export interface QueuedTask<T = any> {
  id: string;
  priority: TaskPriority;
  payload: T;
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
  abortController?: AbortController;
}

/**
 * 優先度付きタスクキュー
 * 緊急度の高いタスクを優先的に処理する
 */
export class PriorityQueue<T = any> extends EventEmitter {
  private queues: Map<TaskPriority, QueuedTask<T>[]>;
  private processing = false;
  private processingTask: QueuedTask<T> | null = null;
  private taskIdCounter = 0;
  
  constructor() {
    super();
    this.queues = new Map();
    
    // 各優先度のキューを初期化
    Object.values(TaskPriority).forEach(priority => {
      if (typeof priority === 'number') {
        this.queues.set(priority, []);
      }
    });
    
    logger.debug('PriorityQueue initialized');
  }

  /**
   * タスクをキューに追加
   */
  enqueue(
    payload: T,
    priority: TaskPriority = TaskPriority.NORMAL,
    options: {
      maxRetries?: number;
      abortController?: AbortController;
    } = {}
  ): string {
    const taskId = `task-${++this.taskIdCounter}`;
    const task: QueuedTask<T> = {
      id: taskId,
      priority,
      payload,
      timestamp: new Date(),
      retryCount: 0,
      maxRetries: options.maxRetries ?? 3,
      abortController: options.abortController
    };

    const queue = this.queues.get(priority);
    if (!queue) {
      throw new Error(`Invalid priority: ${priority}`);
    }

    queue.push(task);
    
    logger.debug(`Task enqueued: ${taskId} (priority: ${priority})`);
    this.emit('task:enqueued', task);
    
    // 緊急タスクの場合、現在処理中のタスクを中断して優先処理
    if (priority === TaskPriority.URGENT && this.processingTask) {
      this.interruptCurrentTask();
    }
    
    // 処理開始
    this.processNext();
    
    return taskId;
  }

  /**
   * 次のタスクをキューから取得（優先度順）
   */
  dequeue(): QueuedTask<T> | null {
    // 優先度順にキューをチェック
    for (const priority of [TaskPriority.URGENT, TaskPriority.NORMAL, TaskPriority.LOW]) {
      const queue = this.queues.get(priority);
      if (queue && queue.length > 0) {
        return queue.shift() || null;
      }
    }
    return null;
  }

  /**
   * 現在処理中のタスクを中断
   */
  private interruptCurrentTask(): void {
    if (this.processingTask?.abortController) {
      logger.debug(`Interrupting current task: ${this.processingTask.id}`);
      this.processingTask.abortController.abort();
      this.emit('task:interrupted', this.processingTask);
    }
  }

  /**
   * 次のタスクの処理を開始
   */
  private async processNext(): Promise<void> {
    if (this.processing) {
      return;
    }

    const nextTask = this.dequeue();
    if (!nextTask) {
      return;
    }

    this.processing = true;
    this.processingTask = nextTask;

    try {
      logger.debug(`Processing task: ${nextTask.id}`);
      this.emit('task:started', nextTask);
      
      // タスク処理の開始をイベントで通知
      this.emit('process', nextTask);
      
    } catch (error) {
      logger.error(`Task processing error: ${nextTask.id}`, error);
      this.emit('task:error', nextTask, error);
      
      // リトライ処理
      if (nextTask.retryCount < nextTask.maxRetries) {
        nextTask.retryCount++;
        logger.debug(`Retrying task: ${nextTask.id} (attempt ${nextTask.retryCount})`);
        this.queues.get(nextTask.priority)?.unshift(nextTask);
      } else {
        logger.error(`Task failed after ${nextTask.maxRetries} attempts: ${nextTask.id}`);
        this.emit('task:failed', nextTask);
      }
    }
  }

  /**
   * タスクの処理完了を通知
   */
  taskCompleted(taskId: string, result?: any): void {
    if (this.processingTask?.id === taskId) {
      logger.debug(`Task completed: ${taskId}`);
      this.emit('task:completed', this.processingTask, result);
      this.processingTask = null;
      this.processing = false;
      
      // 次のタスクの処理を開始
      setImmediate(() => this.processNext());
    }
  }

  /**
   * 特定のタスクをキャンセル
   */
  cancelTask(taskId: string): boolean {
    // 処理中のタスクの場合
    if (this.processingTask?.id === taskId) {
      this.interruptCurrentTask();
      return true;
    }

    // キュー内のタスクを検索してキャンセル
    for (const queue of this.queues.values()) {
      const index = queue.findIndex(task => task.id === taskId);
      if (index !== -1) {
        const task = queue.splice(index, 1)[0];
        logger.debug(`Task cancelled: ${taskId}`);
        this.emit('task:cancelled', task);
        return true;
      }
    }

    return false;
  }

  /**
   * キューの状態を取得
   */
  getStatus(): {
    totalTasks: number;
    urgent: number;
    normal: number;
    low: number;
    processing: QueuedTask<T> | null;
  } {
    const urgent = this.queues.get(TaskPriority.URGENT)?.length || 0;
    const normal = this.queues.get(TaskPriority.NORMAL)?.length || 0;
    const low = this.queues.get(TaskPriority.LOW)?.length || 0;
    
    return {
      totalTasks: urgent + normal + low,
      urgent,
      normal,
      low,
      processing: this.processingTask
    };
  }

  /**
   * 全タスクをクリア
   */
  clear(): void {
    this.queues.forEach(queue => queue.length = 0);
    if (this.processingTask) {
      this.interruptCurrentTask();
      this.processingTask = null;
    }
    this.processing = false;
    
    logger.debug('Priority queue cleared');
    this.emit('queue:cleared');
  }

  /**
   * キューが空かどうか
   */
  isEmpty(): boolean {
    return this.getStatus().totalTasks === 0 && !this.processingTask;
  }
}
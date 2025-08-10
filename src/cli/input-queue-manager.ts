import EventEmitter from 'events';
import { PriorityQueue, TaskPriority, QueuedTask } from './priority-queue.js';
import { logger } from '../utils/logger.js';

/**
 * ユーザー入力の種類
 */
export enum InputType {
  /** スラッシュコマンド */
  SLASH_COMMAND = 'slash_command',
  /** 通常のメッセージ */
  MESSAGE = 'message',
  /** システムコマンド */
  SYSTEM = 'system'
}

/**
 * 処理対象の入力データ
 */
export interface InputItem {
  type: InputType;
  content: string;
  originalInput: string;
  command?: string;
  args?: string;
  timestamp: Date;
  sessionId?: string;
}

/**
 * 処理結果
 */
export interface ProcessingResult {
  success: boolean;
  result?: any;
  error?: Error;
  duration: number;
}

/**
 * 緊急コマンド一覧
 * これらのコマンドは最高優先度で処理される
 */
const URGENT_COMMANDS = new Set([
  '/stop',
  '/kill',
  '/status',
  '/jobs',
  '/interrupt',
  '/abort',
  '/emergency'
]);

/**
 * 入力キュー管理クラス
 * ユーザー入力を優先度付きで管理し、非同期処理を実現
 */
export class InputQueueManager extends EventEmitter {
  private queue: PriorityQueue<InputItem>;
  private stats = {
    totalProcessed: 0,
    urgent: 0,
    normal: 0,
    errors: 0,
    averageProcessingTime: 0
  };
  
  constructor() {
    super();
    this.queue = new PriorityQueue<InputItem>();
    
    // キューイベントの転送
    this.queue.on('task:enqueued', (task) => {
      this.emit('input:queued', task);
    });
    
    this.queue.on('task:started', (task) => {
      this.emit('input:started', task);
    });
    
    this.queue.on('task:completed', (task, result) => {
      this.updateStats(task, result);
      this.emit('input:completed', task, result);
    });
    
    this.queue.on('task:error', (task, error) => {
      this.stats.errors++;
      this.emit('input:error', task, error);
    });
    
    this.queue.on('task:cancelled', (task) => {
      this.emit('input:cancelled', task);
    });
    
    this.queue.on('process', (task) => {
      // 実際の処理は外部で行う
      this.emit('process:input', task);
    });
    
    logger.debug('InputQueueManager initialized');
  }

  /**
   * ユーザー入力をキューに追加
   */
  addInput(
    rawInput: string,
    options: {
      sessionId?: string;
      abortController?: AbortController;
    } = {}
  ): string {
    const inputItem = this.parseInput(rawInput);
    const priority = this.determinePriority(inputItem);
    
    logger.debug(`Adding input: "${rawInput}" (type: ${inputItem.type}, priority: ${priority})`);
    
    const taskId = this.queue.enqueue(inputItem, priority, {
      abortController: options.abortController,
      maxRetries: inputItem.type === InputType.SLASH_COMMAND ? 1 : 3
    });
    
    return taskId;
  }

  /**
   * 入力文字列を解析してInputItemに変換
   */
  private parseInput(rawInput: string): InputItem {
    const trimmedInput = rawInput.trim();
    const timestamp = new Date();
    
    // スラッシュコマンドの判定
    if (trimmedInput.startsWith('/')) {
      const parts = trimmedInput.split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ');
      
      return {
        type: InputType.SLASH_COMMAND,
        content: trimmedInput,
        originalInput: rawInput,
        command,
        args,
        timestamp
      };
    }
    
    // システムコマンドの判定（将来の拡張用）
    if (trimmedInput.startsWith('system:')) {
      return {
        type: InputType.SYSTEM,
        content: trimmedInput.substring(7),
        originalInput: rawInput,
        timestamp
      };
    }
    
    // 通常のメッセージ
    return {
      type: InputType.MESSAGE,
      content: trimmedInput,
      originalInput: rawInput,
      timestamp
    };
  }

  /**
   * 入力の優先度を決定
   */
  private determinePriority(inputItem: InputItem): TaskPriority {
    if (inputItem.type === InputType.SLASH_COMMAND && inputItem.command) {
      // 緊急コマンドの判定
      if (URGENT_COMMANDS.has(inputItem.command)) {
        return TaskPriority.URGENT;
      }
      // その他のコマンドは通常優先度
      return TaskPriority.NORMAL;
    }
    
    if (inputItem.type === InputType.SYSTEM) {
      return TaskPriority.URGENT;
    }
    
    // 通常のメッセージ
    return TaskPriority.NORMAL;
  }

  /**
   * タスクの処理完了を通知
   */
  completeTask(taskId: string, result: ProcessingResult): void {
    this.queue.taskCompleted(taskId, result);
  }

  /**
   * タスクをキャンセル
   */
  cancelTask(taskId: string): boolean {
    return this.queue.cancelTask(taskId);
  }

  /**
   * 全てのタスクを停止
   */
  stopAll(): void {
    logger.info('Stopping all queued tasks');
    this.queue.clear();
    this.emit('all:stopped');
  }

  /**
   * 緊急停止（現在の処理も含めて全て停止）
   */
  emergencyStop(): void {
    logger.warn('Emergency stop initiated');
    this.queue.clear();
    this.emit('emergency:stop');
  }

  /**
   * キューの現在状態を取得
   */
  getStatus() {
    const queueStatus = this.queue.getStatus();
    
    return {
      queue: queueStatus,
      stats: { ...this.stats },
      isEmpty: this.queue.isEmpty(),
      isProcessing: queueStatus.processing !== null
    };
  }

  /**
   * 詳細なステータス文字列を生成
   */
  getStatusString(): string {
    const status = this.getStatus();
    const lines = [
      `📊 Queue Status:`,
      `  Total: ${status.queue.totalTasks} tasks`,
      `  Urgent: ${status.queue.urgent}, Normal: ${status.queue.normal}, Low: ${status.queue.low}`,
      `  Processing: ${status.isProcessing ? status.queue.processing?.payload.type : 'None'}`,
      ``,
      `📈 Statistics:`,
      `  Total processed: ${status.stats.totalProcessed}`,
      `  Urgent: ${status.stats.urgent}, Normal: ${status.stats.normal}`,
      `  Errors: ${status.stats.errors}`,
      `  Average time: ${status.stats.averageProcessingTime.toFixed(2)}ms`
    ];
    
    return lines.join('\\n');
  }

  /**
   * 統計情報を更新
   */
  private updateStats(task: QueuedTask<InputItem>, result: ProcessingResult): void {
    this.stats.totalProcessed++;
    
    if (task.priority === TaskPriority.URGENT) {
      this.stats.urgent++;
    } else {
      this.stats.normal++;
    }
    
    // 平均処理時間の更新（移動平均）
    if (result.duration) {
      const alpha = 0.1; // 平滑化係数
      this.stats.averageProcessingTime = 
        (1 - alpha) * this.stats.averageProcessingTime + alpha * result.duration;
    }
  }

  /**
   * 統計情報をリセット
   */
  resetStats(): void {
    this.stats = {
      totalProcessed: 0,
      urgent: 0,
      normal: 0,
      errors: 0,
      averageProcessingTime: 0
    };
    logger.debug('Stats reset');
  }

  /**
   * リソースのクリーンアップ
   */
  cleanup(): void {
    this.queue.clear();
    this.removeAllListeners();
    logger.debug('InputQueueManager cleaned up');
  }
}
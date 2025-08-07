/**
 * プログレス表示を管理するクラス
 * TaskのStarted、進捗Update、Completedを視覚的に表示します
 */
export class ProgressReporter {
  private currentTask: string = '';
  private startTime: number = 0;
  private subtasks: string[] = [];
  private currentSubtaskIndex: number = 0;
  
  /**
   * TaskをStartedする
   * @param name Task名
   * @param subtasks サブTaskの配列（Options）
   */
  startTask(name: string, subtasks?: string[]): void {
    this.currentTask = name;
    this.startTime = Date.now();
    this.subtasks = subtasks || [];
    this.currentSubtaskIndex = 0;
    
    console.log(`\n🔄 ${name}...`);
    if (subtasks && subtasks.length > 1) {
      console.log(`  📝 ${subtasks.length} subtasks`);
    }
  }
  
  /**
   * サブTaskの進捗をUpdateする
   * @param index 現在Execute中のサブTaskのIndex
   */
  updateSubtask(index: number): void {
    if (this.subtasks.length > 0 && index < this.subtasks.length) {
      this.currentSubtaskIndex = index;
      console.log(`  [${index + 1}/${this.subtasks.length}] ${this.subtasks[index]}`);
    }
  }
  
  /**
   * TaskをCompletedする
   * @param success Successしたかどうか（デフォルト: true）
   */
  completeTask(success: boolean = true): void {
    const duration = Date.now() - this.startTime;
    const emoji = success ? '✅' : '❌';
    console.log(`${emoji} ${this.currentTask} (${this.formatDuration(duration)})`);
  }
  
  /**
   * ErrorMessageを表示する
   * @param error ErrorMessage
   */
  showError(error: string): void {
    console.log(`❌ Error: ${error}`);
  }
  
  /**
   * WarningMessageを表示する
   * @param warning WarningMessage
   */
  showWarning(warning: string): void {
    console.log(`⚠️ Warning: ${warning}`);
  }
  
  /**
   * InfoMessageを表示する
   * @param info InfoMessage
   */
  showInfo(info: string): void {
    console.log(`ℹ️ ${info}`);
  }
  
  /**
   * 時間を人間が読みやすい形式にFormatする
   * @param ms ミリseconds
   * @returns Formatされた時間characters列
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
  
  /**
   * 現在Execute中のTask名をGetする
   * @returns 現在のTask名
   */
  getCurrentTask(): string {
    return this.currentTask;
  }
  
  /**
   * 現在のExecute時間をGetする
   * @returns Execute時間（ミリseconds）
   */
  getCurrentDuration(): number {
    return Date.now() - this.startTime;
  }
  
  /**
   * サブTaskの進捗率をGetする
   * @returns 進捗率（0-1）
   */
  getProgress(): number {
    if (this.subtasks.length === 0) return 0;
    return this.currentSubtaskIndex / this.subtasks.length;
  }
}

/**
 * グローバルなProgressReporterインスタンス
 * アプリケーション全体で共有されます
 */
export const globalProgressReporter = new ProgressReporter();
/**
 * プログレス表示を管理するクラス
 * タスクの開始、進捗更新、完了を視覚的に表示します
 */
export class ProgressReporter {
  private currentTask: string = '';
  private startTime: number = 0;
  private subtasks: string[] = [];
  private currentSubtaskIndex: number = 0;
  
  /**
   * タスクを開始する
   * @param name タスク名
   * @param subtasks サブタスクの配列（オプション）
   */
  startTask(name: string, subtasks?: string[]): void {
    this.currentTask = name;
    this.startTime = Date.now();
    this.subtasks = subtasks || [];
    this.currentSubtaskIndex = 0;
    
    console.log(`\n🔄 ${name}...`);
    if (subtasks && subtasks.length > 1) {
      console.log(`  📝 ${subtasks.length}個のサブタスクがあります`);
    }
  }
  
  /**
   * サブタスクの進捗を更新する
   * @param index 現在実行中のサブタスクのインデックス
   */
  updateSubtask(index: number): void {
    if (this.subtasks.length > 0 && index < this.subtasks.length) {
      this.currentSubtaskIndex = index;
      console.log(`  [${index + 1}/${this.subtasks.length}] ${this.subtasks[index]}`);
    }
  }
  
  /**
   * タスクを完了する
   * @param success 成功したかどうか（デフォルト: true）
   */
  completeTask(success: boolean = true): void {
    const duration = Date.now() - this.startTime;
    const emoji = success ? '✅' : '❌';
    console.log(`${emoji} ${this.currentTask} (${this.formatDuration(duration)})`);
  }
  
  /**
   * エラーメッセージを表示する
   * @param error エラーメッセージ
   */
  showError(error: string): void {
    console.log(`❌ エラー: ${error}`);
  }
  
  /**
   * 警告メッセージを表示する
   * @param warning 警告メッセージ
   */
  showWarning(warning: string): void {
    console.log(`⚠️ 警告: ${warning}`);
  }
  
  /**
   * 情報メッセージを表示する
   * @param info 情報メッセージ
   */
  showInfo(info: string): void {
    console.log(`ℹ️ ${info}`);
  }
  
  /**
   * 時間を人間が読みやすい形式にフォーマットする
   * @param ms ミリ秒
   * @returns フォーマットされた時間文字列
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }
  
  /**
   * 現在実行中のタスク名を取得する
   * @returns 現在のタスク名
   */
  getCurrentTask(): string {
    return this.currentTask;
  }
  
  /**
   * 現在の実行時間を取得する
   * @returns 実行時間（ミリ秒）
   */
  getCurrentDuration(): number {
    return Date.now() - this.startTime;
  }
  
  /**
   * サブタスクの進捗率を取得する
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
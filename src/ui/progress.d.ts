/**
 * プログレス表示を管理するクラス
 * TaskのStarted、進捗Update、Completedを視覚的に表示します
 */
export declare class ProgressReporter {
    private currentTask;
    private startTime;
    private subtasks;
    private currentSubtaskIndex;
    /**
     * TaskをStartedする
     * @param name Task名
     * @param subtasks サブTaskの配列（Options）
     */
    startTask(name: string, subtasks?: string[]): void;
    /**
     * サブTaskの進捗をUpdateする
     * @param index 現在Execute中のサブTaskのIndex
     */
    updateSubtask(index: number): void;
    /**
     * TaskをCompletedする
     * @param success Successしたかどうか（デフォルト: true）
     */
    completeTask(success?: boolean): void;
    /**
     * ErrorMessageを表示する
     * @param error ErrorMessage
     */
    showError(error: string): void;
    /**
     * WarningMessageを表示する
     * @param warning WarningMessage
     */
    showWarning(warning: string): void;
    /**
     * InfoMessageを表示する
     * @param info InfoMessage
     */
    showInfo(info: string): void;
    /**
     * 時間を人間が読みやすい形式にFormatする
     * @param ms ミリseconds
     * @returns Formatされた時間characters列
     */
    private formatDuration;
    /**
     * 現在Execute中のTask名をGetする
     * @returns 現在のTask名
     */
    getCurrentTask(): string;
    /**
     * 現在のExecute時間をGetする
     * @returns Execute時間（ミリseconds）
     */
    getCurrentDuration(): number;
    /**
     * サブTaskの進捗率をGetする
     * @returns 進捗率（0-1）
     */
    getProgress(): number;
}
/**
 * グローバルなProgressReporterインスタンス
 * アプリケーション全体で共有されます
 */
export declare const globalProgressReporter: ProgressReporter;

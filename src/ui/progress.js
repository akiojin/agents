/**
 * プログレス表示を管理するクラス
 * TaskのStarted、進捗Update、Completedを視覚的に表示します
 */
export class ProgressReporter {
    currentTask = '';
    startTime = 0;
    subtasks = [];
    currentSubtaskIndex = 0;
    /**
     * TaskをStartedする
     * @param name Task名
     * @param subtasks サブTaskの配列（Options）
     */
    startTask(name, subtasks) {
        this.currentTask = name;
        this.startTime = Date.now();
        this.subtasks = subtasks || [];
        this.currentSubtaskIndex = 0;
    }
    /**
     * サブTaskの進捗をUpdateする
     * @param index 現在Execute中のサブTaskのIndex
     */
    updateSubtask(index) {
        if (this.subtasks.length > 0 && index < this.subtasks.length) {
            this.currentSubtaskIndex = index;
        }
    }
    /**
     * TaskをCompletedする
     * @param success Successしたかどうか（デフォルト: true）
     */
    completeTask(success = true) {
        const duration = Date.now() - this.startTime;
    }
    /**
     * ErrorMessageを表示する
     * @param error ErrorMessage
     */
    showError(error) {
        // Avoid emoji in console output to prevent encoding issues
        console.log(`[ERROR] ${error}`);
    }
    /**
     * WarningMessageを表示する
     * @param warning WarningMessage
     */
    showWarning(warning) {
        // Avoid emoji in console output to prevent encoding issues
        console.log(`[WARNING] ${warning}`);
    }
    /**
     * InfoMessageを表示する
     * @param info InfoMessage
     */
    showInfo(info) {
        // MCPツール実行のみコンソールに表示
        if (info.includes('Executing') && info.includes('tool')) {
            // ツール実行開始メッセージを簡潔に表示
            const toolMatch = info.match(/Executing (\w+) tool/);
            if (toolMatch) {
                process.stdout.write('\r\x1b[K'); // 現在の行をクリア
                console.log(`\n⚡ ${toolMatch[1]} tool executing...`);
            }
        }
        else if (info.includes('Tool completed')) {
            // ツール完了は表示しない（Thinkingインジケーターに戻る）
        }
        else {
            // その他のメッセージはdebugログへ
            const logger = require('../utils/logger.js').logger;
            logger.debug(info);
        }
    }
    /**
     * 時間を人間が読みやすい形式にFormatする
     * @param ms ミリseconds
     * @returns Formatされた時間characters列
     */
    formatDuration(ms) {
        if (ms < 1000)
            return `${ms}ms`;
        if (ms < 60000)
            return `${(ms / 1000).toFixed(1)}s`;
        return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
    }
    /**
     * 現在Execute中のTask名をGetする
     * @returns 現在のTask名
     */
    getCurrentTask() {
        return this.currentTask;
    }
    /**
     * 現在のExecute時間をGetする
     * @returns Execute時間（ミリseconds）
     */
    getCurrentDuration() {
        return Date.now() - this.startTime;
    }
    /**
     * サブTaskの進捗率をGetする
     * @returns 進捗率（0-1）
     */
    getProgress() {
        if (this.subtasks.length === 0)
            return 0;
        return this.currentSubtaskIndex / this.subtasks.length;
    }
}
/**
 * グローバルなProgressReporterインスタンス
 * アプリケーション全体で共有されます
 */
export const globalProgressReporter = new ProgressReporter();
//# sourceMappingURL=progress.js.map
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
/**
 * コンソールメッセージをファイルに記録するクラス
 */
export class ConsoleLogger {
    logFilePath;
    writeStream = null;
    sessionStartTime;
    maxFileSize = 10 * 1024 * 1024; // 10MB
    rotationCounter = 0;
    constructor() {
        this.sessionStartTime = new Date().toISOString().replace(/[:.]/g, '-');
        this.logFilePath = this.generateLogFilePath();
        this.initializeLogFile();
    }
    /**
     * ログファイルのパスを生成
     */
    generateLogFilePath(rotation = 0) {
        const timestamp = this.sessionStartTime;
        const suffix = rotation > 0 ? `-${rotation}` : '';
        const fileName = `agents-console-log-${timestamp}${suffix}.jsonl`;
        // ログディレクトリを作成（.agents/logs）
        const logDir = path.join(process.cwd(), '.agents', 'logs');
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        return path.join(logDir, fileName);
    }
    /**
     * ログファイルを初期化
     */
    initializeLogFile() {
        try {
            // 既存のストリームがある場合は閉じる
            if (this.writeStream) {
                this.writeStream.end();
            }
            // 新しいストリームを作成（追記モード）
            this.writeStream = fs.createWriteStream(this.logFilePath, {
                flags: 'a',
                encoding: 'utf8',
            });
            // セッション開始を記録
            const sessionStart = {
                type: 'session',
                action: 'start',
                timestamp: new Date().toISOString(),
                pid: process.pid,
                platform: process.platform,
                nodeVersion: process.version,
                cwd: process.cwd(),
            };
            this.writeStream.write(JSON.stringify(sessionStart) + '\n');
        }
        catch (error) {
            console.error('Failed to initialize console log file:', error);
        }
    }
    /**
     * ファイルサイズをチェックし、必要に応じてローテーション
     */
    checkAndRotate() {
        try {
            const stats = fs.statSync(this.logFilePath);
            if (stats.size > this.maxFileSize) {
                this.rotationCounter++;
                this.logFilePath = this.generateLogFilePath(this.rotationCounter);
                this.initializeLogFile();
            }
        }
        catch (error) {
            // ファイルが存在しない場合は無視
        }
    }
    /**
     * コンソールメッセージをファイルに記録
     */
    logMessage(message) {
        if (!this.writeStream || this.writeStream.destroyed) {
            this.initializeLogFile();
        }
        try {
            // ファイルサイズチェック
            this.checkAndRotate();
            // メッセージを記録
            const logEntry = {
                timestamp: new Date().toISOString(),
                type: message.type,
                content: message.content,
                count: message.count || 1,
                // スタックトレースがある場合は含める
                ...(message.stack && { stack: message.stack }),
            };
            this.writeStream?.write(JSON.stringify(logEntry) + '\n');
        }
        catch (error) {
            // ログ記録の失敗は静かに無視（無限ループを防ぐため）
        }
    }
    /**
     * バッチでメッセージを記録
     */
    logMessages(messages) {
        messages.forEach(message => this.logMessage(message));
    }
    /**
     * 重要なエラーを別ファイルに保存
     */
    logError(error, context) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const errorFileName = `agents-error-${timestamp}.json`;
            const errorFilePath = path.join(os.tmpdir(), errorFileName);
            const errorData = {
                timestamp: new Date().toISOString(),
                context: context || 'unknown',
                error: error instanceof Error ? {
                    message: error.message,
                    stack: error.stack,
                    name: error.name,
                } : String(error),
                sessionLogFile: this.logFilePath,
            };
            fs.writeFileSync(errorFilePath, JSON.stringify(errorData, null, 2));
        }
        catch (writeError) {
            console.error('Failed to write error log:', writeError);
        }
    }
    /**
     * クリーンアップ
     */
    close() {
        if (this.writeStream) {
            // セッション終了を記録
            const sessionEnd = {
                type: 'session',
                action: 'end',
                timestamp: new Date().toISOString(),
            };
            this.writeStream.write(JSON.stringify(sessionEnd) + '\n');
            this.writeStream.end();
            this.writeStream = null;
        }
    }
    /**
     * 現在のログファイルパスを取得
     */
    getLogFilePath() {
        return this.logFilePath;
    }
    /**
     * 古いログファイルを削除（24時間以上前のもの）
     */
    static cleanupOldLogs() {
        try {
            const tmpDir = path.join(process.cwd(), '.agents', 'logs');
            if (!fs.existsSync(tmpDir)) {
                return; // ログディレクトリがなければ何もしない
            }
            const files = fs.readdirSync(tmpDir);
            const now = Date.now();
            const maxAge = 24 * 60 * 60 * 1000; // 24時間
            files.forEach(file => {
                if (file.startsWith('agents-console-log-') || file.startsWith('agents-error-')) {
                    const filePath = path.join(tmpDir, file);
                    try {
                        const stats = fs.statSync(filePath);
                        if (now - stats.mtimeMs > maxAge) {
                            fs.unlinkSync(filePath);
                        }
                    }
                    catch (error) {
                        // ファイル削除エラーは無視
                    }
                }
            });
        }
        catch (error) {
            // クリーンアップエラーは無視
        }
    }
}
//# sourceMappingURL=consoleLogger.js.map
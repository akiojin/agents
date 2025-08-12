/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { ConsoleMessageItem } from '../types.js';
/**
 * コンソールメッセージをファイルに記録するクラス
 */
export declare class ConsoleLogger {
    private logFilePath;
    private writeStream;
    private sessionStartTime;
    private maxFileSize;
    private rotationCounter;
    constructor();
    /**
     * ログファイルのパスを生成
     */
    private generateLogFilePath;
    /**
     * ログファイルを初期化
     */
    private initializeLogFile;
    /**
     * ファイルサイズをチェックし、必要に応じてローテーション
     */
    private checkAndRotate;
    /**
     * コンソールメッセージをファイルに記録
     */
    logMessage(message: ConsoleMessageItem): void;
    /**
     * バッチでメッセージを記録
     */
    logMessages(messages: ConsoleMessageItem[]): void;
    /**
     * 重要なエラーを別ファイルに保存
     */
    logError(error: unknown, context?: string): void;
    /**
     * クリーンアップ
     */
    close(): void;
    /**
     * 現在のログファイルパスを取得
     */
    getLogFilePath(): string;
    /**
     * 古いログファイルを削除（24時間以上前のもの）
     */
    static cleanupOldLogs(): void;
}

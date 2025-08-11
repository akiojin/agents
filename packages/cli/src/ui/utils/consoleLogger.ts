/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ConsoleMessageItem } from '../types.js';

/**
 * コンソールメッセージをファイルに記録するクラス
 */
export class ConsoleLogger {
  private logFilePath: string;
  private writeStream: fs.WriteStream | null = null;
  private sessionStartTime: string;
  private maxFileSize = 10 * 1024 * 1024; // 10MB
  private rotationCounter = 0;

  constructor() {
    this.sessionStartTime = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFilePath = this.generateLogFilePath();
    this.initializeLogFile();
  }

  /**
   * ログファイルのパスを生成
   */
  private generateLogFilePath(rotation = 0): string {
    const timestamp = this.sessionStartTime;
    const suffix = rotation > 0 ? `-${rotation}` : '';
    const fileName = `agents-console-log-${timestamp}${suffix}.jsonl`;
    return path.join(os.tmpdir(), fileName);
  }

  /**
   * ログファイルを初期化
   */
  private initializeLogFile(): void {
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
    } catch (error) {
      console.error('Failed to initialize console log file:', error);
    }
  }

  /**
   * ファイルサイズをチェックし、必要に応じてローテーション
   */
  private checkAndRotate(): void {
    try {
      const stats = fs.statSync(this.logFilePath);
      if (stats.size > this.maxFileSize) {
        this.rotationCounter++;
        this.logFilePath = this.generateLogFilePath(this.rotationCounter);
        this.initializeLogFile();
      }
    } catch (error) {
      // ファイルが存在しない場合は無視
    }
  }

  /**
   * コンソールメッセージをファイルに記録
   */
  public logMessage(message: ConsoleMessageItem): void {
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
    } catch (error) {
      // ログ記録の失敗は静かに無視（無限ループを防ぐため）
    }
  }

  /**
   * バッチでメッセージを記録
   */
  public logMessages(messages: ConsoleMessageItem[]): void {
    messages.forEach(message => this.logMessage(message));
  }

  /**
   * 重要なエラーを別ファイルに保存
   */
  public logError(error: unknown, context?: string): void {
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
    } catch (writeError) {
      console.error('Failed to write error log:', writeError);
    }
  }

  /**
   * クリーンアップ
   */
  public close(): void {
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
  public getLogFilePath(): string {
    return this.logFilePath;
  }

  /**
   * 古いログファイルを削除（24時間以上前のもの）
   */
  public static cleanupOldLogs(): void {
    try {
      const tmpDir = os.tmpdir();
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
          } catch (error) {
            // ファイル削除エラーは無視
          }
        }
      });
    } catch (error) {
      // クリーンアップエラーは無視
    }
  }
}
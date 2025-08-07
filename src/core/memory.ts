import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { ChatMessage, SessionConfig } from '../config/types.js';
import { logger } from '../utils/logger.js';

export class MemoryManager {
  private historyPath: string;
  
  // WeakMapを使用してメモリリークを防ぐ
  private sessionCache = new WeakMap<object, SessionConfig>();
  private historyCache = new WeakMap<object, ChatMessage[]>();
  
  // ファイルMonitorとCleanup用
  private fileWatchers = new Set<any>();
  private timers = new Set<NodeJS.Timeout>();

  constructor(historyPath: string) {
    this.historyPath = historyPath;
    void this.ensureDirectoryExists();
    
    // プロセスExit時のCleanup
    this.setupCleanupHandlers();
  }

  /**
   * CleanupハンドラーのConfig
   */
  private setupCleanupHandlers(): void {
    const cleanup = () => {
      this.cleanup();
    };

    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }

  /**
   * リソースCleanup
   */
  public cleanup(): void {
    try {
      // タイマーのcleared - forEach + asyncの問題を修正：for...ofループを使用
      for (const timer of this.timers) {
        clearTimeout(timer);
      }
      this.timers.clear();

      // ファイルMonitorの停止 - forEach + asyncの問題を修正：for...ofループを使用
      for (const watcher of this.fileWatchers) {
        if (watcher && typeof watcher.close === 'function') {
          watcher.close();
        }
      }
      this.fileWatchers.clear();

      logger.debug('MemoryManager のリソースCleanupがCompleteddone');
    } catch (error) {
      logger.error('MemoryManager CleanupError:', error);
    }
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.historyPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * HistorySave（メモリOptimize機能付き）
   */
  async saveHistory(history: ChatMessage[]): Promise<void> {
    try {
      // Save前にメモリ使用量をチェック
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed > 1024 * 1024 * 1024) { // 1GB以上の場合
        logger.warn('メモリ使用量が高いため、Historyの一部をトリムします');
        history = this.trimHistoryForMemory(history);
      }

      const json = JSON.stringify(history, null, 2);
      await writeFile(this.historyPath, json, 'utf-8');
      logger.debug('HistoryをSavedone');
      
      // Save後にメモリ解放を促進
      if (global.gc) {
        global.gc();
      }
    } catch (error) {
      logger.error('HistoryのSaveにFaileddone:', error);
      throw error;
    }
  }

  /**
   * メモリ使用量に応じてHistoryをトリム
   */
  private trimHistoryForMemory(history: ChatMessage[]): ChatMessage[] {
    const maxSize = 50; // メモリ不足時は50itemsに制限
    if (history.length > maxSize) {
      logger.info(`メモリ不足のためHistoryを${history.length}itemsから${maxSize}itemsにトリムします`);
      return history.slice(-maxSize);
    }
    return history;
  }

  async loadHistory(): Promise<ChatMessage[]> {
    try {
      if (!existsSync(this.historyPath)) {
        return [];
      }

      const json = await readFile(this.historyPath, 'utf-8');
      const history = JSON.parse(json) as ChatMessage[];

      // 日付characters列をDateオブジェクトにConvert
      const processedHistory = history.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));

      // ロード後にデータ整合性チェック
      return this.validateAndCleanHistory(processedHistory);
    } catch (error) {
      logger.error('HistoryのLoadにFaileddone:', error);
      return [];
    }
  }

  /**
   * Historyデータの整合性チェックとCleanup
   */
  private validateAndCleanHistory(history: ChatMessage[]): ChatMessage[] {
    return history.filter(msg => {
      // 必須フィールドのチェック
      if (!msg.role || !msg.content || !msg.timestamp) {
        logger.warn('無効なMessageを除去done:', msg);
        return false;
      }

      // 日付の妥当性チェック
      if (!(msg.timestamp instanceof Date) || isNaN(msg.timestamp.getTime())) {
        logger.warn('無効な日付のMessageを除去done:', msg);
        return false;
      }

      // コンテンツの長さチェック（異常に長いMessageを除去）
      if (typeof msg.content === 'string' && msg.content.length > 100000) { // 100KB以上
        logger.warn('異常に長いMessageを除去done');
        return false;
      }

      return true;
    });
  }

  async saveSession(session: SessionConfig, filename: string): Promise<void> {
    try {
      const sessionPath = join(dirname(this.historyPath), filename);
      
      // セッションデータのOptimize
      const optimizedSession = this.optimizeSessionData(session);
      
      const json = JSON.stringify(optimizedSession, null, 2);
      await writeFile(sessionPath, json, 'utf-8');
      logger.info(`セッションをSavedone: ${filename}`);
    } catch (error) {
      logger.error('セッションのSaveにFaileddone:', error);
      throw error;
    }
  }

  /**
   * セッションデータのOptimize
   */
  private optimizeSessionData(session: SessionConfig): SessionConfig {
    return {
      ...session,
      history: session.history.slice(-100), // 最新100itemsのみ保持
    };
  }

  async loadSession(filename: string): Promise<SessionConfig> {
    try {
      const sessionPath = join(dirname(this.historyPath), filename);
      const json = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(json) as SessionConfig;

      // 日付characters列をDateオブジェクトにConvert
      session.startedAt = new Date(session.startedAt);
      session.history = session.history.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));

      // ロード後の整合性チェック
      session.history = this.validateAndCleanHistory(session.history);

      return session;
    } catch (error) {
      logger.error('セッションのLoadにFaileddone:', error);
      throw error;
    }
  }

  async clearHistory(): Promise<void> {
    try {
      if (existsSync(this.historyPath)) {
        await writeFile(this.historyPath, '[]', 'utf-8');
        logger.info('Historyをcleareddone');
        
        // cleared後にガベージコレクションを促進
        if (global.gc) {
          global.gc();
        }
      }
    } catch (error) {
      logger.error('HistoryのclearedにFaileddone:', error);
      throw error;
    }
  }

  async getHistorySize(): Promise<number> {
    try {
      if (!existsSync(this.historyPath)) {
        return 0;
      }

      const history = await this.loadHistory();
      return history.length;
    } catch (error) {
      logger.error('HistoryサイズのGetにFaileddone:', error);
      return 0;
    }
  }

  /**
   * HistoryのDelete（メモリOptimize機能付き）
   */
  async pruneHistory(maxSize: number): Promise<void> {
    try {
      const history = await this.loadHistory();

      if (history.length > maxSize) {
        const pruned = history.slice(-maxSize);
        await this.saveHistory(pruned);
        
        const removedCount = history.length - maxSize;
        logger.info(`HistoryをDeletedone: ${removedCount}items（${history.length}items → ${maxSize}items）`);
        
        // Delete後にメモリ解放を促進
        if (global.gc) {
          global.gc();
        }
      }
    } catch (error) {
      logger.error('HistoryのDeleteにFaileddone:', error);
      throw error;
    }
  }

  /**
   * メモリ使用量のGet
   */
  getMemoryUsage(): { historySize: number; memoryUsageMB: number } {
    const memUsage = process.memoryUsage();
    return {
      historySize: 0, // この値は外部からConfigされる予定
      memoryUsageMB: Math.round(memUsage.heapUsed / 1024 / 1024),
    };
  }

  /**
   * 古いHistoryの自動Cleanup
   */
  async cleanupOldHistory(daysToKeep: number = 30): Promise<void> {
    try {
      const history = await this.loadHistory();
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const filteredHistory = history.filter(msg => 
        msg.timestamp && msg.timestamp > cutoffDate
      );

      if (filteredHistory.length < history.length) {
        await this.saveHistory(filteredHistory);
        const removedCount = history.length - filteredHistory.length;
        logger.info(`${daysToKeep}日より古いHistoryをDeletedone: ${removedCount}items`);
      }
    } catch (error) {
      logger.error('古いHistoryのCleanupにFaileddone:', error);
    }
  }

  /**
   * メモリ効率的なHistory検索
   */
  async searchHistory(query: string, limit: number = 10): Promise<ChatMessage[]> {
    try {
      const history = await this.loadHistory();
      const results: ChatMessage[] = [];
      
      // 逆順で検索（最新のものから）
      for (let i = history.length - 1; i >= 0 && results.length < limit; i--) {
        const msg = history[i];
        if (msg.content && typeof msg.content === 'string' && 
            msg.content.toLowerCase().includes(query.toLowerCase())) {
          results.push(msg);
        }
      }
      
      return results.reverse(); // 時系列順に戻す
    } catch (error) {
      logger.error('History検索にFaileddone:', error);
      return [];
    }
  }

  /**
   * バックアップの作成
   */
  async createBackup(): Promise<string> {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = `${this.historyPath}.backup.${timestamp}`;
      
      if (existsSync(this.historyPath)) {
        const content = await readFile(this.historyPath, 'utf-8');
        await writeFile(backupPath, content, 'utf-8');
        logger.info(`バックアップを作成done: ${backupPath}`);
        return backupPath;
      }
      
      throw new Error('Historyファイルが存在しnot');
    } catch (error) {
      logger.error('バックアップの作成にFaileddone:', error);
      throw error;
    }
  }

  /**
   * 定期的なメンテナンスのExecute
   */
  async performMaintenance(): Promise<void> {
    try {
      logger.info('定期メンテナンスをStartedします');
      
      // 古いHistoryのCleanup
      await this.cleanupOldHistory();
      
      // HistoryサイズのOptimize
      await this.pruneHistory(1000); // 最大1000itemsに制限
      
      // バックアップの作成（週次）
      const lastBackup = this.getLastBackupTime();
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      if (!lastBackup || lastBackup < weekAgo) {
        await this.createBackup();
      }
      
      logger.info('定期メンテナンスがCompleteddone');
    } catch (error) {
      logger.error('定期メンテナンスにFaileddone:', error);
    }
  }

  /**
   * 最後のバックアップ時刻をGet
   */
  private getLastBackupTime(): Date | null {
    try {
      const dir = dirname(this.historyPath);
      const files = require('fs').readdirSync(dir);
      const backupFiles = files.filter((file: string) => file.includes('.backup.'));
      
      if (backupFiles.length === 0) {
        return null;
      }
      
      // 最新のバックアップファイルの時刻をGet
      const latestBackup = backupFiles.sort().pop();
      const match = latestBackup?.match(/\.backup\.(.+)$/);
      
      if (match) {
        return new Date(match[1].replace(/-/g, ':'));
      }
      
      return null;
    } catch (error) {
      logger.error('バックアップ時刻のGetにFaileddone:', error);
      return null;
    }
  }
}

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import type { ChatMessage, SessionConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';

export class MemoryManager {
  private historyPath: string;

  constructor(historyPath: string) {
    this.historyPath = historyPath;
    this.ensureDirectoryExists();
  }

  private async ensureDirectoryExists(): Promise<void> {
    const dir = dirname(this.historyPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  async saveHistory(history: ChatMessage[]): Promise<void> {
    try {
      const json = JSON.stringify(history, null, 2);
      await writeFile(this.historyPath, json, 'utf-8');
      logger.debug('履歴を保存しました');
    } catch (error) {
      logger.error('履歴の保存に失敗しました:', error);
      throw error;
    }
  }

  async loadHistory(): Promise<ChatMessage[]> {
    try {
      if (!existsSync(this.historyPath)) {
        return [];
      }

      const json = await readFile(this.historyPath, 'utf-8');
      const history = JSON.parse(json) as ChatMessage[];
      
      // 日付文字列をDateオブジェクトに変換
      return history.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
    } catch (error) {
      logger.error('履歴の読み込みに失敗しました:', error);
      return [];
    }
  }

  async saveSession(session: SessionConfig, filename: string): Promise<void> {
    try {
      const sessionPath = join(dirname(this.historyPath), filename);
      const json = JSON.stringify(session, null, 2);
      await writeFile(sessionPath, json, 'utf-8');
      logger.info(`セッションを保存しました: ${filename}`);
    } catch (error) {
      logger.error('セッションの保存に失敗しました:', error);
      throw error;
    }
  }

  async loadSession(filename: string): Promise<SessionConfig> {
    try {
      const sessionPath = join(dirname(this.historyPath), filename);
      const json = await readFile(sessionPath, 'utf-8');
      const session = JSON.parse(json) as SessionConfig;
      
      // 日付文字列をDateオブジェクトに変換
      session.startedAt = new Date(session.startedAt);
      session.history = session.history.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }));
      
      return session;
    } catch (error) {
      logger.error('セッションの読み込みに失敗しました:', error);
      throw error;
    }
  }

  async clearHistory(): Promise<void> {
    try {
      if (existsSync(this.historyPath)) {
        await writeFile(this.historyPath, '[]', 'utf-8');
        logger.info('履歴をクリアしました');
      }
    } catch (error) {
      logger.error('履歴のクリアに失敗しました:', error);
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
      logger.error('履歴サイズの取得に失敗しました:', error);
      return 0;
    }
  }

  async pruneHistory(maxSize: number): Promise<void> {
    try {
      const history = await this.loadHistory();
      
      if (history.length > maxSize) {
        const pruned = history.slice(-maxSize);
        await this.saveHistory(pruned);
        logger.info(`履歴を削除しました: ${history.length - maxSize}件`);
      }
    } catch (error) {
      logger.error('履歴の削除に失敗しました:', error);
      throw error;
    }
  }
}
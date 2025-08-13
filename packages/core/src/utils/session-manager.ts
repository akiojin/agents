/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Content } from '@google/genai';

/**
 * セッションデータの型定義
 */
export interface SessionData {
  id: string;
  startTime: Date;
  endTime?: Date;
  tokenCount: number;
  messageCount: number;
  compressed: boolean;
  parentSessionId?: string;  // 圧縮前のセッション
  summary?: string;          // 圧縮時の要約
}

/**
 * セッション履歴の型定義
 */
export interface SessionHistory {
  sessionId: string;
  history: Content[];
  metadata: SessionData;
}

/**
 * セッション管理クラス
 */
export class SessionManager {
  private currentSession: SessionData;
  private sessionsDir: string;
  private history: Content[] = [];

  constructor(baseDir: string = path.join(process.cwd(), '.agents', 'sessions')) {
    this.sessionsDir = baseDir;
    this.currentSession = this.createNewSession();
    // 初期セッションを即座に保存
    this.saveSession().catch(error => {
      console.error('Failed to save initial session:', error);
    });
  }

  /**
   * 新しいセッションを作成
   */
  private createNewSession(parentSessionId?: string): SessionData {
    return {
      id: `session-${Date.now()}-${randomUUID().slice(0, 8)}`,
      startTime: new Date(),
      tokenCount: 0,
      messageCount: 0,
      compressed: false,
      parentSessionId,
    };
  }

  /**
   * 現在のセッションIDを取得
   */
  getCurrentSessionId(): string {
    return this.currentSession.id;
  }

  /**
   * 現在のセッション情報を取得
   */
  getCurrentSession(): SessionData {
    return { ...this.currentSession };
  }

  /**
   * セッション履歴を更新
   */
  updateHistory(newHistory: Content[]): void {
    this.history = newHistory;
    this.currentSession.messageCount = newHistory.length;
  }

  /**
   * トークン数を更新
   */
  updateTokenCount(tokenCount: number): void {
    this.currentSession.tokenCount = tokenCount;
  }

  /**
   * セッションを保存
   */
  async saveSession(): Promise<void> {
    const sessionDir = path.join(this.sessionsDir, this.formatSessionDirName(this.currentSession.id));
    
    // ディレクトリを作成
    await fs.mkdir(sessionDir, { recursive: true });
    
    // メタデータを保存
    await fs.writeFile(
      path.join(sessionDir, 'metadata.json'),
      JSON.stringify(this.currentSession, null, 2)
    );
    
    // 履歴を保存
    await fs.writeFile(
      path.join(sessionDir, 'history.json'),
      JSON.stringify(this.history, null, 2)
    );
    
    // 圧縮要約があれば保存
    if (this.currentSession.summary) {
      await fs.writeFile(
        path.join(sessionDir, 'compressed-summary.md'),
        this.currentSession.summary
      );
    }
    
    // 親セッション参照があれば保存
    if (this.currentSession.parentSessionId) {
      await fs.writeFile(
        path.join(sessionDir, 'parent-ref.json'),
        JSON.stringify({ parentSessionId: this.currentSession.parentSessionId }, null, 2)
      );
    }
  }

  /**
   * セッションを圧縮して新しいセッションを開始
   */
  async compressAndStartNewSession(
    compressedHistory: Content[],
    summary: string,
    originalTokenCount: number,
    newTokenCount: number
  ): Promise<SessionData> {
    // 現在のセッションを終了
    this.currentSession.endTime = new Date();
    this.currentSession.compressed = true;
    this.currentSession.summary = summary;
    
    // 現在のセッションを保存
    await this.saveSession();
    
    // 新しいセッションを開始
    const parentSessionId = this.currentSession.id;
    this.currentSession = this.createNewSession(parentSessionId);
    this.history = compressedHistory;
    this.currentSession.tokenCount = newTokenCount;
    this.currentSession.messageCount = compressedHistory.length;
    
    // 新しいセッションも保存
    await this.saveSession();
    
    return this.currentSession;
  }

  /**
   * セッション一覧を取得
   */
  async listSessions(): Promise<SessionData[]> {
    try {
      const dirs = await fs.readdir(this.sessionsDir);
      const sessions: SessionData[] = [];
      
      for (const dir of dirs) {
        const metadataPath = path.join(this.sessionsDir, dir, 'metadata.json');
        try {
          const metadata = await fs.readFile(metadataPath, 'utf-8');
          sessions.push(JSON.parse(metadata));
        } catch (error) {
          // メタデータが読めない場合はスキップ
          console.warn(`Failed to read session metadata: ${metadataPath}`);
        }
      }
      
      // 開始時刻で降順ソート（新しいものが先）
      return sessions.sort((a, b) => 
        new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
      );
    } catch (error) {
      // ディレクトリが存在しない場合は空配列を返す
      return [];
    }
  }

  /**
   * 特定のセッションを読み込み
   */
  async loadSession(sessionId: string): Promise<SessionHistory | null> {
    const sessionDir = path.join(this.sessionsDir, this.formatSessionDirName(sessionId));
    
    try {
      const metadata = JSON.parse(
        await fs.readFile(path.join(sessionDir, 'metadata.json'), 'utf-8')
      );
      
      const history = JSON.parse(
        await fs.readFile(path.join(sessionDir, 'history.json'), 'utf-8')
      );
      
      return {
        sessionId,
        history,
        metadata,
      };
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  /**
   * セッションを復元
   */
  async restoreSession(sessionId: string): Promise<boolean> {
    const sessionData = await this.loadSession(sessionId);
    
    if (!sessionData) {
      return false;
    }
    
    this.currentSession = sessionData.metadata;
    this.history = sessionData.history;
    
    return true;
  }

  /**
   * セッションディレクトリ名をフォーマット
   */
  private formatSessionDirName(sessionId: string): string {
    const date = new Date().toISOString().split('T')[0];
    return `${date}_${sessionId}`;
  }
}

// シングルトンインスタンス
let sessionManagerInstance: SessionManager | null = null;

/**
 * SessionManagerのシングルトンインスタンスを取得
 */
export function getSessionManager(baseDir?: string): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager(baseDir);
  }
  return sessionManagerInstance;
}
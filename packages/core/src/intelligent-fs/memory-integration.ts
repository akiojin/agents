/**
 * IntelligentFileSystemと記憶システムの統合
 * コードパターンの学習と自動提案
 */

import { IntelligentFileSystem } from './intelligent-filesystem.js';
import sqlite3, { Database } from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs/promises';

// ロガー（簡易実装）
const logger = {
  debug: (message: string, data?: any) => console.debug(message, data),
  info: (message: string, data?: any) => console.info(message, data),
  warn: (message: string, data?: any) => console.warn(message, data),
  error: (message: string, data?: any) => console.error(message, data)
};

// MemoryAPI（簡易実装）
interface MemoryAPI {
  search(params: { query: string; type: string; limit: number }): Promise<any[]>;
  saveMemory(memory: any): Promise<void>;
}

function getMemoryAPI(): MemoryAPI {
  return {
    async search(params) {
      // 簡易実装：空の配列を返す
      return [];
    },
    async saveMemory(memory) {
      // 簡易実装：何もしない
      console.log('Memory saved:', memory);
    }
  };
}

/**
 * コードパターン情報
 */
export interface CodePattern {
  patternId: string;
  patternType: 'error_fix' | 'refactor' | 'optimization' | 'style';
  beforeCode: string;
  afterCode: string;
  context: {
    language: string;
    framework?: string;
    errorMessage?: string;
    description?: string;
  };
  successRate: number;
  usageCount: number;
  createdAt: Date;
  lastUsed: Date;
}

/**
 * 学習イベント
 */
export interface LearningEvent {
  eventId: string;
  eventType: 'edit' | 'error_fix' | 'refactor';
  filePath: string;
  beforeState: string;
  afterState: string;
  success: boolean;
  errorMessage?: string;
  timestamp: Date;
}

/**
 * メモリ統合マネージャー
 */
export class MemoryIntegrationManager {
  private memoryAPI: MemoryAPI;
  private db?: Database;
  private dbPath: string;
  private patterns: Map<string, CodePattern> = new Map();
  
  // 学習統計
  private stats = {
    patternsLearned: 0,
    suggestionsProvided: 0,
    suggestionsAccepted: 0,
    errorsFix: 0
  };

  constructor(
    private intelligentFS: IntelligentFileSystem,
    workspacePath: string
  ) {
    this.memoryAPI = getMemoryAPI();
    this.dbPath = path.join(workspacePath, '.agents', 'code-patterns.db');
  }

  /**
   * 初期化
   */
  async initialize(): Promise<void> {
    // データベースディレクトリを作成
    const dbDir = path.dirname(this.dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    // SQLiteデータベース初期化
    this.db = new sqlite3.Database(this.dbPath);
    await this.setupDatabase();
    
    // 既存パターンをロード
    await this.loadPatterns();
    
    logger.info('MemoryIntegrationManager initialized', {
      patternsLoaded: this.patterns.size
    });
  }

  /**
   * データベーススキーマ作成
   */
  private async setupDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.serialize(() => {
        // コードパターンテーブル
        this.db!.run(`
          CREATE TABLE IF NOT EXISTS code_patterns (
            pattern_id TEXT PRIMARY KEY,
            pattern_type TEXT NOT NULL,
            before_code TEXT NOT NULL,
            after_code TEXT NOT NULL,
            context TEXT,
            success_rate REAL DEFAULT 1.0,
            usage_count INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_used TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 編集履歴テーブル
        this.db!.run(`
          CREATE TABLE IF NOT EXISTS edit_history (
            edit_id TEXT PRIMARY KEY,
            symbol_id TEXT,
            file_uri TEXT NOT NULL,
            operation TEXT NOT NULL,
            before_state TEXT,
            after_state TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            success BOOLEAN DEFAULT true,
            error_message TEXT
          )
        `);

        // 学習イベントテーブル
        this.db!.run(`
          CREATE TABLE IF NOT EXISTS learning_events (
            event_id TEXT PRIMARY KEY,
            event_type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            before_state TEXT,
            after_state TEXT,
            success BOOLEAN,
            error_message TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) reject(err);
          else resolve();
        });

        // インデックス作成
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_patterns_type ON code_patterns(pattern_type)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_patterns_usage ON code_patterns(usage_count DESC)');
        this.db!.run('CREATE INDEX IF NOT EXISTS idx_history_timestamp ON edit_history(timestamp DESC)');
      });
    });
  }

  /**
   * 既存パターンをロード
   */
  private async loadPatterns(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.all(
        'SELECT * FROM code_patterns ORDER BY usage_count DESC LIMIT 1000',
        (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          
          rows.forEach(row => {
            const pattern: CodePattern = {
              patternId: row.pattern_id,
              patternType: row.pattern_type,
              beforeCode: row.before_code,
              afterCode: row.after_code,
              context: JSON.parse(row.context || '{}'),
              successRate: row.success_rate,
              usageCount: row.usage_count,
              createdAt: new Date(row.created_at),
              lastUsed: new Date(row.last_used)
            };
            this.patterns.set(pattern.patternId, pattern);
          });
          
          resolve();
        }
      );
    });
  }

  /**
   * 編集から学習
   */
  async learnFromEdit(
    filePath: string,
    beforeContent: string,
    afterContent: string,
    success: boolean,
    errorMessage?: string
  ): Promise<void> {
    // 学習イベントを記録
    const event: LearningEvent = {
      eventId: this.generateEventId(),
      eventType: errorMessage ? 'error_fix' : 'edit',
      filePath,
      beforeState: beforeContent,
      afterState: afterContent,
      success,
      errorMessage,
      timestamp: new Date()
    };
    
    await this.saveLearnedEvent(event);
    
    // 成功した編集からパターンを抽出
    if (success) {
      const patterns = this.extractPatterns(beforeContent, afterContent, errorMessage);
      
      for (const pattern of patterns) {
        await this.savePattern(pattern);
        
        // 記憶システムにも保存
        if (errorMessage) {
          await this.saveToMemory({
            type: 'error_solution',
            content: {
              title: `Error fix for ${path.basename(filePath)}`,
              description: `Fixed error: ${errorMessage}`,
              error: errorMessage,
              solution: pattern.afterCode,
              context: pattern.context
            },
            tags: ['error_fix', 'auto_learned', path.extname(filePath).slice(1)]
          });
          this.stats.errorsFix++;
        }
      }
      
      this.stats.patternsLearned += patterns.length;
    }
  }

  /**
   * パターンを抽出
   */
  private extractPatterns(
    beforeContent: string,
    afterContent: string,
    errorMessage?: string
  ): CodePattern[] {
    const patterns: CodePattern[] = [];
    
    // 差分を解析してパターンを抽出
    const diffs = this.computeDiff(beforeContent, afterContent);
    
    for (const diff of diffs) {
      if (diff.added && diff.removed) {
        // 置換パターン
        const pattern: CodePattern = {
          patternId: this.generatePatternId(),
          patternType: errorMessage ? 'error_fix' : 'refactor',
          beforeCode: diff.removed,
          afterCode: diff.added,
          context: {
            language: 'typescript', // TODO: 言語を動的に判定
            errorMessage
          },
          successRate: 1.0,
          usageCount: 0,
          createdAt: new Date(),
          lastUsed: new Date()
        };
        
        patterns.push(pattern);
      }
    }
    
    return patterns;
  }

  /**
   * 類似のエラーに対する提案を取得
   */
  async getSuggestions(
    errorMessage: string,
    fileContent: string,
    filePath: string
  ): Promise<{
    pattern: CodePattern;
    confidence: number;
    explanation: string;
  }[]> {
    const suggestions: any[] = [];
    
    // 記憶システムから検索
    const memories = await this.memoryAPI.search({
      query: errorMessage,
      type: 'error',
      limit: 5
    });
    
    // ローカルパターンから検索
    const relevantPatterns = Array.from(this.patterns.values())
      .filter(p => {
        if (p.patternType !== 'error_fix') return false;
        if (!p.context.errorMessage) return false;
        
        // エラーメッセージの類似度を計算
        const similarity = this.calculateSimilarity(
          errorMessage.toLowerCase(),
          p.context.errorMessage.toLowerCase()
        );
        
        return similarity > 0.5;
      })
      .sort((a, b) => b.successRate * b.usageCount - a.successRate * a.usageCount)
      .slice(0, 5);
    
    // パターンを提案に変換
    for (const pattern of relevantPatterns) {
      // パターンがファイル内容に適用可能かチェック
      if (fileContent.includes(pattern.beforeCode)) {
        suggestions.push({
          pattern,
          confidence: pattern.successRate,
          explanation: `This pattern has been successfully used ${pattern.usageCount} times to fix similar errors`
        });
      }
    }
    
    // 記憶システムの結果も追加
    for (const memory of memories) {
      if (memory.content?.solution) {
        suggestions.push({
          pattern: {
            patternId: memory.id,
            patternType: 'error_fix',
            beforeCode: '',
            afterCode: memory.content.solution,
            context: memory.content.context || {},
            successRate: 0.8,
            usageCount: 1,
            createdAt: new Date(memory.createdAt),
            lastUsed: new Date()
          },
          confidence: 0.7,
          explanation: memory.content.description || 'Solution from memory'
        });
      }
    }
    
    this.stats.suggestionsProvided += suggestions.length;
    
    return suggestions;
  }

  /**
   * 提案を適用
   */
  async applySuggestion(
    filePath: string,
    pattern: CodePattern
  ): Promise<boolean> {
    try {
      const readResult = await this.intelligentFS.readFile(filePath);
      if (!readResult.success || !readResult.content) {
        return false;
      }
      
      // パターンを適用
      const updatedContent = readResult.content.replace(
        pattern.beforeCode,
        pattern.afterCode
      );
      
      // ファイルを更新
      const writeResult = await this.intelligentFS.writeFile(
        filePath,
        updatedContent,
        { updateIndex: true, trackHistory: true }
      );
      
      if (writeResult.success) {
        // パターンの使用回数を更新
        pattern.usageCount++;
        pattern.lastUsed = new Date();
        await this.updatePattern(pattern);
        
        this.stats.suggestionsAccepted++;
        return true;
      }
      
      return false;
    } catch (error) {
      logger.error('Failed to apply suggestion', { error, filePath });
      return false;
    }
  }

  /**
   * プロジェクト固有のスタイルを学習
   */
  async learnProjectStyle(projectPath: string): Promise<void> {
    // プロジェクト内のファイルを分析
    const stats = await this.intelligentFS.indexProject();
    
    // TODO: スタイルパターンを抽出
    // - インデントスタイル
    // - 命名規則
    // - import順序
    // - コメントスタイル
    
    logger.info('Project style learned', { 
      filesAnalyzed: stats.totalFiles,
      symbolsAnalyzed: stats.totalSymbols
    });
  }

  /**
   * 統計情報を取得
   */
  getStats() {
    return {
      ...this.stats,
      patternsInMemory: this.patterns.size,
      acceptanceRate: this.stats.suggestionsProvided > 0 
        ? this.stats.suggestionsAccepted / this.stats.suggestionsProvided 
        : 0
    };
  }

  // ヘルパーメソッド

  private async savePattern(pattern: CodePattern): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.run(
        `INSERT OR REPLACE INTO code_patterns 
         (pattern_id, pattern_type, before_code, after_code, context, 
          success_rate, usage_count, created_at, last_used)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          pattern.patternId,
          pattern.patternType,
          pattern.beforeCode,
          pattern.afterCode,
          JSON.stringify(pattern.context),
          pattern.successRate,
          pattern.usageCount,
          pattern.createdAt.toISOString(),
          pattern.lastUsed.toISOString()
        ],
        (err) => {
          if (err) reject(err);
          else {
            this.patterns.set(pattern.patternId, pattern);
            resolve();
          }
        }
      );
    });
  }

  private async updatePattern(pattern: CodePattern): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.run(
        `UPDATE code_patterns 
         SET usage_count = ?, last_used = ?, success_rate = ?
         WHERE pattern_id = ?`,
        [
          pattern.usageCount,
          pattern.lastUsed.toISOString(),
          pattern.successRate,
          pattern.patternId
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  private async saveLearnedEvent(event: LearningEvent): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db!.run(
        `INSERT INTO learning_events 
         (event_id, event_type, file_path, before_state, after_state, 
          success, error_message, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          event.eventId,
          event.eventType,
          event.filePath,
          event.beforeState,
          event.afterState,
          event.success,
          event.errorMessage,
          event.timestamp.toISOString()
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  private async saveToMemory(memory: any): Promise<void> {
    try {
      await this.memoryAPI.saveMemory(memory);
    } catch (error) {
      logger.warn('Failed to save to memory system', { error });
    }
  }

  private computeDiff(before: string, after: string): any[] {
    // 簡単な行ベースの差分計算
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    const diffs: any[] = [];
    
    // TODO: より高度な差分アルゴリズムを実装
    
    return diffs;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // 簡単な類似度計算（Jaccard係数）
    const words1 = new Set(str1.split(/\s+/));
    const words2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private generatePatternId(): string {
    return `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

/**
 * メモリ統合マネージャーのインスタンスを作成
 */
export function createMemoryIntegrationManager(
  intelligentFS: IntelligentFileSystem,
  workspacePath: string
): MemoryIntegrationManager {
  return new MemoryIntegrationManager(intelligentFS, workspacePath);
}
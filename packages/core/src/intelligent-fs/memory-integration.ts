/**
 * メモリ統合管理システム
 * コードパターン、エラーパターン、学習データを管理
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import sqlite3, { Database } from 'sqlite3';
import { EventEmitter } from 'events';

/**
 * コードパターン情報
 */
export interface CodePattern {
  id: string;
  name: string;
  type: 'function' | 'class' | 'interface' | 'component' | 'test' | 'config';
  language: string;
  pattern: string;
  description: string;
  examples: string[];
  usageCount: number;
  successRate: number;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * エラーパターン情報
 */
export interface ErrorPattern {
  id: string;
  errorType: string;
  errorMessage: string;
  language: string;
  context: string;
  solution: string;
  preventionTips: string[];
  occurrenceCount: number;
  solvedCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 学習セッション情報
 */
export interface LearningSession {
  id: string;
  sessionType: 'coding' | 'debugging' | 'refactoring' | 'optimization';
  startTime: Date;
  endTime?: Date;
  actions: SessionAction[];
  outcomes: SessionOutcome[];
  lessons: string[];
  metadata?: Record<string, any>;
}

export interface SessionAction {
  timestamp: Date;
  action: string;
  target: string;
  parameters?: Record<string, any>;
  result?: 'success' | 'failure' | 'partial';
}

export interface SessionOutcome {
  type: 'bug_fixed' | 'feature_added' | 'performance_improved' | 'code_quality_improved';
  description: string;
  metrics?: Record<string, number>;
}

/**
 * 記憶システムの統計
 */
export interface MemoryStats {
  totalPatterns: number;
  totalErrors: number;
  totalSessions: number;
  languageBreakdown: Record<string, number>;
  patternUsage: Record<string, number>;
  errorFrequency: Record<string, number>;
  averageSuccessRate: number;
  memoryUsage: number;
  lastUpdated: Date;
}

/**
 * メモリ統合管理システム
 */
export class MemoryIntegrationManager extends EventEmitter {
  private db?: Database;
  private memoryPath: string;
  private isInitialized = false;
  private currentSession?: LearningSession;

  constructor(memoryPath: string = '.agents/memory') {
    super();
    this.memoryPath = path.isAbsolute(memoryPath) 
      ? memoryPath 
      : path.join(process.cwd(), memoryPath);
  }

  /**
   * 初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // メモリディレクトリを作成
    await fs.mkdir(this.memoryPath, { recursive: true });

    // SQLiteデータベースを初期化
    const dbPath = path.join(this.memoryPath, 'memory.db');
    this.db = new sqlite3.Database(dbPath);
    
    await this.setupDatabase();
    this.isInitialized = true;
    
    this.emit('initialized');
    console.log(`Memory integration manager initialized: ${dbPath}`);
  }

  /**
   * データベーススキーマの設定
   */
  private async setupDatabase(): Promise<void> {
    const runAsync = (sql: string, params?: any[]): Promise<any> => {
      return new Promise((resolve, reject) => {
        this.db!.run(sql, params || [], function(err: any) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    };

    // コードパターンテーブル
    await runAsync(`
      CREATE TABLE IF NOT EXISTS code_patterns (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        language TEXT NOT NULL,
        pattern TEXT NOT NULL,
        description TEXT,
        examples TEXT,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0.0,
        tags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // エラーパターンテーブル
    await runAsync(`
      CREATE TABLE IF NOT EXISTS error_patterns (
        id TEXT PRIMARY KEY,
        error_type TEXT NOT NULL,
        error_message TEXT NOT NULL,
        language TEXT NOT NULL,
        context TEXT,
        solution TEXT,
        prevention_tips TEXT,
        occurrence_count INTEGER DEFAULT 0,
        solved_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 学習セッションテーブル
    await runAsync(`
      CREATE TABLE IF NOT EXISTS learning_sessions (
        id TEXT PRIMARY KEY,
        session_type TEXT NOT NULL,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP,
        actions TEXT,
        outcomes TEXT,
        lessons TEXT,
        metadata TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // インデックスの作成
    await runAsync('CREATE INDEX IF NOT EXISTS idx_patterns_type ON code_patterns(type)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_patterns_language ON code_patterns(language)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_patterns_usage ON code_patterns(usage_count DESC)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_errors_type ON error_patterns(error_type)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_errors_language ON error_patterns(language)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_sessions_type ON learning_sessions(session_type)');
  }

  /**
   * コードパターンを保存
   */
  async saveCodePattern(
    filePath: string,
    patternType: string,
    patternData: any,
    metadata?: Record<string, any>
  ): Promise<string> {
    await this.ensureInitialized();

    const pattern: CodePattern = {
      id: this.generateId(),
      name: metadata?.name || path.basename(filePath),
      type: patternType as any,
      language: this.detectLanguage(filePath),
      pattern: JSON.stringify(patternData),
      description: metadata?.description || '',
      examples: metadata?.examples || [],
      usageCount: 0,
      successRate: 1.0,
      tags: metadata?.tags || [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await this.insertCodePattern(pattern);
    this.emit('patternSaved', { pattern, filePath });
    
    return pattern.id;
  }

  /**
   * 類似エラーを検索
   */
  async recallSimilarErrors(query: string, limit = 5): Promise<ErrorPattern[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM error_patterns 
        WHERE error_message LIKE ? OR error_type LIKE ? OR context LIKE ?
        ORDER BY occurrence_count DESC, solved_count DESC
        LIMIT ?
      `;
      const searchPattern = `%${query}%`;
      
      this.db!.all(sql, [searchPattern, searchPattern, searchPattern, limit], 
        (err: any, rows: any[]) => {
          if (err) {
            reject(err);
          } else {
            const patterns = rows.map(this.rowToErrorPattern);
            resolve(patterns);
          }
        }
      );
    });
  }

  /**
   * コードパターンを検索
   */
  async recallCodePatterns(
    patternType: string,
    limit = 10,
    language?: string
  ): Promise<CodePattern[]> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      let sql = `
        SELECT * FROM code_patterns 
        WHERE type = ?
      `;
      const params: any[] = [patternType];

      if (language) {
        sql += ` AND language = ?`;
        params.push(language);
      }

      sql += ` ORDER BY success_rate DESC, usage_count DESC LIMIT ?`;
      params.push(limit);

      this.db!.all(sql, params, (err: any, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const patterns = rows.map(this.rowToCodePattern);
          resolve(patterns);
        }
      });
    });
  }

  /**
   * メモリ統計を取得
   */
  async getMemoryStats(): Promise<MemoryStats> {
    await this.ensureInitialized();

    const stats: MemoryStats = {
      totalPatterns: 0,
      totalErrors: 0,
      totalSessions: 0,
      languageBreakdown: {},
      patternUsage: {},
      errorFrequency: {},
      averageSuccessRate: 0,
      memoryUsage: process.memoryUsage().heapUsed,
      lastUpdated: new Date()
    };

    const queries = [
      'SELECT COUNT(*) as count FROM code_patterns',
      'SELECT COUNT(*) as count FROM error_patterns',
      'SELECT COUNT(*) as count FROM learning_sessions'
    ];

    const results = await Promise.all(queries.map(query => this.executeQuery(query)));
    
    stats.totalPatterns = results[0][0]?.count || 0;
    stats.totalErrors = results[1][0]?.count || 0;
    stats.totalSessions = results[2][0]?.count || 0;

    return stats;
  }

  /**
   * クローズ
   */
  async close(): Promise<void> {
    if (this.currentSession) {
      await this.endLearningSession();
    }

    if (this.db) {
      await new Promise<void>((resolve, reject) => {
        this.db!.close((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    this.isInitialized = false;
    this.emit('closed');
  }

  // プライベートメソッド

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const languageMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.cs': 'csharp',
      '.php': 'php',
      '.rb': 'ruby',
      '.swift': 'swift'
    };
    return languageMap[ext] || 'unknown';
  }

  private generateId(): string {
    return `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async insertCodePattern(pattern: CodePattern): Promise<void> {
    const runAsync = (sql: string, params: any[]): Promise<any> => {
      return new Promise((resolve, reject) => {
        this.db!.run(sql, params, function(err: any) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    };

    await runAsync(`
      INSERT OR REPLACE INTO code_patterns (
        id, name, type, language, pattern, description, examples,
        usage_count, success_rate, tags, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      pattern.id, pattern.name, pattern.type, pattern.language,
      pattern.pattern, pattern.description, JSON.stringify(pattern.examples),
      pattern.usageCount, pattern.successRate, JSON.stringify(pattern.tags),
      pattern.createdAt.toISOString(), pattern.updatedAt.toISOString()
    ]);
  }

  private async executeQuery(sql: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db!.all(sql, (err: any, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  private rowToCodePattern(row: any): CodePattern {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      language: row.language,
      pattern: row.pattern,
      description: row.description,
      examples: JSON.parse(row.examples || '[]'),
      usageCount: row.usage_count,
      successRate: row.success_rate,
      tags: JSON.parse(row.tags || '[]'),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private rowToErrorPattern(row: any): ErrorPattern {
    return {
      id: row.id,
      errorType: row.error_type,
      errorMessage: row.error_message,
      language: row.language,
      context: row.context,
      solution: row.solution,
      preventionTips: JSON.parse(row.prevention_tips || '[]'),
      occurrenceCount: row.occurrence_count,
      solvedCount: row.solved_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  // 学習セッション関連（簡易実装）
  private async endLearningSession(): Promise<void> {
    // セッション終了処理
    this.currentSession = undefined;
  }
}

/**
 * メモリ統合マネージャーのファクトリー関数
 */
export function createMemoryIntegrationManager(memoryPath?: string): MemoryIntegrationManager {
  return new MemoryIntegrationManager(memoryPath);
}
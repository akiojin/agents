/**
 * 決定ログシステムのメイン実装
 * エージェントの行動とその理由を記録し、因果関係を追跡
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import {
  Action,
  Reason,
  Decision,
  WhyChain,
  Pattern,
  Session,
  SearchOptions,
  SearchResult,
  PatternDetectionOptions,
  Statistics,
  ResultType,
  ActionType
} from './types.js';

export class DecisionLog {
  private db: Database.Database;
  private currentSession: string;
  private schemaPath: string;

  constructor(dbPath: string = '.agents/decisions.db') {
    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // データベース接続
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // パフォーマンス向上
    this.db.pragma('foreign_keys = ON');   // 外部キー制約を有効化

    // ESモジュール用に__dirnameを取得
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // スキーマのパスを取得
    this.schemaPath = path.join(__dirname, 'schema.sql');
    
    // 初期化
    this.initialize();
    
    // セッション開始
    this.currentSession = uuidv4();
    this.startSession();
  }

  /**
   * データベースを初期化
   */
  private initialize(): void {
    try {
      // スキーマファイルを読み込んで実行
      const schema = fs.readFileSync(this.schemaPath, 'utf-8');
      this.db.exec(schema);
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
      // フォールバック: インラインスキーマ
      this.initializeInlineSchema();
    }
  }

  /**
   * インラインスキーマで初期化（フォールバック）
   */
  private initializeInlineSchema(): void {
    const schema = `
      CREATE TABLE IF NOT EXISTS decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        action_type TEXT NOT NULL,
        action_target TEXT,
        action_details TEXT,
        reason TEXT NOT NULL,
        user_intent TEXT,
        context TEXT,
        result TEXT,
        output TEXT,
        error TEXT,
        session_id TEXT NOT NULL,
        project_path TEXT,
        confidence REAL,
        importance REAL DEFAULT 0.5,
        parent_decision_id INTEGER,
        FOREIGN KEY (parent_decision_id) REFERENCES decisions(id) ON DELETE SET NULL
      );
      
      CREATE INDEX IF NOT EXISTS idx_decisions_timestamp ON decisions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_decisions_session ON decisions(session_id);
      CREATE INDEX IF NOT EXISTS idx_decisions_action_type ON decisions(action_type);
      CREATE INDEX IF NOT EXISTS idx_decisions_parent ON decisions(parent_decision_id);
      
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        project_path TEXT,
        total_decisions INTEGER DEFAULT 0,
        successful_decisions INTEGER DEFAULT 0,
        failed_decisions INTEGER DEFAULT 0,
        metadata TEXT
      );
    `;
    this.db.exec(schema);
  }

  /**
   * セッションを開始
   */
  private startSession(): void {
    const stmt = this.db.prepare(`
      INSERT INTO sessions (id, project_path)
      VALUES (?, ?)
    `);
    stmt.run(this.currentSession, process.cwd());
  }

  /**
   * 決定を記録
   */
  async logDecision(
    action: Action,
    reason: Reason,
    parentId?: number,
    confidence: number = 0.7
  ): Promise<number> {
    const stmt = this.db.prepare(`
      INSERT INTO decisions (
        action_type, action_target, action_details,
        reason, user_intent, context,
        session_id, project_path, confidence, parent_decision_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      action.type,
      action.target || null,
      action.details ? JSON.stringify(action.details) : null,
      reason.direct,
      reason.userIntent || null,
      reason.context ? JSON.stringify(reason.context) : null,
      this.currentSession,
      process.cwd(),
      confidence,
      parentId || null
    );

    // セッションの統計を更新
    this.updateSessionStats('total_decisions');

    return result.lastInsertRowid as number;
  }

  /**
   * 結果を更新
   */
  async updateResult(
    decisionId: number,
    result: ResultType,
    output?: string,
    error?: string
  ): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE decisions 
      SET result = ?, output = ?, error = ?
      WHERE id = ?
    `);
    
    stmt.run(result, output || null, error || null, decisionId);

    // セッションの統計を更新
    if (result === ResultType.Success) {
      this.updateSessionStats('successful_decisions');
    } else if (result === ResultType.Failure) {
      this.updateSessionStats('failed_decisions');
    }
  }

  /**
   * なぜを追跡（因果チェーンを構築）
   */
  async explainWhy(decisionId: number): Promise<WhyChain> {
    const chain: Decision[] = [];
    let currentId: number | null = decisionId;
    const visited = new Set<number>(); // 循環参照を防ぐ

    // 親を辿る
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      
      const decision = this.db.prepare(`
        SELECT * FROM decisions WHERE id = ?
      `).get(currentId) as Decision | undefined;

      if (decision) {
        chain.push(this.parseDecision(decision));
        currentId = decision.parent_decision_id || null;
      } else {
        break;
      }
    }

    // 逆順にして原因から結果の順にする
    chain.reverse();

    return {
      chain,
      summary: this.summarizeChain(chain)
    };
  }

  /**
   * 子決定を取得（この決定が原因となった決定）
   */
  async getChildren(decisionId: number): Promise<Decision[]> {
    const children = this.db.prepare(`
      SELECT * FROM decisions 
      WHERE parent_decision_id = ?
      ORDER BY timestamp ASC
    `).all(decisionId) as Decision[];

    return children.map(d => this.parseDecision(d));
  }

  /**
   * 最近の決定を取得
   */
  getRecentDecisions(hours: number = 24): Decision[] {
    const decisions = this.db.prepare(`
      SELECT * FROM decisions 
      WHERE timestamp > datetime('now', '-${hours} hours')
      ORDER BY timestamp DESC
    `).all() as Decision[];

    return decisions.map(d => this.parseDecision(d));
  }

  /**
   * パターンを検出
   */
  detectPatterns(options: PatternDetectionOptions = {}): Pattern[] {
    const {
      minFrequency = 3,
      minSuccessRate = 0,
      timeWindow = 168 // デフォルト1週間
    } = options;

    const patterns = this.db.prepare(`
      SELECT 
        action_type,
        COUNT(*) as frequency,
        AVG(CASE WHEN result = 'success' THEN 1.0 ELSE 0.0 END) as success_rate,
        MAX(timestamp) as last_seen
      FROM decisions
      WHERE timestamp > datetime('now', '-${timeWindow} hours')
      GROUP BY action_type
      HAVING frequency >= ? AND success_rate >= ?
      ORDER BY frequency DESC
    `).all(minFrequency, minSuccessRate) as Array<{
      action_type: string;
      frequency: number;
      success_rate: number;
      last_seen: string;
    }>;

    return patterns.map(p => ({
      pattern_type: 'action_frequency',
      pattern_data: { action_type: p.action_type },
      frequency: p.frequency,
      success_rate: p.success_rate,
      last_seen: new Date(p.last_seen)
    }));
  }

  /**
   * 検索
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const {
      limit = 10,
      offset = 0,
      actionTypes,
      sessionId,
      projectPath
    } = options;

    let sql = `
      SELECT * FROM decisions
      WHERE (
        action_type LIKE ? OR
        action_target LIKE ? OR
        reason LIKE ? OR
        user_intent LIKE ?
      )
    `;
    const params: any[] = [`%${query}%`, `%${query}%`, `%${query}%`, `%${query}%`];

    // フィルター追加
    if (actionTypes && actionTypes.length > 0) {
      sql += ` AND action_type IN (${actionTypes.map(() => '?').join(',')})`;
      params.push(...actionTypes);
    }
    if (sessionId) {
      sql += ` AND session_id = ?`;
      params.push(sessionId);
    }
    if (projectPath) {
      sql += ` AND project_path = ?`;
      params.push(projectPath);
    }

    sql += ` ORDER BY timestamp DESC LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const decisions = this.db.prepare(sql).all(...params) as Decision[];

    // 結果を構築
    const results: SearchResult[] = [];
    for (const decision of decisions) {
      const result: SearchResult = {
        decision: this.parseDecision(decision)
      };

      // オプションで因果チェーンを含める
      if (options.includeParents || options.includeChildren) {
        result.whyChain = await this.explainWhy(decision.id);
      }

      results.push(result);
    }

    return results;
  }

  /**
   * 統計情報を取得
   */
  getStatistics(sessionId?: string): Statistics {
    const whereClause = sessionId ? `WHERE session_id = '${sessionId}'` : '';

    // 基本統計
    const basicStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        AVG(CASE WHEN result = 'success' THEN 1.0 ELSE 0.0 END) as success_rate,
        AVG(confidence) as avg_confidence
      FROM decisions
      ${whereClause}
    `).get() as any;

    // 頻出アクション
    const frequentActions = this.db.prepare(`
      SELECT 
        action_type,
        COUNT(*) as count,
        AVG(CASE WHEN result = 'success' THEN 1.0 ELSE 0.0 END) as success_rate
      FROM decisions
      ${whereClause}
      GROUP BY action_type
      ORDER BY count DESC
      LIMIT 10
    `).all() as any[];

    // 最近のパターン
    const recentPatterns = this.detectPatterns();

    return {
      totalDecisions: basicStats.total || 0,
      successRate: basicStats.success_rate || 0,
      averageConfidence: basicStats.avg_confidence || 0,
      mostFrequentActions: frequentActions,
      recentPatterns: recentPatterns.slice(0, 5)
    };
  }

  /**
   * セッション統計を更新
   */
  private updateSessionStats(field: string): void {
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET ${field} = ${field} + 1
      WHERE id = ?
    `);
    stmt.run(this.currentSession);
  }

  /**
   * 決定をパース（JSON文字列を展開）
   */
  private parseDecision(decision: any): Decision {
    return {
      ...decision,
      action_details: decision.action_details ? JSON.parse(decision.action_details) : undefined,
      context: decision.context ? JSON.parse(decision.context) : undefined,
      timestamp: new Date(decision.timestamp)
    };
  }

  /**
   * 因果チェーンを要約
   */
  private summarizeChain(chain: Decision[]): string {
    if (chain.length === 0) return '因果関係なし';
    
    const steps = chain.map((d, i) => {
      const prefix = i === 0 ? '原因' : i === chain.length - 1 ? '結果' : `ステップ${i}`;
      return `${prefix}: ${d.action_type}${d.action_target ? ` (${d.action_target})` : ''} - ${d.reason}`;
    });

    return steps.join(' → ');
  }

  /**
   * クローズ処理
   */
  close(): void {
    // セッション終了
    const stmt = this.db.prepare(`
      UPDATE sessions 
      SET ended_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(this.currentSession);

    // データベースを閉じる
    this.db.close();
  }

  /**
   * 現在のセッションIDを取得
   */
  getCurrentSessionId(): string {
    return this.currentSession;
  }

  /**
   * データベースのパスを取得
   */
  getDbPath(): string {
    return this.db.name;
  }
}
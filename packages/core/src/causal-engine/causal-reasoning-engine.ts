/**
 * 因果関係解決エンジン - WhyChain構築システム
 * SQLiteベースの決定ログシステムで因果関係を追跡・学習
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 因果関係決定ノード
 */
export interface CausalDecision {
  id: string;
  action: string;
  reason: string;
  result?: string;
  parentDecisionId?: string;
  timestamp: Date;
  successRate?: number;
  riskLevel?: 'low' | 'medium' | 'high';
  contextSignature: string;
}

/**
 * WhyChain - 因果関係チェーン
 */
export interface WhyChain {
  chain: CausalDecision[];
  summary: string;
  rootCause: string;
  confidenceScore: number;
  predictedOutcome: string;
}

/**
 * 因果パターン学習データ
 */
interface CausalPattern {
  id: string;
  patternType: string;
  actionPattern: string;
  successCount: number;
  failureCount: number;
  avgExecutionTime: number;
  lastSeen: Date;
}

export class CausalReasoningEngine {
  private db: Database.Database;
  private dbPath: string;

  constructor(projectPath?: string) {
    const baseDir = projectPath || process.cwd();
    const cacheDir = path.join(baseDir, '.agents', 'cache');
    
    // キャッシュディレクトリを作成
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    this.dbPath = path.join(cacheDir, 'causal-decisions.db');
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  /**
   * データベース初期化
   */
  private initializeDatabase(): void {
    // 因果決定テーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS causal_decisions (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        result TEXT,
        parent_decision_id TEXT,
        timestamp INTEGER NOT NULL,
        success_rate REAL DEFAULT 0.5,
        risk_level TEXT DEFAULT 'medium',
        context_signature TEXT NOT NULL,
        execution_time INTEGER DEFAULT 0,
        actual_success BOOLEAN DEFAULT NULL,
        FOREIGN KEY (parent_decision_id) REFERENCES causal_decisions(id)
      );
    `);

    // 因果パターンテーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS causal_patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        action_pattern TEXT NOT NULL,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        avg_execution_time REAL DEFAULT 0,
        last_seen INTEGER NOT NULL,
        confidence_score REAL DEFAULT 0.5
      );
    `);

    // インデックスの作成
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_causal_context ON causal_decisions(context_signature);
      CREATE INDEX IF NOT EXISTS idx_causal_timestamp ON causal_decisions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_pattern_type ON causal_patterns(pattern_type);
    `);
  }

  /**
   * 因果決定を記録し、過去のパターンから予測
   */
  async recordCausalDecision(decision: Omit<CausalDecision, 'successRate' | 'id'>): Promise<CausalDecision> {
    const decisionId = `decision_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 類似の過去決定を検索して成功率を予測
    const similarDecisions = this.findSimilarDecisions(decision.action, decision.contextSignature);
    const predictedSuccessRate = this.calculatePredictedSuccessRate(similarDecisions);
    const riskLevel = this.assessRiskLevel(decision.action, predictedSuccessRate);
    
    const fullDecision: CausalDecision = {
      id: decisionId,
      ...decision,
      successRate: predictedSuccessRate,
      riskLevel
    };

    // データベースに保存
    const stmt = this.db.prepare(`
      INSERT INTO causal_decisions 
      (id, action, reason, result, parent_decision_id, timestamp, success_rate, risk_level, context_signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      fullDecision.id,
      fullDecision.action,
      fullDecision.reason,
      fullDecision.result || null,
      fullDecision.parentDecisionId || null,
      fullDecision.timestamp.getTime(),
      fullDecision.successRate,
      fullDecision.riskLevel,
      fullDecision.contextSignature
    );

    console.log(`[CausalEngine] Recorded decision: ${decision.action} (predicted success: ${(predictedSuccessRate * 100).toFixed(1)}%)`);
    
    return fullDecision;
  }

  /**
   * 動的WhyChain構築 - 因果関係を遡及追跡
   */
  async buildDynamicWhyChain(initialDecision: CausalDecision): Promise<WhyChain> {
    const chain: CausalDecision[] = [];
    const visited = new Set<string>();
    
    // 因果チェーンを遡及的に構築
    let currentDecision: CausalDecision | null = initialDecision;
    
    while (currentDecision && !visited.has(currentDecision.id)) {
      visited.add(currentDecision.id);
      chain.unshift(currentDecision);
      
      if (currentDecision.parentDecisionId) {
        currentDecision = this.getDecisionById(currentDecision.parentDecisionId);
      } else {
        break;
      }
    }

    // 根本原因を特定
    const rootCause = this.identifyRootCause(chain);
    
    // 結果予測
    const predictedOutcome = this.predictChainOutcome(chain);
    
    // 信頼度スコアを計算
    const confidenceScore = this.calculateChainConfidence(chain);
    
    // 要約を生成
    const summary = this.generateChainSummary(chain);

    return {
      chain,
      summary,
      rootCause,
      confidenceScore,
      predictedOutcome
    };
  }

  /**
   * 類似決定を検索
   */
  private findSimilarDecisions(action: string, contextSignature: string): CausalDecision[] {
    const stmt = this.db.prepare(`
      SELECT * FROM causal_decisions 
      WHERE (action LIKE ? OR context_signature = ?) 
      AND actual_success IS NOT NULL
      ORDER BY timestamp DESC
      LIMIT 20
    `);
    
    const rows = stmt.all(`%${action}%`, contextSignature) as any[];
    
    return rows.map((row: any) => ({
      id: row.id,
      action: row.action,
      reason: row.reason,
      result: row.result,
      parentDecisionId: row.parent_decision_id,
      timestamp: new Date(row.timestamp),
      successRate: row.success_rate,
      riskLevel: row.risk_level,
      contextSignature: row.context_signature
    }));
  }

  /**
   * 成功率予測
   */
  private calculatePredictedSuccessRate(similarDecisions: CausalDecision[]): number {
    if (similarDecisions.length === 0) return 0.5; // デフォルト50%
    
    const successCount = similarDecisions.filter(d => d.successRate && d.successRate > 0.5).length;
    const baseRate = successCount / similarDecisions.length;
    
    // 時間減衰を適用（新しい決定ほど重要）
    const weightedSum = similarDecisions.reduce((sum, decision, index) => {
      const weight = Math.exp(-index * 0.1); // 指数減衰
      return sum + ((decision.successRate || 0.5) * weight);
    }, 0);
    
    const totalWeight = similarDecisions.reduce((sum, _, index) => {
      return sum + Math.exp(-index * 0.1);
    }, 0);
    
    return totalWeight > 0 ? weightedSum / totalWeight : baseRate;
  }

  /**
   * リスクレベル評価
   */
  private assessRiskLevel(action: string, successRate: number): 'low' | 'medium' | 'high' {
    if (successRate > 0.8) return 'low';
    if (successRate > 0.4) return 'medium';
    return 'high';
  }

  /**
   * 決定をIDで取得
   */
  private getDecisionById(id: string): CausalDecision | null {
    const stmt = this.db.prepare('SELECT * FROM causal_decisions WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      action: row.action,
      reason: row.reason,
      result: row.result,
      parentDecisionId: row.parent_decision_id,
      timestamp: new Date(row.timestamp),
      successRate: row.success_rate,
      riskLevel: row.risk_level,
      contextSignature: row.context_signature
    };
  }

  /**
   * 根本原因特定
   */
  private identifyRootCause(chain: CausalDecision[]): string {
    if (chain.length === 0) return '原因不明';
    
    const rootDecision = chain[0];
    
    // パターン認識による根本原因分析
    const actionKeywords = rootDecision.action.toLowerCase();
    
    if (actionKeywords.includes('承認') || actionKeywords.includes('approval')) {
      return 'ユーザー承認プロセスの設計課題';
    }
    if (actionKeywords.includes('ui') || actionKeywords.includes('ユーザビリティ')) {
      return 'ユーザーインターフェース設計の問題';
    }
    if (actionKeywords.includes('統合') || actionKeywords.includes('integration')) {
      return 'システム間統合の設計不備';
    }
    
    return rootDecision.reason || 'システム設計の構造的課題';
  }

  /**
   * チェーン結果予測
   */
  private predictChainOutcome(chain: CausalDecision[]): string {
    const avgSuccessRate = chain.reduce((sum, decision) => sum + (decision.successRate || 0.5), 0) / chain.length;
    
    if (avgSuccessRate > 0.8) {
      return '高確率で期待される結果を達成';
    }
    if (avgSuccessRate > 0.6) {
      return '概ね良好な結果が期待される';
    }
    if (avgSuccessRate > 0.4) {
      return '結果は不確実、追加の対策が必要';
    }
    
    return '失敗リスクが高い、根本的な見直しが必要';
  }

  /**
   * チェーン信頼度計算
   */
  private calculateChainConfidence(chain: CausalDecision[]): number {
    if (chain.length === 0) return 0;
    
    const avgSuccessRate = chain.reduce((sum, decision) => sum + (decision.successRate || 0.5), 0) / chain.length;
    const chainLength = Math.min(chain.length, 5); // 最大5段階で正規化
    const lengthBonus = chainLength * 0.1; // 長いチェーンほど信頼性が高い
    
    return Math.min(1.0, avgSuccessRate + lengthBonus);
  }

  /**
   * チェーン要約生成
   */
  private generateChainSummary(chain: CausalDecision[]): string {
    if (chain.length === 0) return '因果関係が特定できませんでした';
    
    const actions = chain.map(d => d.action).join(' → ');
    const finalOutcome = chain[chain.length - 1].result || '結果待ち';
    
    return `因果連鎖: ${actions} | 最終結果: ${finalOutcome}`;
  }

  /**
   * 決定結果フィードバック（学習用）
   */
  async recordDecisionOutcome(decisionId: string, success: boolean, actualResult?: string): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE causal_decisions 
      SET actual_success = ?, result = COALESCE(?, result)
      WHERE id = ?
    `);
    
    stmt.run(success, actualResult, decisionId);
    
    // パターン学習を更新
    await this.updatePatternLearning(decisionId, success);
    
    console.log(`[CausalEngine] Updated decision outcome: ${decisionId} = ${success ? 'SUCCESS' : 'FAILURE'}`);
  }

  /**
   * パターン学習更新
   */
  private async updatePatternLearning(decisionId: string, success: boolean): Promise<void> {
    const decision = this.getDecisionById(decisionId);
    if (!decision) return;
    
    const patternId = `pattern_${decision.contextSignature}`;
    const actionPattern = decision.action.substring(0, 100); // パターン識別用
    
    // 既存パターンを取得または作成
    let stmt = this.db.prepare('SELECT * FROM causal_patterns WHERE id = ?');
    let pattern = stmt.get(patternId) as any;
    
    if (pattern) {
      // 既存パターンを更新
      const newSuccessCount = success ? pattern.success_count + 1 : pattern.success_count;
      const newFailureCount = success ? pattern.failure_count : pattern.failure_count + 1;
      
      stmt = this.db.prepare(`
        UPDATE causal_patterns 
        SET success_count = ?, failure_count = ?, last_seen = ?,
            confidence_score = CAST(? AS REAL) / (? + ?)
        WHERE id = ?
      `);
      
      stmt.run(
        newSuccessCount,
        newFailureCount,
        Date.now(),
        newSuccessCount,
        newSuccessCount,
        newFailureCount,
        patternId
      );
    } else {
      // 新規パターンを作成
      stmt = this.db.prepare(`
        INSERT INTO causal_patterns 
        (id, pattern_type, action_pattern, success_count, failure_count, last_seen, confidence_score)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        patternId,
        decision.contextSignature,
        actionPattern,
        success ? 1 : 0,
        success ? 0 : 1,
        Date.now(),
        success ? 1.0 : 0.0
      );
    }
  }

  /**
   * リソースクリーンアップ
   */
  close(): void {
    this.db.close();
  }
}
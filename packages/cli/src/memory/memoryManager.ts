/**
 * Memory Manager for integrating IntegratedMemorySystem with CLI
 * 
 * This manager handles:
 * - Initialization of memory system
 * - Project-specific memory isolation
 * - Automatic memory triggers
 * - Error pattern learning
 * - Success pattern recording
 */

import { IntegratedMemorySystem } from '@agents/memory';
// TODO: DecisionLogは後で再有効化
// import { DecisionLog, WhyChain, ResultType } from '@agents/memory/decision-log';
import { Config } from '@indenscale/open-gemini-cli-core';
import path from 'path';
import crypto from 'crypto';

export interface MemoryManagerConfig {
  sqlitePath?: string;
  autoDecay?: boolean;
  decayInterval?: number;
  projectRoot: string;
  enableDecisionLog?: boolean;
  enableWhyChain?: boolean;
}

export class MemoryManager {
  private memorySystem: IntegratedMemorySystem | null = null;
  // private decisionLog: DecisionLog | null = null;
  private projectId: string;
  private config: MemoryManagerConfig;
  private initialized: boolean = false;
  private currentDecisionId: number | null = null;
  
  constructor(config: MemoryManagerConfig) {
    this.config = config;
    // プロジェクトIDを生成（プロジェクトパスのハッシュ）
    this.projectId = this.generateProjectId(config.projectRoot);
  }
  
  /**
   * プロジェクト固有のIDを生成
   */
  private generateProjectId(projectRoot: string): string {
    const normalizedPath = path.resolve(projectRoot);
    const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
    return `project_${hash.substring(0, 12)}`;
  }
  
  /**
   * 記憶システムの初期化
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    
    // メモリシステム初期化中...
    
    // プロジェクト固有のコレクション名
    const collectionName = `memories_${this.projectId}`;
    
    // SQLiteデータベースパスを設定
    const defaultSqlitePath = path.join(this.config.projectRoot, '.agents', `memories_${this.projectId}.db`);
    
    this.memorySystem = new IntegratedMemorySystem({
      collectionName,
      sqlitePath: this.config.sqlitePath || defaultSqlitePath,
      autoDecay: this.config.autoDecay !== false,
      decayInterval: this.config.decayInterval || 3600000 // 1時間
    });
    
    await this.memorySystem.initialize();
    
    // TODO: DecisionLogの初期化は後で再有効化
    // if (this.config.enableDecisionLog !== false) {
    //   const decisionDbPath = path.join(this.config.projectRoot, '.agents', 'decisions.db');
    //   this.decisionLog = new DecisionLog(decisionDbPath);
    // }
    
    this.initialized = true;
    
    // 既存の記憶統計を取得（ログは出力しない）
    const stats = await this.memorySystem.getStatistics();
    
    // TODO: 決定ログの統計を取得（後で再有効化）
    // if (this.decisionLog) {
    //   const decisionStats = await this.decisionLog.getStatistics();
    // }
  }
  
  /**
   * エラーパターンの記録
   */
  async recordError(error: Error | string, solution?: string, context?: any): Promise<void> {
    if (!this.memorySystem) return;
    
    const errorMessage = error instanceof Error ? error.message : error;
    const solutionText = solution || 'No solution found yet';
    
    try {
      await this.memorySystem.storeErrorPattern(
        errorMessage,
        solutionText,
        {
          ...context,
          timestamp: new Date(),
          projectId: this.projectId
        }
      );
      // Error pattern saved to memory
    } catch (e) {
      console.debug('Failed to save error pattern:', e);
    }
  }
  
  /**
   * 成功パターンの記録
   */
  async recordSuccess(task: string, steps: string[], result: any): Promise<void> {
    if (!this.memorySystem) return;
    
    try {
      await this.memorySystem.storeSuccessPattern(
        task,
        steps,
        {
          ...result,
          projectId: this.projectId
        }
      );
      // Success pattern saved to memory
    } catch (e) {
      console.debug('Failed to save success pattern:', e);
    }
  }
  
  /**
   * エラー解決策の検索
   */
  async findErrorSolution(error: string, context?: any): Promise<string | null> {
    if (!this.memorySystem) return null;
    
    try {
      const solution = await this.memorySystem.findErrorSolution(error, {
        ...context,
        projectId: this.projectId
      });
      
      if (solution && solution.confidence > 0.5) {
        console.log(`💡 Found potential solution (confidence: ${(solution.confidence * 100).toFixed(0)}%)`);
        return solution.solution;
      }
    } catch (e) {
      console.debug('Failed to search for error solution:', e);
    }
    
    return null;
  }
  
  /**
   * 文脈を考慮した記憶の検索
   */
  async recall(query: string, context: string[] = []): Promise<any[]> {
    if (!this.memorySystem) return [];
    
    try {
      const memories = await this.memorySystem.recall(query, [
        ...context,
        this.projectId
      ]);
      return memories;
    } catch (e) {
      console.debug('Failed to recall memories:', e);
      return [];
    }
  }
  
  /**
   * 重要な記憶の取得
   */
  async getImportantMemories(limit: number = 5): Promise<any[]> {
    if (!this.memorySystem) return [];
    
    try {
      return await this.memorySystem.getImportantMemories(limit);
    } catch (e) {
      console.debug('Failed to get important memories:', e);
      return [];
    }
  }
  
  /**
   * 統計情報の取得
   */
  async getStatistics(): Promise<any> {
    if (!this.memorySystem) {
      return {
        totalMemories: 0,
        averageAccessCount: 0,
        averageSuccessRate: 0,
        mostAccessedMemories: [],
        recentMemories: []
      };
    }
    
    try {
      return await this.memorySystem.getStatistics();
    } catch (e) {
      console.debug('Failed to get memory statistics:', e);
      return null;
    }
  }
  
  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    if (this.memorySystem) {
      await this.memorySystem.cleanup();
    }
    // TODO: DecisionLogクリーンアップは後で再有効化
    // if (this.decisionLog) {
    //   await this.decisionLog.close();
    // }
  }
  
  /**
   * 記憶システムが利用可能かチェック
   */
  isAvailable(): boolean {
    return this.memorySystem !== null && this.initialized;
  }
  
  /**
   * 決定を記録 (TODO: 後で再有効化)
   */
  async recordDecision(action: string, reason: string, context?: any): Promise<number | null> {
    // TODO: DecisionLog機能の再有効化
    return null;
    // if (!this.decisionLog) return null;
    // 
    // try {
    //   const decisionId = await this.decisionLog.logDecision(
    //     { type: 'action', target: action },
    //     { direct: reason, context: context },
    //     this.currentDecisionId || undefined
    //   );
    //   
    //   this.currentDecisionId = decisionId;
    //   return decisionId;
    // } catch (error) {
    //   console.warn('Failed to record decision:', error);
    //   return null;
    // }
  }
  
  /**
   * 決定の結果を更新 (TODO: 後で再有効化)
   */
  async updateDecisionResult(decisionId: number, result: any, output?: string): Promise<void> {
    // TODO: DecisionLog機能の再有効化
    // if (!this.decisionLog) return;
    // 
    // try {
    //   await this.decisionLog.updateResult(decisionId, result, output);
    // } catch (error) {
    //   console.warn('Failed to update decision result:', error);
    // }
  }
  
  /**
   * WhyChainを構築 (TODO: 後で再有効化)
   */
  async buildWhyChain(decisionId?: number): Promise<any | null> {
    // TODO: DecisionLog機能の再有効化
    return null;
    // if (!this.decisionLog) return null;
    // 
    // try {
    //   const targetId = decisionId || this.currentDecisionId;
    //   if (!targetId) return null;
    //   
    //   const whyChain = await this.decisionLog.explainWhy(targetId);
    //   return whyChain;
    // } catch (error) {
    //   console.warn('Failed to build why chain:', error);
    //   return null;
    // }
  }
  
  /**
   * パターンを検出 (TODO: 後で再有効化)
   */
  async detectPatterns(options?: any): Promise<any[]> {
    // TODO: DecisionLog機能の再有効化
    return [];
    // if (!this.decisionLog) return [];
    // 
    // try {
    //   const patterns = await this.decisionLog.detectPatterns(options);
    //   return patterns;
    // } catch (error) {
    //   console.warn('Failed to detect patterns:', error);
    //   return [];
    // }
  }
  
  /**
   * シナプス記憶ネットワークへの直接アクセス
   */
  getSynapticNetwork() {
    if (this.memorySystem && 'getSynapticNetwork' in this.memorySystem) {
      return (this.memorySystem as any).getSynapticNetwork();
    }
    return null;
  }
  
  /**
   * 決定ログへの直接アクセス (TODO: 後で再有効化)
   */
  getDecisionLog() {
    // TODO: DecisionLog機能の再有効化
    return null;
    // return this.decisionLog;
  }
}

// シングルトンインスタンス
let memoryManagerInstance: MemoryManager | null = null;

/**
 * MemoryManagerのシングルトンインスタンスを取得
 */
export function getMemoryManager(config?: MemoryManagerConfig): MemoryManager {
  if (!memoryManagerInstance && config) {
    memoryManagerInstance = new MemoryManager(config);
  }
  
  if (!memoryManagerInstance) {
    throw new Error('MemoryManager not initialized. Please provide config on first call.');
  }
  
  return memoryManagerInstance;
}

/**
 * MemoryManagerインスタンスをリセット（テスト用）
 */
export function resetMemoryManager(): void {
  memoryManagerInstance = null;
}
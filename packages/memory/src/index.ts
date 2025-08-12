/**
 * 記憶システムのメインエントリーポイント
 * シナプスモデルとSQLiteを統合した知的記憶システム
 */

import { SqliteMemoryClient, Memory } from './sqlite/SqliteMemoryClient.js';
import { SynapticMemoryNetwork } from './synaptic/synapticNetwork.js';

export interface MemorySystemConfig {
  collectionName?: string;
  sqlitePath?: string;
  autoDecay?: boolean;
  decayInterval?: number;  // ミリ秒
}

export class IntegratedMemorySystem {
  private sqliteClient: SqliteMemoryClient;
  private synapticNetwork: SynapticMemoryNetwork;
  private config: MemorySystemConfig;
  private decayTimer?: NodeJS.Timeout;
  private memoryIdCounter: number = 0;

  constructor(config: MemorySystemConfig = {}) {
    this.config = {
      collectionName: config.collectionName || 'agent_memories',
      sqlitePath: config.sqlitePath || ':memory:',
      autoDecay: config.autoDecay !== false,
      decayInterval: config.decayInterval || 3600000  // 1時間ごと
    };

    this.sqliteClient = new SqliteMemoryClient({
      sqlitePath: this.config.sqlitePath,
      collectionName: this.config.collectionName
    });
    this.synapticNetwork = new SynapticMemoryNetwork(this.sqliteClient);
  }

  /**
   * システムの初期化
   */
  async initialize(): Promise<void> {
    // メモリシステム初期化中...
    
    // SQLite初期化
    await this.sqliteClient.initialize();
    
    // シナプスネットワーク初期化
    await this.synapticNetwork.initialize();
    
    // 自動減衰を開始
    if (this.config.autoDecay) {
      this.startAutoDecay();
    }
    
    // メモリシステム初期化成功のログは削除（必要時のみ表示）
  }

  /**
   * イベントから記憶すべきか判断
   */
  async checkMemoryRelevance(event: any): Promise<boolean> {
    // エラーイベント
    if (event.type === 'error' && event.resolved) {
      return true;
    }
    
    // 成功したタスク
    if (event.type === 'task_completed' && event.iterations > 3) {
      return true;
    }
    
    // ユーザーからの明示的な記憶要求
    if (event.type === 'explicit_memory') {
      return true;
    }
    
    // 重要な発見
    if (event.type === 'discovery' && event.importance > 0.7) {
      return true;
    }
    
    return false;
  }

  /**
   * 記憶の保存
   */
  async store(content: any, tags: string[] = []): Promise<string> {
    const memoryId = `memory_${Date.now()}_${this.memoryIdCounter++}`;
    
    const memory: Memory = {
      id: memoryId,
      content,
      metadata: {
        created_at: new Date(),
        last_accessed: new Date(),
        access_count: 0,
        success_rate: 0.5,  // 初期値は中立
        tags,
        connections: []
      }
    };

    await this.synapticNetwork.addMemory(memory);
    console.log(`Stored memory: ${memoryId}`);
    
    return memoryId;
  }

  /**
   * エラーパターンの記憶
   */
  async storeErrorPattern(
    error: string,
    solution: string,
    context: any
  ): Promise<string> {
    const content = {
      type: 'error_pattern',
      error,
      solution,
      context,
      timestamp: new Date()
    };
    
    return await this.store(content, ['error', 'solution']);
  }

  /**
   * 成功パターンの記憶
   */
  async storeSuccessPattern(
    task: string,
    steps: string[],
    result: any
  ): Promise<string> {
    const content = {
      type: 'success_pattern',
      task,
      steps,
      result,
      timestamp: new Date()
    };
    
    return await this.store(content, ['success', 'pattern']);
  }

  /**
   * 知的検索（文脈考慮）
   */
  async recall(
    query: string,
    context: string[] = []
  ): Promise<Memory[]> {
    return await this.synapticNetwork.contextualSearch(query, context);
  }

  /**
   * エラー解決策の検索
   */
  async findErrorSolution(
    error: string,
    context: any = {}
  ): Promise<{ solution: string; confidence: number } | null> {
    const contextStrings = [
      context.file || '',
      context.language || '',
      context.framework || ''
    ].filter(s => s);
    
    const memories = await this.recall(error, contextStrings);
    
    for (const memory of memories) {
      if (memory.content.type === 'error_pattern') {
        // エラーメッセージの類似度を確認
        const similarity = this.calculateSimilarity(
          error,
          memory.content.error
        );
        
        if (similarity > 0.7) {
          return {
            solution: memory.content.solution,
            confidence: similarity * memory.metadata.success_rate
          };
        }
      }
    }
    
    return null;
  }

  /**
   * 記憶の活性化（使用時）
   */
  async use(memoryId: string): Promise<void> {
    await this.synapticNetwork.activate(memoryId);
  }

  /**
   * フィードバック（成功/失敗）
   */
  async feedback(memoryId: string, success: boolean): Promise<void> {
    await this.synapticNetwork.updateOutcome(memoryId, success);
  }

  /**
   * 人間による評価
   */
  async humanRate(
    memoryId: string,
    rating: 'useful' | 'neutral' | 'noise'
  ): Promise<void> {
    const memory = await this.sqliteClient.get(memoryId);
    if (memory) {
      memory.metadata.human_rating = rating;
      await this.sqliteClient.update(memory);
    }
  }

  /**
   * 統計情報の取得
   */
  async getStatistics(): Promise<{
    totalMemories: number;
    averageAccessCount: number;
    averageSuccessRate: number;
    mostAccessedMemories: Memory[];
    recentMemories: Memory[];
  }> {
    const allMemories = await this.sqliteClient.getAll();
    
    if (allMemories.length === 0) {
      return {
        totalMemories: 0,
        averageAccessCount: 0,
        averageSuccessRate: 0,
        mostAccessedMemories: [],
        recentMemories: []
      };
    }
    
    const totalAccess = allMemories.reduce(
      (sum, m) => sum + m.metadata.access_count,
      0
    );
    const totalSuccess = allMemories.reduce(
      (sum, m) => sum + m.metadata.success_rate,
      0
    );
    
    // アクセス数でソート
    const sortedByAccess = [...allMemories].sort(
      (a, b) => b.metadata.access_count - a.metadata.access_count
    );
    
    // 作成日時でソート
    const sortedByDate = [...allMemories].sort(
      (a, b) => b.metadata.created_at.getTime() - a.metadata.created_at.getTime()
    );
    
    return {
      totalMemories: allMemories.length,
      averageAccessCount: totalAccess / allMemories.length,
      averageSuccessRate: totalSuccess / allMemories.length,
      mostAccessedMemories: sortedByAccess.slice(0, 5),
      recentMemories: sortedByDate.slice(0, 5)
    };
  }

  /**
   * 記憶の重要度ランキング
   */
  async getImportantMemories(limit: number = 10): Promise<Memory[]> {
    const allMemories = await this.sqliteClient.getAll();
    
    const rankedMemories = allMemories.map(memory => ({
      memory,
      importance: this.synapticNetwork.getImportance(memory.id)
    }));
    
    rankedMemories.sort((a, b) => b.importance - a.importance);
    
    return rankedMemories.slice(0, limit).map(r => r.memory);
  }

  /**
   * 自動減衰の開始
   */
  private startAutoDecay(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
    }
    
    this.decayTimer = setInterval(async () => {
      await this.synapticNetwork.decay();
      console.log('Memory decay applied');
    }, this.config.decayInterval);
  }

  /**
   * クリーンアップ
   */
  /**
   * シナプス記憶ネットワークへのアクセス
   */
  getSynapticNetwork(): SynapticMemoryNetwork {
    return this.synapticNetwork;
  }
  
  async cleanup(): Promise<void> {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
    }
  }

  /**
   * 文字列の類似度計算（簡易版）
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const s1 = str1.toLowerCase();
    const s2 = str2.toLowerCase();
    
    if (s1 === s2) return 1.0;
    
    // Levenshtein距離の簡易版
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 1.0;
    
    let matches = 0;
    const minLen = Math.min(s1.length, s2.length);
    
    for (let i = 0; i < minLen; i++) {
      if (s1[i] === s2[i]) matches++;
    }
    
    return matches / maxLen;
  }
}

// エクスポート
export { Memory, SqliteMemoryClient } from './sqlite/SqliteMemoryClient.js';
export { SynapticMemoryNetwork, SynapticConnection, MemoryNode } from './synaptic/synapticNetwork.js';
export { MemoryAPI, getMemoryAPI, MemoryEvent, MemoryAPIConfig } from './api/memoryApi.js';

// 決定ログシステムのエクスポート
export { DecisionLog, ActionType, ResultType } from './decision-log/index.js';
export type {
  Action,
  Reason,
  Decision,
  WhyChain,
  Pattern,
  Session as DecisionSession,
  SearchOptions as DecisionSearchOptions,
  SearchResult as DecisionSearchResult,
  PatternDetectionOptions,
  Statistics as DecisionStatistics
} from './decision-log/index.js';
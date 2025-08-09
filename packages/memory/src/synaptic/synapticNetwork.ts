/**
 * シナプス結合ネットワーク
 * 人間の脳のシナプス結合を模倣し、記憶間の関連性を管理
 */

import { Memory, ChromaMemoryClient } from '../chroma/chromaClient.js';

export interface SynapticConnection {
  from: string;  // 記憶ID
  to: string;    // 記憶ID
  strength: number;  // 0.0 ~ 1.0
  lastActivated: Date;
  coActivationCount: number;  // 共起回数
}

export interface AccessPattern {
  sequence: string[];  // 記憶IDの順序
  contextHash: string;  // 文脈のハッシュ
  frequency: number;    // パターンの頻度
  lastUsed: Date;       // 最終使用時刻
  successRate: number;  // パターンの成功率
}

export interface ContextMemoryMapping {
  contextSignature: string;  // 文脈の特徴量
  preferredMemories: Map<string, number>;  // 記憶ID -> 使用頻度
  temporalPatterns: AccessPattern[];       // 時系列パターン
}

export interface SynapticNetworkConfig {
  // 基本パラメータ
  ltpThreshold?: number;          // 長期増強の閾値 (0.0-1.0)
  ltdThreshold?: number;          // 長期抑制の閾値 (0.0-1.0)
  homeostaticTarget?: number;     // ホメオスタシスの目標活性化レベル (0.0-1.0)
  competitiveStrength?: number;   // 競合学習の強度 (0.0-1.0)
  
  // 伝播パラメータ
  maxPropagationDepth?: number;   // 最大伝播深度 (1-5)
  propagationDecay?: number;      // 伝播減衰率 (0.1-0.9)
  
  // 学習パラメータ
  maxHistorySize?: number;        // アクセス履歴の最大サイズ
  patternLearningEnabled?: boolean; // パターン学習の有効/無効
  
  // 記憶管理パラメータ
  maxPatternsPerContext?: number;  // 文脈あたりの最大パターン数
  memoryMaintenanceInterval?: number; // 記憶整理の間隔（ミリ秒）
}

export interface MemoryNode {
  memory: Memory;
  activationLevel: number;  // 現在の活性化レベル (0.0 ~ 1.0)
  incomingConnections: SynapticConnection[];
  outgoingConnections: SynapticConnection[];
}

export class SynapticMemoryNetwork {
  private nodes: Map<string, MemoryNode> = new Map();
  private synapses: Map<string, SynapticConnection> = new Map();
  private chromaClient: ChromaMemoryClient;
  private recentlyActivated: Set<string> = new Set();
  
  // アクセスパターン学習
  private accessHistory: string[] = []; // 最近のアクセス履歴
  private contextMappings: Map<string, ContextMemoryMapping> = new Map();
  private accessPatterns: Map<string, AccessPattern> = new Map();
  private currentContext: string = ''; // 現在の文脈
  private maxHistorySize: number = 1000;

  // ヘブ則パラメータ
  private readonly HEBBIAN_LEARNING_RATE = 0.1;  // 学習率
  private readonly DECAY_RATE = 0.99;  // 時間減衰率
  private readonly ACTIVATION_THRESHOLD = 0.3;  // 活性化閾値
  
  // 動的調整パラメータ（カスタマイズ可能）
  private LTP_THRESHOLD = 0.7;  // 長期増強の閾値
  private LTD_THRESHOLD = 0.2;  // 長期抑制の閾値
  private HOMEOSTATIC_TARGET = 0.5;  // ホメオスタシスの目標活性化レベル
  private COMPETITIVE_STRENGTH = 0.3;  // 競合学習の強度
  private MAX_PROPAGATION_DEPTH = 3; // 最大伝播深度
  private PROPAGATION_DECAY = 0.7; // 伝播減衰率

  constructor(chromaClient: ChromaMemoryClient) {
    this.chromaClient = chromaClient;
  }

  /**
   * ネットワークの初期化
   */
  async initialize(): Promise<void> {
    // ChromaDBからすべての記憶を読み込み
    const memories = await this.chromaClient.getAll();
    
    for (const memory of memories) {
      const node: MemoryNode = {
        memory,
        activationLevel: 0,
        incomingConnections: [],
        outgoingConnections: []
      };
      this.nodes.set(memory.id, node);

      // シナプス結合情報を復元
      if (memory.metadata.connections) {
        for (const conn of memory.metadata.connections) {
          const connectionId = this.getConnectionId(memory.id, conn.targetId);
          const synapse: SynapticConnection = {
            from: memory.id,
            to: conn.targetId,
            strength: conn.strength,
            lastActivated: new Date(),
            coActivationCount: conn.coActivationCount
          };
          this.synapses.set(connectionId, synapse);
        }
      }
    }

    // ノード間の結合を設定
    this.updateNodeConnections();
  }

  /**
   * 記憶の活性化（連想記憶の実現）
   */
  async activate(
    memoryId: string, 
    propagate: boolean = true, 
    depth: number = 0, 
    initialActivation: number = 1.0
  ): Promise<void> {
    const node = this.nodes.get(memoryId);
    if (!node || depth > 3) return; // 最大3段階まで伝播

    // 活性化レベルを設定（深度に応じて減衰）
    const activationStrength = initialActivation * Math.pow(0.7, depth);
    node.activationLevel = Math.min(1.0, node.activationLevel + activationStrength);
    
    // 閾値を超えた場合のみ「活性化済み」として記録
    if (node.activationLevel > this.ACTIVATION_THRESHOLD) {
      this.recentlyActivated.add(memoryId);
    }

    // 記憶のアクセス情報を更新（初回活性化のみ）
    if (depth === 0) {
      node.memory.metadata.access_count++;
      node.memory.metadata.last_accessed = new Date();
      await this.chromaClient.update(node.memory);
    }

    if (propagate && node.activationLevel > this.ACTIVATION_THRESHOLD) {
      // 段階的活性化伝播
      await this.propagateActivation(memoryId, depth + 1);
    }
  }

  /**
   * 段階的活性化伝播アルゴリズム
   */
  private async propagateActivation(memoryId: string, depth: number): Promise<void> {
    const node = this.nodes.get(memoryId);
    if (!node || depth > 3) return;

    // 伝播候補を収集（強度でソート）
    const propagationCandidates = node.outgoingConnections
      .filter(conn => conn.strength > 0.1) // 弱い結合は無視
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 5); // 上位5つまで

    // 並列で活性化を伝播
    await Promise.all(
      propagationCandidates.map(async (conn) => {
        const targetNode = this.nodes.get(conn.to);
        if (!targetNode) return;

        // 活性化強度を計算（距離減衰 + シナプス強度）
        const baseActivation = node.activationLevel * conn.strength;
        const distanceDecay = Math.pow(0.6, depth);
        const finalActivation = baseActivation * distanceDecay;

        // 閾値チェックとさらなる伝播
        if (finalActivation > 0.1) {
          await this.activate(conn.to, true, depth, finalActivation);
          
          // 同時活性化でヘブ則適用
          this.applyHebbianLearning(memoryId, conn.to, finalActivation);
        }
      })
    );
  }

  /**
   * 強化されたヘブ則学習
   */
  private applyHebbianLearning(
    fromId: string, 
    toId: string, 
    activationStrength: number
  ): void {
    const fromNode = this.nodes.get(fromId);
    const toNode = this.nodes.get(toId);
    
    if (!fromNode || !toNode) return;

    // 両方のノードが活性化している場合のみ学習
    if (fromNode.activationLevel > 0.2 && toNode.activationLevel > 0.2) {
      const learningRate = this.HEBBIAN_LEARNING_RATE * activationStrength;
      this.strengthenConnectionWithRate(fromId, toId, learningRate);
    }
  }

  /**
   * シナプス結合の強化（ヘブ則）
   */
  private strengthenConnection(fromId: string, toId: string): void {
    this.strengthenConnectionWithRate(fromId, toId, this.HEBBIAN_LEARNING_RATE);
  }

  /**
   * カスタム学習率でのシナプス結合強化
   */
  private strengthenConnectionWithRate(
    fromId: string, 
    toId: string, 
    learningRate: number
  ): void {
    const connectionId = this.getConnectionId(fromId, toId);
    let synapse = this.synapses.get(connectionId);

    if (!synapse) {
      // 新しい結合を作成
      synapse = {
        from: fromId,
        to: toId,
        strength: learningRate,
        lastActivated: new Date(),
        coActivationCount: 1
      };
      this.synapses.set(connectionId, synapse);
    } else {
      // 既存の結合を強化（シグモイド関数で飽和を防ぐ）
      const currentStrength = synapse.strength;
      const strengthIncrement = learningRate * (1 - currentStrength); // 飽和減衰
      
      synapse.strength = Math.min(1.0, currentStrength + strengthIncrement);
      synapse.coActivationCount++;
      synapse.lastActivated = new Date();
    }

    // ノードの結合情報を更新
    this.updateNodeConnections();
  }

  /**
   * 時間経過による減衰（エビングハウス忘却曲線を考慮）
   */
  async decay(): Promise<void> {
    const now = new Date();
    
    // シナプス結合の時間減衰
    for (const [id, synapse] of this.synapses) {
      const timeSinceLastActivation = now.getTime() - synapse.lastActivated.getTime();
      const daysSinceActivation = timeSinceLastActivation / (1000 * 60 * 60 * 24);
      
      // エビングハウス忘却曲線: R = e^(-t/S)
      // S = 記憶強度に依存する定数
      const memoryStrength = synapse.coActivationCount / 10; // 共起回数ベース
      const retentionStrength = Math.max(0.1, memoryStrength);
      const forgettingRate = Math.exp(-daysSinceActivation / retentionStrength);
      
      // 基本減衰に忘却曲線を適用
      const baseDecay = this.DECAY_RATE;
      const adaptiveDecay = baseDecay * (1 - forgettingRate * 0.5); // 50%の影響
      
      synapse.strength *= adaptiveDecay;
      
      // 最小値の維持（完全な忘却を防ぐ）
      synapse.strength = Math.max(0.001, synapse.strength);
    }

    // ノード活性化レベルの段階的減衰
    await this.decayNodeActivation();
    
    this.recentlyActivated.clear();
  }

  /**
   * ノード活性化レベルの段階的減衰
   */
  private async decayNodeActivation(): Promise<void> {
    for (const [id, node] of this.nodes) {
      if (node.activationLevel > 0) {
        // 活性化レベルの段階的減衰（より自然な減衰）
        const currentLevel = node.activationLevel;
        
        // 高い活性化レベルは急速に減衰し、低いレベルはゆっくり減衰
        const decayFactor = currentLevel > 0.5 ? 0.3 : 0.8;
        node.activationLevel = Math.max(0, currentLevel * decayFactor);
        
        // アクセス頻度を考慮した記憶強化の更新
        await this.updateMemoryStrength(node);
      }
    }
  }

  /**
   * 記憶強度の動的更新
   */
  private async updateMemoryStrength(node: MemoryNode): Promise<void> {
    const memory = node.memory;
    const now = new Date();
    
    // 最後のアクセスからの経過時間
    const lastAccessed = memory.metadata.last_accessed || now;
    const timeSinceAccess = now.getTime() - lastAccessed.getTime();
    const daysSinceAccess = timeSinceAccess / (1000 * 60 * 60 * 24);
    
    // 記憶強度の計算（アクセス頻度 × 成功率 × 時間減衰）
    const accessFrequency = memory.metadata.access_count || 1;
    const successRate = memory.metadata.success_rate || 0.5;
    const timeDecay = Math.exp(-daysSinceAccess / 30); // 30日の半減期
    
    const memoryStrength = Math.min(1.0, 
      (accessFrequency / 100) * successRate * timeDecay
    );
    
    // 記憶強度をメタデータに保存
    memory.metadata.memory_strength = memoryStrength;
    
    // 弱い記憶は長期記憶から作業記憶への移行を遅らせる
    if (memoryStrength < 0.1) {
      node.activationLevel *= 0.5;
    }
  }

  /**
   * 定期的な記憶整理（ガベージコレクション相当）
   */
  async performMemoryMaintenance(): Promise<void> {
    // 非常に弱い結合の整理
    const weakConnections: string[] = [];
    
    for (const [id, synapse] of this.synapses) {
      // 長期間使われていない弱い結合を特定
      const timeSinceActivation = Date.now() - synapse.lastActivated.getTime();
      const isOld = timeSinceActivation > 30 * 24 * 60 * 60 * 1000; // 30日以上
      const isWeak = synapse.strength < 0.01;
      const isUnused = synapse.coActivationCount < 3;
      
      if (isOld && isWeak && isUnused) {
        weakConnections.push(id);
      }
    }
    
    // 弱い結合を削除（但し最小限度は保持）
    for (const connId of weakConnections) {
      const synapse = this.synapses.get(connId);
      if (synapse) {
        synapse.strength = 0.001; // 完全削除せず、痕跡を残す
      }
    }
    
    console.log(`Memory maintenance: processed ${weakConnections.length} weak connections`);
  }

  /**
   * 高度な関連記憶自動取得システム
   */
  async getAssociatedMemories(
    primaryMemoryId: string,
    options: {
      maxDepth?: number;
      maxResults?: number;
      includeSemanticSimilarity?: boolean;
      includeTemporalRelations?: boolean;
      minRelevanceScore?: number;
    } = {}
  ): Promise<Memory[]> {
    const {
      maxDepth = 2,
      maxResults = 10,
      includeSemanticSimilarity = true,
      includeTemporalRelations = true,
      minRelevanceScore = 0.1
    } = options;

    // 主記憶を活性化
    await this.activate(primaryMemoryId, true);
    
    const associatedMemories = new Map<string, {
      memory: Memory;
      relevanceScore: number;
      associationType: 'synaptic' | 'semantic' | 'temporal' | 'hybrid';
    }>();

    // 1. シナプス結合による関連記憶
    await this.collectSynapticAssociations(primaryMemoryId, associatedMemories, maxDepth);

    // 2. セマンティックな関連記憶
    if (includeSemanticSimilarity) {
      await this.collectSemanticAssociations(primaryMemoryId, associatedMemories);
    }

    // 3. 時系列に基づく関連記憶
    if (includeTemporalRelations) {
      await this.collectTemporalAssociations(primaryMemoryId, associatedMemories);
    }

    // 4. スコアでソートしてフィルタリング
    const sortedResults = Array.from(associatedMemories.values())
      .filter(item => item.relevanceScore >= minRelevanceScore)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, maxResults);

    return sortedResults.map(item => item.memory);
  }

  /**
   * シナプス結合による関連記憶収集
   */
  private async collectSynapticAssociations(
    memoryId: string,
    results: Map<string, any>,
    maxDepth: number,
    currentDepth: number = 0
  ): Promise<void> {
    if (currentDepth >= maxDepth) return;

    const node = this.nodes.get(memoryId);
    if (!node) return;

    // 出力結合からの関連記憶
    for (const conn of node.outgoingConnections) {
      if (!results.has(conn.to) && conn.strength > 0.1) {
        const targetNode = this.nodes.get(conn.to);
        if (targetNode) {
          const relevanceScore = conn.strength * Math.pow(0.8, currentDepth);
          results.set(conn.to, {
            memory: targetNode.memory,
            relevanceScore,
            associationType: 'synaptic'
          });

          // 再帰的に関連記憶を収集
          await this.collectSynapticAssociations(conn.to, results, maxDepth, currentDepth + 1);
        }
      }
    }

    // 入力結合からの関連記憶
    for (const conn of node.incomingConnections) {
      if (!results.has(conn.from) && conn.strength > 0.1) {
        const sourceNode = this.nodes.get(conn.from);
        if (sourceNode) {
          const relevanceScore = conn.strength * Math.pow(0.8, currentDepth);
          results.set(conn.from, {
            memory: sourceNode.memory,
            relevanceScore,
            associationType: 'synaptic'
          });
        }
      }
    }
  }

  /**
   * セマンティックな関連記憶収集
   */
  private async collectSemanticAssociations(
    memoryId: string,
    results: Map<string, any>
  ): Promise<void> {
    const primaryNode = this.nodes.get(memoryId);
    if (!primaryNode) return;

    // 主記憶の内容でベクトル検索
    const searchQuery = this.extractSearchQuery(primaryNode.memory);
    const semanticResults = await this.chromaClient.search(searchQuery, 15);

    for (const memory of semanticResults) {
      if (!results.has(memory.id) && memory.id !== memoryId) {
        // セマンティック類似性スコアを計算
        const semanticScore = await this.calculateSemanticSimilarity(
          primaryNode.memory, 
          memory
        );
        
        results.set(memory.id, {
          memory,
          relevanceScore: semanticScore,
          associationType: 'semantic'
        });
      }
    }
  }

  /**
   * 時系列に基づく関連記憶収集
   */
  private async collectTemporalAssociations(
    memoryId: string,
    results: Map<string, any>
  ): Promise<void> {
    const primaryNode = this.nodes.get(memoryId);
    if (!primaryNode) return;

    const primaryTime = new Date(primaryNode.memory.metadata.created || Date.now());

    // 時系列的に近い記憶を探す（前後2時間以内）
    const timeWindow = 2 * 60 * 60 * 1000; // 2時間
    
    for (const [id, node] of this.nodes) {
      if (id === memoryId || results.has(id)) continue;

      const nodeTime = new Date(node.memory.metadata.created || Date.now());
      const timeDiff = Math.abs(primaryTime.getTime() - nodeTime.getTime());

      if (timeDiff <= timeWindow) {
        const temporalScore = 1 - (timeDiff / timeWindow);
        const existingResult = results.get(id);
        
        if (!existingResult) {
          results.set(id, {
            memory: node.memory,
            relevanceScore: temporalScore * 0.3, // 時系列関連は重み小
            associationType: 'temporal'
          });
        } else {
          // 既存の関連性と組み合わせ
          existingResult.relevanceScore += temporalScore * 0.2;
          existingResult.associationType = 'hybrid';
        }
      }
    }
  }

  /**
   * 文脈依存検索（改良版）
   */
  async contextualSearch(
    query: string,
    context: string[] = []
  ): Promise<Memory[]> {
    // 基本検索結果
    const searchResults = await this.chromaClient.search(query);
    
    // 文脈記憶を活性化
    const contextMemoryIds: string[] = [];
    for (const contextItem of context) {
      const contextMemories = await this.chromaClient.search(contextItem, 5);
      for (const memory of contextMemories) {
        await this.activate(memory.id, true);
        contextMemoryIds.push(memory.id);
      }
    }

    // 各検索結果について関連記憶を考慮したスコアリング
    const enhancedResults: Array<{memory: Memory; score: number}> = [];
    
    for (const memory of searchResults) {
      const node = this.nodes.get(memory.id);
      if (!node) {
        enhancedResults.push({ memory, score: 0.5 }); // 基本スコア
        continue;
      }

      // 複合スコア計算
      let score = 1.0; // 基本検索関連性

      // 活性化レベル
      score += node.activationLevel * 0.5;

      // 文脈との関連性
      for (const contextId of contextMemoryIds) {
        const connectionId = this.getConnectionId(contextId, memory.id);
        const synapse = this.synapses.get(connectionId);
        if (synapse) {
          score += synapse.strength * 0.3;
        }
      }

      // 記憶の品質指標
      score += (memory.metadata.success_rate || 0.5) * 0.4;
      score += Math.min(1.0, (memory.metadata.access_count || 1) / 20) * 0.2;

      // 時間的新鮮さ
      const daysSinceAccess = this.getDaysSince(memory.metadata.last_accessed);
      score += Math.exp(-daysSinceAccess / 7) * 0.1; // 週単位で減衰

      enhancedResults.push({ memory, score });
    }

    // スコアでソート
    enhancedResults.sort((a, b) => b.score - a.score);

    return enhancedResults.map(r => r.memory);
  }

  /**
   * 新しい記憶の追加
   */
  async addMemory(memory: Memory): Promise<void> {
    // ChromaDBに保存
    await this.chromaClient.store(memory);

    // ノードとして追加
    const node: MemoryNode = {
      memory,
      activationLevel: 0,
      incomingConnections: [],
      outgoingConnections: []
    };
    this.nodes.set(memory.id, node);

    // 現在活性化されている記憶と結合を作成
    for (const activeId of this.recentlyActivated) {
      this.strengthenConnection(activeId, memory.id);
    }
  }

  /**
   * 記憶の成功/失敗フィードバック
   */
  async updateOutcome(
    memoryId: string, 
    success: boolean
  ): Promise<void> {
    const node = this.nodes.get(memoryId);
    if (!node) return;

    // 成功率を更新
    const memory = node.memory;
    const totalUses = memory.metadata.access_count;
    const currentSuccessRate = memory.metadata.success_rate;
    const successCount = Math.round(currentSuccessRate * totalUses);
    
    memory.metadata.success_rate = (successCount + (success ? 1 : 0)) / (totalUses + 1);

    // 成功した場合は関連する結合を強化
    if (success) {
      for (const conn of node.incomingConnections) {
        if (this.recentlyActivated.has(conn.from)) {
          this.strengthenConnection(conn.from, memoryId);
        }
      }
    }

    await this.chromaClient.update(memory);
  }

  /**
   * 動的シナプス調整システム（LTP/LTD）
   */
  async performSynapticPlasticity(): Promise<void> {
    for (const [id, synapse] of this.synapses) {
      const fromNode = this.nodes.get(synapse.from);
      const toNode = this.nodes.get(synapse.to);
      
      if (!fromNode || !toNode) continue;

      // 長期増強（LTP）と長期抑制（LTD）の判定
      const preActivation = fromNode.activationLevel;
      const postActivation = toNode.activationLevel;
      
      if (preActivation > this.LTP_THRESHOLD && postActivation > this.LTP_THRESHOLD) {
        // 長期増強：両方のノードが高度に活性化
        await this.applyLTP(synapse);
      } else if (preActivation > this.ACTIVATION_THRESHOLD && postActivation < this.LTD_THRESHOLD) {
        // 長期抑制：前は活性化、後は低活性化
        await this.applyLTD(synapse);
      }
    }
  }

  /**
   * 長期増強（LTP）の適用
   */
  private async applyLTP(synapse: SynapticConnection): Promise<void> {
    // 結合強度を段階的に増加
    const strengthIncrement = 0.05 * (1 - synapse.strength); // 飽和を考慮
    synapse.strength = Math.min(0.95, synapse.strength + strengthIncrement);
    
    // メタプラスティシティ：過度の強化を防ぐ
    if (synapse.strength > 0.8) {
      synapse.strength *= 0.98; // 微細な抑制
    }
  }

  /**
   * 長期抑制（LTD）の適用
   */
  private async applyLTD(synapse: SynapticConnection): Promise<void> {
    // 結合強度を段階的に減少
    synapse.strength *= 0.95;
    synapse.strength = Math.max(0.001, synapse.strength);
  }

  /**
   * ホメオスタシス機能（神経活動の安定化）
   */
  async maintainHomeostasis(): Promise<void> {
    for (const [id, node] of this.nodes) {
      const currentActivation = node.activationLevel;
      const deviation = currentActivation - this.HOMEOSTATIC_TARGET;
      
      if (Math.abs(deviation) > 0.3) {
        // 活性化レベルが目標から大きく逸脱している場合
        await this.adjustConnectionStrengths(id, -deviation * 0.1);
      }
    }
  }

  /**
   * 競合学習の実装
   */
  async performCompetitiveLearning(contextMemories: string[]): Promise<void> {
    // 同じ文脈内の記憶間で競合
    for (let i = 0; i < contextMemories.length; i++) {
      for (let j = i + 1; j < contextMemories.length; j++) {
        const nodeA = this.nodes.get(contextMemories[i]);
        const nodeB = this.nodes.get(contextMemories[j]);
        
        if (!nodeA || !nodeB) continue;

        // より活性化された記憶が勝利
        const activationDiff = nodeA.activationLevel - nodeB.activationLevel;
        
        if (Math.abs(activationDiff) > 0.2) {
          const winner = activationDiff > 0 ? nodeA : nodeB;
          const loser = activationDiff > 0 ? nodeB : nodeA;
          
          // 勝者の入力結合を強化、敗者を抑制
          await this.reinforceWinner(winner.memory.id);
          await this.suppressLoser(loser.memory.id);
        }
      }
    }
  }

  /**
   * 勝者記憶の結合強化
   */
  private async reinforceWinner(memoryId: string): Promise<void> {
    const node = this.nodes.get(memoryId);
    if (!node) return;

    for (const conn of node.incomingConnections) {
      conn.strength = Math.min(0.95, conn.strength * (1 + this.COMPETITIVE_STRENGTH));
    }
  }

  /**
   * 敗者記憶の結合抑制
   */
  private async suppressLoser(memoryId: string): Promise<void> {
    const node = this.nodes.get(memoryId);
    if (!node) return;

    for (const conn of node.incomingConnections) {
      conn.strength = Math.max(0.01, conn.strength * (1 - this.COMPETITIVE_STRENGTH * 0.5));
    }
  }

  /**
   * 文脈依存的結合調整
   */
  async adjustContextualConnections(
    primaryMemoryId: string, 
    contextMemories: string[],
    successRate: number
  ): Promise<void> {
    const primaryNode = this.nodes.get(primaryMemoryId);
    if (!primaryNode) return;

    for (const contextId of contextMemories) {
      const contextNode = this.nodes.get(contextId);
      if (!contextNode) continue;

      // 成功率に基づく調整
      const adjustmentFactor = successRate > 0.7 ? 1.1 : 0.9;
      
      // 文脈記憶からプライマリ記憶への結合を調整
      const connectionId = this.getConnectionId(contextId, primaryMemoryId);
      const synapse = this.synapses.get(connectionId);
      
      if (synapse) {
        synapse.strength = Math.min(0.95, 
          Math.max(0.01, synapse.strength * adjustmentFactor)
        );
      } else if (successRate > 0.6) {
        // 成功率が高い場合は新しい結合を作成
        this.strengthenConnectionWithRate(contextId, primaryMemoryId, 0.2);
      }
    }
  }

  /**
   * 結合強度の一括調整
   */
  private async adjustConnectionStrengths(
    nodeId: string, 
    adjustment: number
  ): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    // 入力結合の調整
    for (const conn of node.incomingConnections) {
      conn.strength = Math.min(0.95, 
        Math.max(0.01, conn.strength * (1 + adjustment))
      );
    }

    // 出力結合の調整
    for (const conn of node.outgoingConnections) {
      conn.strength = Math.min(0.95, 
        Math.max(0.01, conn.strength * (1 + adjustment))
      );
    }
  }

  /**
   * 記憶へのアクセシビリティ（想起しやすさ）を計算
   */
  getAccessibility(memoryId: string): number {
    const node = this.nodes.get(memoryId);
    if (!node) return 0;

    // 入力シナプスの強度の合計
    return node.incomingConnections.reduce(
      (sum, conn) => sum + conn.strength,
      0
    );
  }

  /**
   * 記憶の重要度を計算
   */
  getImportance(memoryId: string): number {
    const node = this.nodes.get(memoryId);
    if (!node) return 0;

    // 接続数と強度の組み合わせ
    const connectionCount = node.incomingConnections.length + node.outgoingConnections.length;
    const avgStrength = this.getAccessibility(memoryId) / Math.max(1, node.incomingConnections.length);
    
    return connectionCount * avgStrength * node.memory.metadata.success_rate;
  }

  /**
   * ヘルパー関数
   */
  private getConnectionId(from: string, to: string): string {
    return `${from}->${to}`;
  }

  /**
   * 記憶からの検索クエリ抽出
   */
  private extractSearchQuery(memory: Memory): string {
    // 記憶の内容から重要なキーワードを抽出
    let query = '';
    
    if (typeof memory.content === 'string') {
      query = memory.content;
    } else if (memory.content && typeof memory.content === 'object') {
      // 構造化データの場合
      const content = memory.content as any;
      if (content.title) query += content.title + ' ';
      if (content.error) query += content.error + ' ';
      if (content.solution) query += content.solution + ' ';
      if (content.description) query += content.description + ' ';
    }
    
    // 最初の200文字まで
    return query.substring(0, 200).trim();
  }

  /**
   * セマンティック類似性スコアの計算
   */
  private async calculateSemanticSimilarity(
    memory1: Memory, 
    memory2: Memory
  ): Promise<number> {
    // 簡易的な類似性計算（実際にはベクトル距離を使用すべき）
    const text1 = this.extractSearchQuery(memory1).toLowerCase();
    const text2 = this.extractSearchQuery(memory2).toLowerCase();
    
    // 共通キーワード数による類似性（簡易版）
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    // Jaccard類似性
    const jaccardSimilarity = intersection.size / Math.max(union.size, 1);
    
    // メタデータベースの類似性も考慮
    let metadataSimilarity = 0;
    if (memory1.metadata.type && memory2.metadata.type) {
      metadataSimilarity = memory1.metadata.type === memory2.metadata.type ? 0.2 : 0;
    }
    
    return Math.min(1.0, jaccardSimilarity + metadataSimilarity);
  }

  /**
   * 日付からの経過日数を計算
   */
  private getDaysSince(date?: Date | string): number {
    if (!date) return 0;
    
    const targetDate = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - targetDate.getTime());
    
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  private updateNodeConnections(): void {
    // すべてのノードの結合リストをクリア
    for (const node of this.nodes.values()) {
      node.incomingConnections = [];
      node.outgoingConnections = [];
    }

    // シナプスからノードの結合を再構築
    for (const synapse of this.synapses.values()) {
      const fromNode = this.nodes.get(synapse.from);
      const toNode = this.nodes.get(synapse.to);

      if (fromNode) {
        fromNode.outgoingConnections.push(synapse);
      }
      if (toNode) {
        toNode.incomingConnections.push(synapse);
      }
    }
  }

  /**
   * アクセスパターン学習システム
   */

  /**
   * 記憶アクセスの記録
   */
  recordMemoryAccess(memoryId: string, context: string[] = []): void {
    // アクセス履歴に追加
    this.accessHistory.push(memoryId);
    
    // 履歴サイズの制限
    if (this.accessHistory.length > this.maxHistorySize) {
      this.accessHistory.shift();
    }

    // 文脈の設定
    this.updateCurrentContext(context);

    // アクセスパターンの学習
    this.learnAccessPattern(memoryId);
    this.learnContextMapping(memoryId);
  }

  /**
   * 現在の文脈を更新
   */
  private updateCurrentContext(context: string[]): void {
    // 文脈をハッシュ化
    this.currentContext = this.hashContext(context);
  }

  /**
   * アクセスパターンの学習
   */
  private learnAccessPattern(currentMemoryId: string): void {
    if (this.accessHistory.length < 2) return;

    // 最近の3つのアクセスシーケンスを抽出
    const sequenceLength = Math.min(3, this.accessHistory.length);
    const sequence = this.accessHistory.slice(-sequenceLength);
    
    // パターンをハッシュ化
    const patternHash = this.hashSequence(sequence);
    
    let pattern = this.accessPatterns.get(patternHash);
    if (!pattern) {
      pattern = {
        sequence: [...sequence],
        contextHash: this.currentContext,
        frequency: 1,
        lastUsed: new Date(),
        successRate: 1.0
      };
      this.accessPatterns.set(patternHash, pattern);
    } else {
      pattern.frequency++;
      pattern.lastUsed = new Date();
      // 成功率の更新は別途記録される
    }
  }

  /**
   * 文脈→記憶マッピングの学習
   */
  private learnContextMapping(memoryId: string): void {
    if (!this.currentContext) return;

    let mapping = this.contextMappings.get(this.currentContext);
    if (!mapping) {
      mapping = {
        contextSignature: this.currentContext,
        preferredMemories: new Map(),
        temporalPatterns: []
      };
      this.contextMappings.set(this.currentContext, mapping);
    }

    // 記憶の使用頻度を更新
    const currentCount = mapping.preferredMemories.get(memoryId) || 0;
    mapping.preferredMemories.set(memoryId, currentCount + 1);

    // 時系列パターンの更新
    this.updateTemporalPatterns(mapping, memoryId);
  }

  /**
   * 時系列パターンの更新
   */
  private updateTemporalPatterns(
    mapping: ContextMemoryMapping, 
    memoryId: string
  ): void {
    if (this.accessHistory.length < 2) return;

    const recentSequence = this.accessHistory.slice(-3);
    const patternHash = this.hashSequence(recentSequence);
    
    let existingPattern = mapping.temporalPatterns.find(p => 
      this.hashSequence(p.sequence) === patternHash
    );

    if (existingPattern) {
      existingPattern.frequency++;
      existingPattern.lastUsed = new Date();
    } else {
      const newPattern: AccessPattern = {
        sequence: [...recentSequence],
        contextHash: this.currentContext,
        frequency: 1,
        lastUsed: new Date(),
        successRate: 1.0
      };
      mapping.temporalPatterns.push(newPattern);
    }

    // 古いパターンの削除（最大20パターン）
    if (mapping.temporalPatterns.length > 20) {
      mapping.temporalPatterns.sort((a, b) => 
        (b.frequency * b.successRate) - (a.frequency * a.successRate)
      );
      mapping.temporalPatterns = mapping.temporalPatterns.slice(0, 20);
    }
  }

  /**
   * 予測的記憶取得
   */
  async predictNextMemories(
    context: string[] = [],
    limit: number = 5
  ): Promise<Memory[]> {
    const contextHash = this.hashContext(context);
    const predictions: Array<{
      memory: Memory;
      confidence: number;
      predictionType: 'pattern' | 'context' | 'sequence';
    }> = [];

    // 1. パターンベースの予測
    await this.addPatternPredictions(predictions, contextHash);

    // 2. 文脈ベースの予測
    await this.addContextPredictions(predictions, contextHash);

    // 3. シーケンスベースの予測
    await this.addSequencePredictions(predictions);

    // 信頼度でソートして返す
    predictions.sort((a, b) => b.confidence - a.confidence);
    
    return predictions
      .slice(0, limit)
      .map(pred => pred.memory);
  }

  /**
   * パターンベースの予測を追加
   */
  private async addPatternPredictions(
    predictions: any[],
    contextHash: string
  ): Promise<void> {
    // 現在のアクセス履歴と類似したパターンを検索
    const recentSequence = this.accessHistory.slice(-2);
    
    for (const [hash, pattern] of this.accessPatterns) {
      if (pattern.contextHash === contextHash) {
        // パターンの一致度を計算
        const similarity = this.calculateSequenceSimilarity(
          recentSequence, 
          pattern.sequence.slice(0, -1)
        );
        
        if (similarity > 0.5) {
          const nextMemoryId = pattern.sequence[pattern.sequence.length - 1];
          const node = this.nodes.get(nextMemoryId);
          
          if (node) {
            const confidence = similarity * pattern.successRate * 
              Math.log(pattern.frequency + 1) / 10;
            
            predictions.push({
              memory: node.memory,
              confidence,
              predictionType: 'pattern'
            });
          }
        }
      }
    }
  }

  /**
   * 文脈ベースの予測を追加
   */
  private async addContextPredictions(
    predictions: any[],
    contextHash: string
  ): Promise<void> {
    const mapping = this.contextMappings.get(contextHash);
    if (!mapping) return;

    // 頻度の高い記憶を予測
    const sortedMemories = Array.from(mapping.preferredMemories.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10);

    for (const [memoryId, frequency] of sortedMemories) {
      const node = this.nodes.get(memoryId);
      if (node && !predictions.find(p => p.memory.id === memoryId)) {
        const confidence = Math.min(0.8, frequency / 20);
        
        predictions.push({
          memory: node.memory,
          confidence,
          predictionType: 'context'
        });
      }
    }
  }

  /**
   * シーケンスベースの予測を追加
   */
  private async addSequencePredictions(predictions: any[]): Promise<void> {
    if (this.accessHistory.length === 0) return;

    const lastMemoryId = this.accessHistory[this.accessHistory.length - 1];
    const node = this.nodes.get(lastMemoryId);
    
    if (node) {
      // 強い出力結合を持つ記憶を予測
      const strongConnections = node.outgoingConnections
        .filter(conn => conn.strength > 0.3)
        .sort((a, b) => b.strength - a.strength)
        .slice(0, 5);

      for (const conn of strongConnections) {
        const targetNode = this.nodes.get(conn.to);
        if (targetNode && !predictions.find(p => p.memory.id === conn.to)) {
          predictions.push({
            memory: targetNode.memory,
            confidence: conn.strength * 0.6,
            predictionType: 'sequence'
          });
        }
      }
    }
  }

  /**
   * ヘルパーメソッド
   */
  private hashContext(context: string[]): string {
    return context.sort().join('|');
  }

  private hashSequence(sequence: string[]): string {
    return sequence.join('-');
  }

  private calculateSequenceSimilarity(seq1: string[], seq2: string[]): number {
    if (seq1.length === 0 || seq2.length === 0) return 0;
    
    const minLength = Math.min(seq1.length, seq2.length);
    let matches = 0;
    
    for (let i = 0; i < minLength; i++) {
      if (seq1[seq1.length - 1 - i] === seq2[seq2.length - 1 - i]) {
        matches++;
      } else {
        break; // 連続した一致のみカウント
      }
    }
    
    return matches / Math.max(seq1.length, seq2.length);
  }

  /**
   * アクセスパターンの成功率を更新
   */
  updatePatternSuccess(sequence: string[], success: boolean): void {
    const patternHash = this.hashSequence(sequence);
    const pattern = this.accessPatterns.get(patternHash);
    
    if (pattern) {
      // 移動平均で成功率を更新
      const alpha = 0.1; // 学習率
      pattern.successRate = pattern.successRate * (1 - alpha) + 
        (success ? 1 : 0) * alpha;
    }
  }

  /**
   * 学習統計の取得
   */
  getLearningStatistics(): {
    totalPatterns: number;
    totalContextMappings: number;
    averagePatternFrequency: number;
    mostFrequentContext: string;
    accessHistorySize: number;
  } {
    const patterns = Array.from(this.accessPatterns.values());
    const avgFrequency = patterns.length > 0 ? 
      patterns.reduce((sum, p) => sum + p.frequency, 0) / patterns.length : 0;
    
    let mostFrequentContext = '';
    let maxMappings = 0;
    
    for (const [context, mapping] of this.contextMappings) {
      if (mapping.preferredMemories.size > maxMappings) {
        maxMappings = mapping.preferredMemories.size;
        mostFrequentContext = context;
      }
    }

    return {
      totalPatterns: this.accessPatterns.size,
      totalContextMappings: this.contextMappings.size,
      averagePatternFrequency: avgFrequency,
      mostFrequentContext,
      accessHistorySize: this.accessHistory.length
    };
  }

  /**
   * シナプスネットワーク設定のカスタマイズ
   */

  /**
   * ネットワーク設定を更新
   */
  updateConfiguration(config: SynapticNetworkConfig): void {
    // バリデーション付きで設定を更新
    if (config.ltpThreshold !== undefined) {
      this.LTP_THRESHOLD = Math.max(0, Math.min(1, config.ltpThreshold));
    }
    
    if (config.ltdThreshold !== undefined) {
      this.LTD_THRESHOLD = Math.max(0, Math.min(1, config.ltdThreshold));
    }
    
    if (config.homeostaticTarget !== undefined) {
      this.HOMEOSTATIC_TARGET = Math.max(0, Math.min(1, config.homeostaticTarget));
    }
    
    if (config.competitiveStrength !== undefined) {
      this.COMPETITIVE_STRENGTH = Math.max(0, Math.min(1, config.competitiveStrength));
    }
    
    if (config.maxPropagationDepth !== undefined) {
      this.MAX_PROPAGATION_DEPTH = Math.max(1, Math.min(5, config.maxPropagationDepth));
    }
    
    if (config.propagationDecay !== undefined) {
      this.PROPAGATION_DECAY = Math.max(0.1, Math.min(0.9, config.propagationDecay));
    }
    
    if (config.maxHistorySize !== undefined) {
      this.maxHistorySize = Math.max(100, config.maxHistorySize);
      
      // 履歴サイズを調整
      if (this.accessHistory.length > this.maxHistorySize) {
        this.accessHistory = this.accessHistory.slice(-this.maxHistorySize);
      }
    }
  }

  /**
   * 現在の設定を取得
   */
  getCurrentConfiguration(): SynapticNetworkConfig {
    return {
      ltpThreshold: this.LTP_THRESHOLD,
      ltdThreshold: this.LTD_THRESHOLD,
      homeostaticTarget: this.HOMEOSTATIC_TARGET,
      competitiveStrength: this.COMPETITIVE_STRENGTH,
      maxPropagationDepth: this.MAX_PROPAGATION_DEPTH,
      propagationDecay: this.PROPAGATION_DECAY,
      maxHistorySize: this.maxHistorySize,
      patternLearningEnabled: true, // 常に有効
      maxPatternsPerContext: 20,
      memoryMaintenanceInterval: 24 * 60 * 60 * 1000 // 24時間
    };
  }

  /**
   * プリセット設定を適用
   */
  applyPresetConfiguration(preset: 'conservative' | 'balanced' | 'aggressive' | 'experimental'): void {
    let config: SynapticNetworkConfig;
    
    switch (preset) {
      case 'conservative':
        config = {
          ltpThreshold: 0.8,
          ltdThreshold: 0.15,
          homeostaticTarget: 0.4,
          competitiveStrength: 0.2,
          maxPropagationDepth: 2,
          propagationDecay: 0.8
        };
        break;
        
      case 'balanced':
        config = {
          ltpThreshold: 0.7,
          ltdThreshold: 0.2,
          homeostaticTarget: 0.5,
          competitiveStrength: 0.3,
          maxPropagationDepth: 3,
          propagationDecay: 0.7
        };
        break;
        
      case 'aggressive':
        config = {
          ltpThreshold: 0.6,
          ltdThreshold: 0.25,
          homeostaticTarget: 0.6,
          competitiveStrength: 0.4,
          maxPropagationDepth: 4,
          propagationDecay: 0.6
        };
        break;
        
      case 'experimental':
        config = {
          ltpThreshold: 0.5,
          ltdThreshold: 0.3,
          homeostaticTarget: 0.7,
          competitiveStrength: 0.5,
          maxPropagationDepth: 5,
          propagationDecay: 0.5
        };
        break;
    }
    
    this.updateConfiguration(config);
  }

  /**
   * ネットワークの健康状態を診断
   */
  diagnoseNetworkHealth(): {
    overallHealth: 'excellent' | 'good' | 'moderate' | 'poor';
    issues: string[];
    suggestions: string[];
    metrics: {
      avgConnectionStrength: number;
      connectionDensity: number;
      activationDistribution: { low: number; medium: number; high: number };
      patternUtilization: number;
    };
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];
    
    // 接続強度の分析
    const allConnections = Array.from(this.synapses.values());
    const avgStrength = allConnections.length > 0 ? 
      allConnections.reduce((sum, conn) => sum + conn.strength, 0) / allConnections.length : 0;
    
    // 接続密度の計算
    const totalNodes = this.nodes.size;
    const possibleConnections = totalNodes * (totalNodes - 1);
    const connectionDensity = possibleConnections > 0 ? 
      allConnections.length / possibleConnections : 0;
    
    // 活性化分布の分析
    const activationLevels = Array.from(this.nodes.values()).map(n => n.activationLevel);
    const activationDistribution = {
      low: activationLevels.filter(a => a < 0.3).length / totalNodes,
      medium: activationLevels.filter(a => a >= 0.3 && a < 0.7).length / totalNodes,
      high: activationLevels.filter(a => a >= 0.7).length / totalNodes
    };
    
    // パターン利用率
    const totalPatterns = this.accessPatterns.size;
    const activePatterns = Array.from(this.accessPatterns.values())
      .filter(p => p.frequency > 1).length;
    const patternUtilization = totalPatterns > 0 ? activePatterns / totalPatterns : 0;
    
    // 問題の検出
    if (avgStrength < 0.1) {
      issues.push('平均接続強度が低すぎます');
      suggestions.push('学習率を上げるか、LTP閾値を下げてください');
    }
    
    if (connectionDensity > 0.8) {
      issues.push('接続密度が高すぎます');
      suggestions.push('競合学習を強化するか、記憶整理を実行してください');
    }
    
    if (activationDistribution.high > 0.7) {
      issues.push('過度に活性化されたノードが多すぎます');
      suggestions.push('ホメオスタシスの目標値を下げてください');
    }
    
    if (patternUtilization < 0.3) {
      issues.push('アクセスパターンの利用率が低いです');
      suggestions.push('パターン学習の閾値を下げることを検討してください');
    }
    
    // 総合健康度の判定
    let overallHealth: 'excellent' | 'good' | 'moderate' | 'poor';
    const healthScore = (avgStrength * 0.3) + (connectionDensity * 0.2) + 
                       (1 - activationDistribution.high * 0.3) + (patternUtilization * 0.2);
    
    if (healthScore > 0.8) overallHealth = 'excellent';
    else if (healthScore > 0.6) overallHealth = 'good';
    else if (healthScore > 0.4) overallHealth = 'moderate';
    else overallHealth = 'poor';
    
    return {
      overallHealth,
      issues,
      suggestions,
      metrics: {
        avgConnectionStrength: avgStrength,
        connectionDensity,
        activationDistribution,
        patternUtilization
      }
    };
  }
}
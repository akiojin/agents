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

  // ヘブ則パラメータ
  private readonly HEBBIAN_LEARNING_RATE = 0.1;  // 学習率
  private readonly DECAY_RATE = 0.99;  // 時間減衰率
  private readonly ACTIVATION_THRESHOLD = 0.3;  // 活性化閾値

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
  async activate(memoryId: string, propagate: boolean = true): Promise<void> {
    const node = this.nodes.get(memoryId);
    if (!node) return;

    // この記憶を完全に活性化
    node.activationLevel = 1.0;
    this.recentlyActivated.add(memoryId);

    // 記憶のアクセス情報を更新
    node.memory.metadata.access_count++;
    node.memory.metadata.last_accessed = new Date();
    await this.chromaClient.update(node.memory);

    if (propagate) {
      // 接続された記憶も部分的に活性化（連想）
      for (const conn of node.outgoingConnections) {
        const targetNode = this.nodes.get(conn.to);
        if (targetNode) {
          // シナプス強度に応じて活性化を伝播
          const activation = conn.strength * 0.5;
          targetNode.activationLevel = Math.min(
            1.0, 
            targetNode.activationLevel + activation
          );

          // 閾値を超えたら再帰的に活性化
          if (targetNode.activationLevel > this.ACTIVATION_THRESHOLD) {
            await this.activate(conn.to, false);  // 無限ループを防ぐため、伝播は1段階のみ
          }

          // ヘブ則：同時に活性化した結合は強化
          this.strengthenConnection(memoryId, conn.to);
        }
      }
    }
  }

  /**
   * シナプス結合の強化（ヘブ則）
   */
  private strengthenConnection(fromId: string, toId: string): void {
    const connectionId = this.getConnectionId(fromId, toId);
    let synapse = this.synapses.get(connectionId);

    if (!synapse) {
      // 新しい結合を作成
      synapse = {
        from: fromId,
        to: toId,
        strength: this.HEBBIAN_LEARNING_RATE,
        lastActivated: new Date(),
        coActivationCount: 1
      };
      this.synapses.set(connectionId, synapse);
    } else {
      // 既存の結合を強化
      synapse.strength = Math.min(
        1.0, 
        synapse.strength * (1 + this.HEBBIAN_LEARNING_RATE)
      );
      synapse.coActivationCount++;
      synapse.lastActivated = new Date();
    }

    // ノードの結合情報を更新
    this.updateNodeConnections();
  }

  /**
   * 時間経過による減衰
   */
  async decay(): Promise<void> {
    // すべてのシナプス結合を減衰
    for (const [id, synapse] of this.synapses) {
      synapse.strength *= this.DECAY_RATE;
      
      // 極めて弱い結合は削除（でも完全には忘れない）
      if (synapse.strength < 0.001) {
        synapse.strength = 0.001;  // 最小値を保持
      }
    }

    // すべてのノードの活性化レベルをリセット
    for (const node of this.nodes.values()) {
      node.activationLevel = 0;
    }

    this.recentlyActivated.clear();
  }

  /**
   * 文脈依存検索
   */
  async contextualSearch(
    query: string,
    context: string[] = []
  ): Promise<Memory[]> {
    // まず通常の検索を実行
    const searchResults = await this.chromaClient.search(query);
    
    // 文脈に関連する記憶を活性化
    for (const contextItem of context) {
      const contextMemories = await this.chromaClient.search(contextItem, 5);
      for (const memory of contextMemories) {
        await this.activate(memory.id, true);
      }
    }

    // 検索結果をシナプス強度でスコアリング
    const scoredResults = searchResults.map(memory => {
      const node = this.nodes.get(memory.id);
      if (!node) return { memory, score: 0 };

      // 基本スコア（検索の関連性）
      let score = 1.0;

      // シナプス結合によるブースト
      for (const conn of node.incomingConnections) {
        if (this.recentlyActivated.has(conn.from)) {
          score += conn.strength;
        }
      }

      // 活性化レベルによるブースト
      score += node.activationLevel;

      // アクセス頻度と成功率によるブースト
      score += memory.metadata.access_count * 0.01;
      score += memory.metadata.success_rate * 0.5;

      return { memory, score };
    });

    // スコアでソート
    scoredResults.sort((a, b) => b.score - a.score);

    return scoredResults.map(r => r.memory);
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
}
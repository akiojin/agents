/**
 * ChromaDB クライアントラッパー
 * ベクトルDBとしてChromaDBを使用し、記憶の保存と検索を行う
 */

import { ChromaClient, Collection } from 'chromadb';
import * as process from 'process';

// Embedding型定義（ChromaDBから利用できない場合の手動定義）
type Embedding = number[];

export interface Memory {
  id: string;
  content: any;
  metadata: {
    created_at: Date;
    last_accessed: Date;
    access_count: number;
    success_rate: number;
    memory_strength?: number; // シナプス記憶強度
    type?: string; // 記憶タイプ（error, success, discoveryなど）
    human_rating?: 'useful' | 'neutral' | 'noise';
    tags: string[];
    // シナプス結合情報
    connections?: Array<{
      targetId: string;
      strength: number;
      coActivationCount: number;
    }>;
  };
}

export class ChromaMemoryClient {
  private client: ChromaClient;
  private collection: Collection | null = null;
  private collectionName: string;

  constructor(collectionName: string = 'agent_memories') {
    // ChromaDBサーバーへの接続設定
    // デフォルトはローカルのChromaDBサーバー
    const chromaHost = process.env.CHROMA_HOST || 'localhost';
    const chromaPort = process.env.CHROMA_PORT || '8000';
    
    this.client = new ChromaClient({
      path: `http://${chromaHost}:${chromaPort}`
    });
    this.collectionName = collectionName;
  }

  /**
   * 初期化：コレクションの作成または取得
   */
  async initialize(): Promise<void> {
    const maxRetries = 10;
    const retryDelay = 3000; // 3秒
    
    for (let i = 0; i < maxRetries; i++) {
      try {
        // 既存のコレクションを取得または新規作成
        this.collection = await this.client.getOrCreateCollection({
          name: this.collectionName,
          metadata: { 
            description: 'Agent memory storage with synaptic connections' 
          }
        });
        console.log(`ChromaDB collection '${this.collectionName}' initialized`);
        return; // 成功したら終了
      } catch (error) {
        console.error(`ChromaDB connection attempt ${i + 1}/${maxRetries} failed:`, error);
        
        if (i === maxRetries - 1) {
          // 最後の試行で失敗
          throw new Error('ChromaDB is required but not available. Please ensure ChromaDB server is running.');
        }
        
        console.log(`Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  /**
   * 記憶の保存
   */
  async store(memory: Memory): Promise<void> {
    if (!this.collection) {
      throw new Error('ChromaDB collection not initialized. Ensure ChromaDB server is running.');
    }

    const document = JSON.stringify(memory.content);
    const metadata = {
      ...memory.metadata,
      created_at: memory.metadata.created_at.toISOString(),
      last_accessed: memory.metadata.last_accessed.toISOString(),
      connections: JSON.stringify(memory.metadata.connections || [])
    };

    await this.collection.add({
      ids: [memory.id],
      documents: [document],
      metadatas: [metadata as any]
    });
  }

  /**
   * 記憶の検索（ベクトル類似度ベース）
   */
  async search(
    query: string, 
    limit: number = 10,
    filter?: Record<string, any>
  ): Promise<Memory[]> {
    if (!this.collection) {
      throw new Error('ChromaDB collection not initialized. Ensure ChromaDB server is running.');
    }

    const results = await this.collection.query({
      queryTexts: [query],
      nResults: limit,
      where: filter
    });

    if (!results.documents || results.documents.length === 0) {
      return [];
    }

    // 結果をMemory形式に変換
    const memories: Memory[] = [];
    const documents = results.documents[0];
    const metadatas = results.metadatas[0];
    const ids = results.ids[0];

    for (let i = 0; i < documents.length; i++) {
      if (documents[i] && metadatas[i] && ids[i]) {
        const metadata = metadatas[i] as any;
        memories.push({
          id: ids[i] as string,
          content: JSON.parse(documents[i] as string),
          metadata: {
            created_at: new Date(metadata.created_at),
            last_accessed: new Date(metadata.last_accessed),
            access_count: metadata.access_count,
            success_rate: metadata.success_rate,
            human_rating: metadata.human_rating,
            tags: metadata.tags || [],
            connections: metadata.connections ? JSON.parse(metadata.connections) : []
          }
        });
      }
    }

    return memories;
  }

  /**
   * 記憶の更新
   */
  async update(memory: Memory): Promise<void> {
    if (!this.collection) {
      throw new Error('ChromaDB collection not initialized. Ensure ChromaDB server is running.');
    }

    const document = JSON.stringify(memory.content);
    const metadata = {
      ...memory.metadata,
      created_at: memory.metadata.created_at.toISOString(),
      last_accessed: memory.metadata.last_accessed.toISOString(),
      connections: JSON.stringify(memory.metadata.connections || [])
    };

    await this.collection.update({
      ids: [memory.id],
      documents: [document],
      metadatas: [metadata as any]
    });
  }

  /**
   * IDによる記憶の取得
   */
  async get(id: string): Promise<Memory | null> {
    if (!this.collection) {
      throw new Error('ChromaDB collection not initialized. Ensure ChromaDB server is running.');
    }

    const result = await this.collection.get({
      ids: [id]
    });

    if (!result.documents || result.documents.length === 0) {
      return null;
    }

    const document = result.documents[0];
    const metadata = result.metadatas[0] as any;

    if (!document || !metadata) {
      return null;
    }

    return {
      id: id,
      content: JSON.parse(document as string),
      metadata: {
        created_at: new Date(metadata.created_at),
        last_accessed: new Date(metadata.last_accessed),
        access_count: metadata.access_count,
        success_rate: metadata.success_rate,
        human_rating: metadata.human_rating,
        tags: metadata.tags || [],
        connections: metadata.connections ? JSON.parse(metadata.connections) : []
      }
    };
  }

  /**
   * すべての記憶を取得
   */
  async getAll(): Promise<Memory[]> {
    if (!this.collection) {
      throw new Error('ChromaDB collection not initialized. Ensure ChromaDB server is running.');
    }

    const result = await this.collection.get();
    
    if (!result.documents || result.documents.length === 0) {
      return [];
    }

    const memories: Memory[] = [];
    for (let i = 0; i < result.documents.length; i++) {
      const document = result.documents[i];
      const metadata = result.metadatas[i] as any;
      const id = result.ids[i];

      if (document && metadata && id) {
        memories.push({
          id: id as string,
          content: JSON.parse(document as string),
          metadata: {
            created_at: new Date(metadata.created_at),
            last_accessed: new Date(metadata.last_accessed),
            access_count: metadata.access_count,
            success_rate: metadata.success_rate,
            human_rating: metadata.human_rating,
            tags: metadata.tags || [],
            connections: metadata.connections ? JSON.parse(metadata.connections) : []
          }
        });
      }
    }

    return memories;
  }
}
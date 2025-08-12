/**
 * Pure SQLite ベクトルメモリクライアント
 * ChromaDBの代替として、SQLite + 手動コサイン類似度で実装
 * シンプルさを最優先とし、依存関係を最小化
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';

/**
 * ChromaMemoryClientと互換性のあるメモリ形式
 */
export interface Memory {
  id: string;
  content: any;
  metadata: {
    created_at: Date;
    last_accessed: Date;
    access_count: number;
    success_rate: number;
    memory_strength?: number;
    type?: string;
    human_rating?: 'useful' | 'neutral' | 'noise';
    tags: string[];
    connections?: Array<{
      targetId: string;
      strength: number;
      coActivationCount: number;
    }>;
  };
}

/**
 * シナプス記憶ノード（ChromaMemoryClient互換）
 */
export interface SynapticMemoryNode {
  id: string;
  content: string;
  activationLevel: number;
  connections: Array<{
    targetId: string;
    strength: number;
    coActivationCount: number;
    lastCoActivated: Date;
  }>;
  contextSignature: string;
  lastActivated: Date;
  memoryType: 'episodic' | 'semantic' | 'procedural';
}

/**
 * SQLite + 手動ベクトル計算によるメモリクライアント
 * ChromaMemoryClientの機能をサーバーレスで実現
 */
export class SqliteMemoryClient {
  private db: Database.Database;
  private dbPath: string;
  
  // シナプス記憶システム（ChromaMemoryClient互換）
  private synapticNodes: Map<string, SynapticMemoryNode> = new Map();
  private hebbianConfig = {
    learningRate: 0.1,
    decayRate: 0.7,
    maxPropagationSteps: 3,
    activationThreshold: 0.3,
    synapticStrengthThreshold: 0.1
  };

  constructor(collectionName: string = 'agent_memories') {
    const baseDir = process.cwd();
    const cacheDir = path.join(baseDir, '.agents', 'cache');
    
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    
    this.dbPath = path.join(cacheDir, `sqlite-memory-${collectionName}.db`);
    this.db = new Database(this.dbPath);
    this.initializeDatabase();
  }

  /**
   * データベース初期化
   */
  private initializeDatabase(): void {
    // SQLiteパフォーマンス最適化
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA cache_size = 10000;');
    this.db.exec('PRAGMA temp_store = MEMORY;');

    // メインメモリテーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding BLOB NOT NULL,
        metadata TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_accessed INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0.5,
        memory_strength REAL DEFAULT 0.5,
        type TEXT DEFAULT 'general'
      );
    `);

    // シナプス結合テーブル
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS synaptic_connections (
        source_id TEXT,
        target_id TEXT,
        strength REAL,
        co_activation_count INTEGER DEFAULT 0,
        last_co_activated INTEGER,
        PRIMARY KEY (source_id, target_id),
        FOREIGN KEY (source_id) REFERENCES memories(id),
        FOREIGN KEY (target_id) REFERENCES memories(id)
      );
    `);

    // インデックス作成
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_memories_created_at ON memories(created_at);');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_synaptic_strength ON synaptic_connections(strength);');
  }

  /**
   * 初期化（ChromaMemoryClient互換）
   * SQLite版では即座に完了
   */
  async initialize(): Promise<void> {
    // SQLite版では特別な初期化は不要
    console.log(`✓ SQLite memory client initialized: ${this.dbPath}`);
  }

  /**
   * コサイン類似度計算
   */
  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Float32ArrayをBLOBに変換
   */
  private vectorToBlob(vector: Float32Array): Buffer {
    return Buffer.from(vector.buffer);
  }

  /**
   * BLOBをFloat32Arrayに変換
   */
  private blobToVector(blob: Buffer): Float32Array {
    return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4);
  }

  /**
   * 埋め込み生成（ローカルLLM API使用）
   */
  async generateEmbedding(text: string): Promise<Float32Array> {
    try {
      const baseUrl = process.env.LOCAL_LLM_BASE_URL || 'http://host.docker.internal:1234';
      const apiKey = process.env.LOCAL_LLM_API_KEY || 'lm-studio';
      
      const response = await fetch(`${baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          input: text,
          model: 'nomic-embed-text-v1.5'
        })
      });

      if (response.ok) {
        const data: any = await response.json();
        return new Float32Array(data.data[0].embedding);
      }
    } catch (error) {
      console.warn('Failed to generate embeddings via API:', error);
    }
    
    // フォールバック：シンプルなハッシュベース埋め込み
    return this.generateFallbackEmbedding(text);
  }

  /**
   * フォールバック埋め込み生成
   */
  private generateFallbackEmbedding(text: string): Float32Array {
    const dimension = 384; // 軽量な次元数
    const embedding = new Float32Array(dimension);
    
    // テキストのハッシュベースで特徴量生成
    const hash = createHash('sha256').update(text).digest();
    for (let i = 0; i < dimension; i++) {
      embedding[i] = (hash[i % hash.length] - 128) / 128; // -1 to 1 range
    }
    
    // 正規化
    const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / (norm || 1)) as Float32Array;
  }

  /**
   * 記憶の保存（ChromaMemoryClient互換）
   */
  async store(memory: Memory): Promise<void> {
    const embedding = await this.generateEmbedding(JSON.stringify(memory.content));
    const embeddingBlob = this.vectorToBlob(embedding);
    
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO memories (
        id, content, embedding, metadata, created_at, last_accessed, 
        access_count, success_rate, memory_strength, type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      memory.id,
      JSON.stringify(memory.content),
      embeddingBlob,
      JSON.stringify(memory.metadata),
      memory.metadata.created_at.getTime(),
      memory.metadata.last_accessed.getTime(),
      memory.metadata.access_count,
      memory.metadata.success_rate,
      memory.metadata.memory_strength || 0.5,
      memory.metadata.type || 'general'
    );

    console.log(`[SQLiteMemory] Stored memory: ${memory.id}`);
  }

  /**
   * ベクトル検索（ChromaMemoryClient互換）
   */
  async search(
    query: string, 
    limit: number = 10, 
    filter?: Record<string, any>
  ): Promise<Memory[]> {
    const queryEmbedding = await this.generateEmbedding(query);
    
    // 全メモリを取得してコサイン類似度計算
    let sql = 'SELECT * FROM memories';
    const params: any[] = [];
    
    if (filter) {
      const conditions: string[] = [];
      if (filter.type) {
        conditions.push('type = ?');
        params.push(filter.type);
      }
      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }
    }
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    
    // 類似度計算とソート
    const results = rows
      .map(row => {
        const embedding = this.blobToVector(row.embedding);
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);
        
        return {
          similarity,
          memory: {
            id: row.id,
            content: JSON.parse(row.content),
            metadata: {
              ...JSON.parse(row.metadata),
              created_at: new Date(row.created_at),
              last_accessed: new Date(row.last_accessed),
              access_count: row.access_count,
              success_rate: row.success_rate,
              memory_strength: row.memory_strength,
              type: row.type
            }
          } as Memory
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(item => item.memory);

    console.log(`[SQLiteMemory] Search found ${results.length} results for: ${query.substring(0, 50)}`);
    return results;
  }

  /**
   * 記憶の更新（ChromaMemoryClient互換）
   */
  async update(memory: Memory): Promise<void> {
    // 新しい埋め込みを生成
    const embedding = await this.generateEmbedding(JSON.stringify(memory.content));
    const embeddingBlob = this.vectorToBlob(embedding);
    
    const stmt = this.db.prepare(`
      UPDATE memories SET
        content = ?, embedding = ?, metadata = ?, last_accessed = ?,
        access_count = ?, success_rate = ?, memory_strength = ?, type = ?
      WHERE id = ?
    `);

    stmt.run(
      JSON.stringify(memory.content),
      embeddingBlob,
      JSON.stringify(memory.metadata),
      memory.metadata.last_accessed.getTime(),
      memory.metadata.access_count,
      memory.metadata.success_rate,
      memory.metadata.memory_strength || 0.5,
      memory.metadata.type || 'general',
      memory.id
    );

    console.log(`[SQLiteMemory] Updated memory: ${memory.id}`);
  }

  /**
   * IDによる記憶の取得（ChromaMemoryClient互換）
   */
  async get(id: string): Promise<Memory | null> {
    const stmt = this.db.prepare('SELECT * FROM memories WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) return null;
    
    return {
      id: row.id,
      content: JSON.parse(row.content),
      metadata: {
        ...JSON.parse(row.metadata),
        created_at: new Date(row.created_at),
        last_accessed: new Date(row.last_accessed),
        access_count: row.access_count,
        success_rate: row.success_rate,
        memory_strength: row.memory_strength,
        type: row.type
      }
    };
  }

  /**
   * 全記憶の取得（ChromaMemoryClient互換）
   */
  async getAll(): Promise<Memory[]> {
    const stmt = this.db.prepare('SELECT * FROM memories ORDER BY created_at DESC');
    const rows = stmt.all() as any[];
    
    return rows.map(row => ({
      id: row.id,
      content: JSON.parse(row.content),
      metadata: {
        ...JSON.parse(row.metadata),
        created_at: new Date(row.created_at),
        last_accessed: new Date(row.last_accessed),
        access_count: row.access_count,
        success_rate: row.success_rate,
        memory_strength: row.memory_strength,
        type: row.type
      }
    }));
  }

  /**
   * シナプス記憶活性化（ChromaMemoryClient互換）
   * ※ 簡略化版、基本的なベクトル検索のみ実装
   */
  async activateSynapticMemories(
    keyword: string, 
    contextSignature?: string
  ): Promise<SynapticMemoryNode[]> {
    // 基本的なベクトル検索を実行
    const memories = await this.search(keyword, 20, 
      contextSignature ? { context_signature: contextSignature } : undefined
    );
    
    // SynapticMemoryNode形式に変換
    return memories.map(memory => ({
      id: memory.id,
      content: JSON.stringify(memory.content),
      activationLevel: memory.metadata.memory_strength || 0.5,
      connections: [], // 簡略化版では空配列
      contextSignature: contextSignature || 'default',
      lastActivated: new Date(),
      memoryType: 'semantic' as const
    }));
  }

  /**
   * リソースクリーンアップ
   */
  close(): void {
    this.db.close();
  }
}
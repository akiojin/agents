# ChromaDB代替案実装計画

## 概要

現在のシナプス記憶システムがChromaDBに依存している問題を解決するため、ローカルのみで完結する代替ソリューションを検討・実装する。

## 現状分析

### ChromaDBの使用箇所

1. **シナプス記憶システム** (`packages/memory/src/chroma/chromaClient.ts`)
   - ベクトル検索
   - シナプス記憶ノードの保存・検索
   - ヘブ則学習による活性化伝播
   - メモリの保存・更新・検索

2. **問題点**
   - サーバー起動が必要（Docker環境で動作）
   - ローカル環境での自動起動ができない
   - 外部依存関係による複雑性

## 代替案比較

### 1. sqlite-vec（推奨）

**メリット：**
- 純粋なC実装で非常に高速・軽量
- SQLiteに完全統合、追加サーバー不要
- WASM対応でブラウザでも動作
- 既存SQLite基盤との完全互換性
- float32, int8, binary vectorsサポート
- コサイン・L2距離計算内蔵
- K-最近傍検索最適化済み

**デメリット：**
- 比較的新しいプロジェクト
- 高度な機能は限定的

### 2. LanceDB

**メリット：**
- Node.js用の優れたJavaScript API
- 自動埋め込み生成機能
- マルチモーダル対応
- 豊富な検索オプション

**デメリット：**
- 追加ライブラリ依存
- より重い実装
- Rustベースのバイナリ

## 実装戦略

### フェーズ1: sqlite-vecベース実装

#### 1.1 SQLite Vector Extension統合

```typescript
// packages/memory/src/vector/SqliteVectorClient.ts
export class SqliteVectorClient {
  private db: Database.Database;
  
  constructor(dbPath: string = '.agents/cache/vector-memory.db') {
    this.db = new Database(dbPath);
    this.loadVectorExtension();
    this.initializeSchema();
  }
  
  private loadVectorExtension(): void {
    // sqlite-vecエクステンションのロード
    this.db.loadExtension('./node_modules/sqlite-vec/dist/vec0');
  }
}
```

#### 1.2 シナプス記憶テーブル設計

```sql
-- 基本ベクトルテーブル
CREATE VIRTUAL TABLE vec_synaptic_memories USING vec0(
  memory_id TEXT PRIMARY KEY,
  content_embedding FLOAT[768],
  -- メタデータ列
  memory_type TEXT,
  context_signature TEXT,
  activation_level REAL,
  last_activated INTEGER
);

-- シナプス結合テーブル
CREATE TABLE synaptic_connections (
  source_memory_id TEXT,
  target_memory_id TEXT,
  strength REAL,
  co_activation_count INTEGER,
  last_co_activated INTEGER,
  PRIMARY KEY (source_memory_id, target_memory_id)
);
```

#### 1.3 埋め込み生成統合

```typescript
// ローカルLLM APIを使用した埋め込み生成
async generateEmbedding(text: string): Promise<Float32Array> {
  const response = await fetch(`${this.localLLMBaseUrl}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`
    },
    body: JSON.stringify({
      input: text,
      model: 'nomic-embed-text-v1.5'
    })
  });
  
  const data = await response.json();
  return new Float32Array(data.data[0].embedding);
}
```

### フェーズ2: シナプス記憶システム移行

#### 2.1 ChromaMemoryClient互換API

```typescript
export class SqliteVectorMemoryClient {
  // ChromaMemoryClientと同じインターフェース維持
  async activateSynapticMemories(keyword: string, contextSignature?: string): Promise<SynapticMemoryNode[]> {
    // 1. 埋め込み生成
    const queryEmbedding = await this.generateEmbedding(keyword);
    
    // 2. ベクトル検索
    const searchQuery = `
      SELECT 
        memory_id, 
        content_embedding,
        memory_type,
        context_signature,
        activation_level,
        distance
      FROM vec_synaptic_memories 
      WHERE content_embedding MATCH ?
        AND memory_type = COALESCE(?, memory_type)
      ORDER BY distance 
      LIMIT 20
    `;
    
    const results = this.db.prepare(searchQuery).all(
      new Uint8Array(queryEmbedding.buffer), 
      contextSignature
    );
    
    // 3. 活性化伝播実行
    return this.propagateActivation(results.map(r => r.memory_id));
  }
}
```

#### 2.2 ヘブ則学習の実装

```typescript
private async strengthenSynapticConnection(nodeA: string, nodeB: string): Promise<void> {
  const updateQuery = `
    INSERT INTO synaptic_connections (source_memory_id, target_memory_id, strength, co_activation_count, last_co_activated)
    VALUES (?, ?, 0.1, 1, ?)
    ON CONFLICT(source_memory_id, target_memory_id) DO UPDATE SET
      strength = MIN(1.0, strength + 0.1 * (1 - strength)),
      co_activation_count = co_activation_count + 1,
      last_co_activated = ?
  `;
  
  const timestamp = Date.now();
  this.db.prepare(updateQuery).run(nodeA, nodeB, timestamp, timestamp);
  this.db.prepare(updateQuery).run(nodeB, nodeA, timestamp, timestamp); // 双方向
}
```

### フェーズ3: パフォーマンス最適化

#### 3.1 インデックス作成

```sql
-- メタデータインデックス
CREATE INDEX idx_memory_type ON vec_synaptic_memories(memory_type);
CREATE INDEX idx_context_signature ON vec_synaptic_memories(context_signature);
CREATE INDEX idx_activation_level ON vec_synaptic_memories(activation_level);

-- 結合強度インデックス  
CREATE INDEX idx_synaptic_strength ON synaptic_connections(strength);
CREATE INDEX idx_last_activated ON synaptic_connections(last_co_activated);
```

#### 3.2 バイナリ量子化サポート

```typescript
// メモリ使用量削減のためのバイナリ量子化
async storeBinaryQuantizedMemory(memory: SynapticMemoryNode): Promise<void> {
  const fullEmbedding = await this.generateEmbedding(memory.content);
  const binaryEmbedding = this.quantizeToBinary(fullEmbedding);
  
  const insertQuery = `
    INSERT INTO vec_synaptic_memories_binary (memory_id, content_embedding_binary, original_embedding)
    VALUES (?, vec_quantize_binary(?), ?)
  `;
  
  this.db.prepare(insertQuery).run(
    memory.id,
    new Uint8Array(fullEmbedding.buffer),
    new Uint8Array(fullEmbedding.buffer)
  );
}
```

## 移行計画

### ステップ1: 並行実装
- 既存ChromaDBシステムを維持
- SqliteVectorMemoryClientを新規実装
- 同じインターフェースで動作確認

### ステップ2: 段階的移行
- 設定フラグでsqlite-vec/ChromaDBを切り替え可能に
- テスト環境での検証
- パフォーマンス比較

### ステップ3: 完全移行
- デフォルトをsqlite-vecに変更
- ChromaDB依存関係削除
- ドキュメント更新

## 期待される効果

1. **シンプル化**: サーバー不要でローカル完結
2. **パフォーマンス**: SQLite最適化による高速化
3. **統合性**: 既存SQLite基盤との完全統合
4. **移植性**: WAMSサポートでブラウザ対応可能
5. **保守性**: 外部依存関係の大幅削減

## リスク・考慮事項

1. **機能ギャップ**: ChromaDBの高度な機能の一部制限
2. **移行コスト**: 既存データの変換作業
3. **安定性**: sqlite-vecの成熟度
4. **埋め込み生成**: ローカルLLM APIへの依存

## 結論

sqlite-vecを使用したローカルベクトル検索システムの実装を推奨する。これにより、現在のChromaDBサーバー依存から脱却し、よりシンプルで保守性の高いシナプス記憶システムを実現できる。
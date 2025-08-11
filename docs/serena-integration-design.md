# Serenaコードインデックス機能のAgents統合設計

## 解析概要

Serenaの詳細分析により、以下の核心機能を特定：

### 核心アーキテクチャ

1. **solidlsp/** - Language Server Protocol統合層
   - 多言語対応（TypeScript/JavaScript、Python、Java、Go、Rust等）
   - 統一されたシンボル抽出インターフェース
   - 軽量なTCP/Socket通信でLSPサーバーと連携

2. **serena/symbol.py** - シンボル管理の中核
   - シンボル情報の抽出・整理・保存
   - 参照関係の追跡とグラフ構築
   - インクリメンタル更新の最適化

3. **serena/tools/symbol_tools.py** - 検索・操作API
   - 高速シンボル検索（名前、型、参照）
   - セマンティック検索（コンテキスト理解）
   - コード変更の影響分析

## Agents統合戦略

### フェーズ1: TypeScript LSPクライアント実装

**目標**: TypeScript/JavaScript専用の軽量LSPクライアント

```typescript
// packages/core/src/code-intelligence/lsp-client.ts
export class TypeScriptLSPClient {
  private connection: Connection;
  private capabilities: ServerCapabilities;
  
  async initialize(rootUri: string): Promise<void>
  async findSymbolDefinitions(uri: string, position: Position): Promise<Location[]>
  async findReferences(uri: string, position: Position): Promise<Location[]>
  async getDocumentSymbols(uri: string): Promise<DocumentSymbol[]>
  async getWorkspaceSymbols(query: string): Promise<SymbolInformation[]>
}
```

**実装要点**:
- vscode-languageserverを使用してTypeScript LSPサーバーと連携
- 非同期処理とタイムアウト管理
- 接続の自動復旧とエラーハンドリング

### フェーズ2: シンボルインデックスシステム

**目標**: プロジェクト全体のシンボル情報をSQLiteに永続化

```typescript
// packages/core/src/code-intelligence/symbol-index.ts
export interface SymbolIndex {
  indexProject(rootPath: string): Promise<void>
  findSymbols(query: SymbolQuery): Promise<SymbolInfo[]>
  findReferences(symbolId: string): Promise<ReferenceInfo[]>
  updateFile(filePath: string): Promise<void>
}

export interface SymbolInfo {
  id: string;
  name: string;
  kind: SymbolKind;
  location: Location;
  containerName?: string;
  documentation?: string;
  signature?: string;
}
```

**データベース設計**:
```sql
-- symbols テーブル
CREATE TABLE symbols (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind INTEGER NOT NULL,
  file_uri TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  start_character INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_character INTEGER NOT NULL,
  container_name TEXT,
  signature TEXT,
  documentation TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- references テーブル
CREATE TABLE references (
  id TEXT PRIMARY KEY,
  symbol_id TEXT REFERENCES symbols(id),
  file_uri TEXT NOT NULL,
  start_line INTEGER NOT NULL,
  start_character INTEGER NOT NULL,
  context TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- インデックス
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_symbols_kind ON symbols(kind);
CREATE INDEX idx_symbols_file ON symbols(file_uri);
CREATE INDEX idx_references_symbol ON references(symbol_id);
```

### フェーズ3: 検索・操作ツール群

**目標**: Function Callingで利用可能な高レベルAPI

```typescript
// src/functions/code-intelligence-tools.ts
export const codeIntelligenceFunctions: InternalFunction[] = [
  {
    name: 'find_symbol_definition',
    description: 'シンボルの定義場所を検索',
    parameters: {
      type: 'object',
      properties: {
        symbol_name: { type: 'string', description: 'シンボル名' },
        file_path: { type: 'string', description: '検索範囲のファイルパス（オプション）' },
        symbol_kind: { type: 'string', enum: ['class', 'function', 'variable', 'interface'] }
      },
      required: ['symbol_name']
    },
    handler: async (params) => await symbolIndexService.findDefinitions(params)
  },
  
  {
    name: 'find_symbol_references',
    description: 'シンボルの参照箇所を検索',
    parameters: {
      type: 'object',
      properties: {
        symbol_name: { type: 'string', description: 'シンボル名' },
        include_definition: { type: 'boolean', description: '定義も含めるか' }
      },
      required: ['symbol_name']
    },
    handler: async (params) => await symbolIndexService.findReferences(params)
  },
  
  {
    name: 'analyze_code_dependencies',
    description: 'コードの依存関係を分析',
    parameters: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '分析対象ファイルパス' },
        depth: { type: 'number', description: '依存関係の深さ（デフォルト: 2）' }
      },
      required: ['file_path']
    },
    handler: async (params) => await dependencyAnalyzer.analyze(params)
  },
  
  {
    name: 'semantic_code_search',
    description: 'セマンティックなコード検索',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '検索クエリ（自然言語可）' },
        file_types: { type: 'array', items: { type: 'string' }, description: 'ファイル種別フィルタ' }
      },
      required: ['query']
    },
    handler: async (params) => await semanticSearchService.search(params)
  }
];
```

## 技術的実装詳細

### LSPクライアント最適化

**Serenaからの学習点**:
- 接続プールによる複数LSPサーバーの効率管理
- リクエスト/レスポンスのキャッシュ戦略
- 増分更新による最小限の再インデックス

**Agents特化の最適化**:
```typescript
// packages/core/src/code-intelligence/optimized-lsp-client.ts
export class OptimizedLSPClient {
  private connectionPool: Map<string, Connection> = new Map();
  private responseCache: LRUCache<string, any> = new LRUCache(1000);
  private debounceUpdateTimer: Map<string, Timer> = new Map();
  
  async getSymbolsWithCache(uri: string): Promise<DocumentSymbol[]> {
    const cacheKey = `symbols:${uri}:${await this.getFileHash(uri)}`;
    
    if (this.responseCache.has(cacheKey)) {
      return this.responseCache.get(cacheKey);
    }
    
    const symbols = await this.connection.sendRequest(
      DocumentSymbolRequest.type,
      { textDocument: { uri } }
    );
    
    this.responseCache.set(cacheKey, symbols);
    return symbols;
  }
  
  // ファイル変更の検知と増分更新
  onFileChanged(uri: string): void {
    // デバウンス処理で過度な更新を防止
    if (this.debounceUpdateTimer.has(uri)) {
      clearTimeout(this.debounceUpdateTimer.get(uri));
    }
    
    this.debounceUpdateTimer.set(uri, setTimeout(() => {
      this.incrementalUpdate(uri);
    }, 500));
  }
}
```

### パフォーマンス最適化

**インデックス構築の並列化**:
```typescript
// packages/core/src/code-intelligence/parallel-indexer.ts
export class ParallelSymbolIndexer {
  private workerPool: Worker[];
  private taskQueue: IndexingTask[];
  
  async indexProject(rootPath: string): Promise<void> {
    const files = await this.discoverSourceFiles(rootPath);
    const batches = this.createBatches(files, this.workerPool.length);
    
    // ワーカープールによる並列処理
    const results = await Promise.all(
      batches.map((batch, index) => 
        this.processFileBatch(batch, this.workerPool[index])
      )
    );
    
    // 結果のマージとDB保存
    await this.mergeAndPersist(results);
  }
}
```

## 段階的導入計画

### ステップ1 (2週間): 基盤実装
- TypeScript LSPクライアントの実装
- SQLiteベースのシンボルDB構築
- 基本的なインデックス化機能

### ステップ2 (1週間): 検索機能強化
- 高速シンボル検索の実装
- 参照関係の追跡
- Function Callingツールとの統合

### ステップ3 (1週間): パフォーマンス最適化
- インクリメンタル更新の実装
- キャッシュ戦略の適用
- 並列処理の導入

### ステップ4 (1週間): セマンティック機能
- コンテキスト理解の向上
- 依存関係分析の実装
- 高度な検索機能

## 期待される効果

1. **MCPサーバー依存の解消** - ハングアップ問題の根本的解決
2. **高速化** - ローカル処理によるレスポンス向上（1-10ms目標）
3. **安定性** - 外部プロセス依存の削減による信頼性向上
4. **拡張性** - TypeScript特化による将来的な機能拡張の容易さ

この設計により、Serenaの本質的価値である「精密なコード理解と操作能力」をAgentsに完全統合し、より高度で安定したAIコーディング支援を実現します。
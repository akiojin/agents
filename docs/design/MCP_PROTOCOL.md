# MCPプロトコル設計書

## 概要

本設計書は、@akiojin/agentsにおけるModel Context Protocol (MCP)の実装仕様を定義します。MCPは、AIエージェントとツール間の標準化された通信プロトコルであり、Gemini CLIでも採用されている拡張可能なアーキテクチャの中核となります。

## 設計原則

1. **標準準拠**: Anthropic MCPプロトコル仕様に完全準拠
2. **拡張性**: プラグイン形式での機能追加を容易に
3. **並列実行**: 複数ツールの同時実行をサポート
4. **型安全性**: TypeScriptによる厳密な型定義
5. **エラー回復**: 堅牢なエラーハンドリングとリトライ機構

## アーキテクチャ

### レイヤー構成

```
┌─────────────────────────────────────┐
│         Agent Core                   │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│      MCP Client Manager              │
├─────────────────────────────────────┤
│  - Tool Registration                 │
│  - Request/Response Handling         │
│  - Connection Management             │
└─────────────┬───────────────────────┘
              │
┌─────────────▼───────────────────────┐
│       MCP Transport Layer            │
├─────────────────────────────────────┤
│  - JSON-RPC 2.0                     │
│  - WebSocket/HTTP/Stdio              │
└─────────────┬───────────────────────┘
              │
     ┌────────┼────────┐
     │        │        │
┌────▼──┐ ┌──▼───┐ ┌─▼──────┐
│Serena │ │ File │ │ Custom │
│Server │ │Server│ │ Servers│
└───────┘ └──────┘ └────────┘
```

## インターフェース定義

### 1. MCPツール基本インターフェース

```typescript
// MCPツールの基本インターフェース
interface MCPTool {
  // ツールのメタデータ
  name: string;
  description: string;
  version: string;
  
  // 入力スキーマ定義（JSON Schema）
  inputSchema: JSONSchema7;
  
  // 出力スキーマ定義
  outputSchema?: JSONSchema7;
  
  // 実行可能性チェック
  canExecute?: (params: unknown) => boolean | Promise<boolean>;
  
  // ツール実行
  execute: (params: unknown) => Promise<MCPToolResult>;
}

// ツール実行結果
interface MCPToolResult {
  success: boolean;
  data?: any;
  error?: MCPError;
  metadata?: {
    executionTime: number;
    tokensUsed?: number;
    [key: string]: any;
  };
}

// エラー定義
interface MCPError {
  code: string;
  message: string;
  details?: any;
  retryable?: boolean;
}
```

### 2. MCPサーバーインターフェース

```typescript
// MCPサーバー設定
interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'http' | 'websocket';
  command?: string;       // stdioの場合
  args?: string[];       // stdioの場合
  url?: string;          // http/websocketの場合
  env?: Record<string, string>;
  timeout?: number;
  retryPolicy?: RetryPolicy;
}

// MCPサーバークライアント
interface MCPServerClient {
  // ライフサイクル
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  
  // ツール管理
  listTools(): Promise<MCPTool[]>;
  getTool(name: string): Promise<MCPTool | null>;
  
  // 実行
  executeTool(name: string, params: unknown): Promise<MCPToolResult>;
  
  // プロンプト（スラッシュコマンド）
  listPrompts(): Promise<MCPPrompt[]>;
  executePrompt(name: string, args: Record<string, any>): Promise<string>;
  
  // リソース
  listResources(): Promise<MCPResource[]>;
  readResource(uri: string): Promise<any>;
}
```

### 3. Serena MCP統合

```typescript
// Serena専用インターフェース
interface SerenaMCPTool extends MCPTool {
  name: 'serena';
  
  // Serena固有のメソッド
  methods: {
    // シンボル操作
    findSymbol(params: FindSymbolParams): Promise<Symbol[]>;
    getSymbolsOverview(path: string): Promise<SymbolOverview>;
    replaceSymbolBody(params: ReplaceSymbolParams): Promise<void>;
    insertBeforeSymbol(params: InsertParams): Promise<void>;
    insertAfterSymbol(params: InsertParams): Promise<void>;
    
    // パターン検索
    searchForPattern(pattern: string | RegExp): Promise<SearchResult[]>;
    replaceRegex(params: RegexReplaceParams): Promise<number>;
    
    // ファイル操作
    findFile(pattern: string): Promise<string[]>;
    listDir(path: string): Promise<FileInfo[]>;
    
    // メモリ管理
    readMemory(key: string): Promise<any>;
    writeMemory(key: string, value: any): Promise<void>;
    
    // 参照解析
    findReferencingSymbols(symbol: string): Promise<Reference[]>;
    
    // 思考プロセス
    thinkAboutCollectedInformation(context: any): Promise<Thought>;
    thinkAboutWhetherYouAreDone(task: Task): Promise<boolean>;
  };
}

// Serena固有の型定義
interface FindSymbolParams {
  name?: string;
  type?: 'class' | 'function' | 'variable' | 'interface' | 'type';
  includeBody?: boolean;
  path?: string;
}

interface Symbol {
  name: string;
  type: string;
  path: string;
  line: number;
  column: number;
  body?: string;
  documentation?: string;
}

interface ReplaceSymbolParams {
  path: string;
  symbolName: string;
  newBody: string;
  preserveIndentation?: boolean;
}
```

## MCP Manager実装

### 1. MCPマネージャークラス

```typescript
class MCPManager {
  private servers: Map<string, MCPServerClient> = new Map();
  private tools: Map<string, MCPTool> = new Map();
  private parallelExecutor: ParallelExecutor;
  
  constructor(private config: MCPManagerConfig) {
    this.parallelExecutor = new ParallelExecutor(config.maxParallel || 10);
  }
  
  // サーバー管理
  async registerServer(config: MCPServerConfig): Promise<void> {
    const client = await this.createClient(config);
    await client.connect();
    
    // ツールを自動登録
    const tools = await client.listTools();
    for (const tool of tools) {
      this.registerTool(tool, client);
    }
    
    this.servers.set(config.name, client);
  }
  
  // ツール実行（単一）
  async executeTool(
    toolName: string, 
    params: unknown
  ): Promise<MCPToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      throw new MCPError('TOOL_NOT_FOUND', `Tool ${toolName} not found`);
    }
    
    // 入力検証
    this.validateInput(params, tool.inputSchema);
    
    // 実行可能性チェック
    if (tool.canExecute && !await tool.canExecute(params)) {
      throw new MCPError('CANNOT_EXECUTE', 'Tool cannot be executed with given params');
    }
    
    // 実行とエラーハンドリング
    try {
      return await this.executeWithRetry(tool, params);
    } catch (error) {
      return this.handleError(error, tool);
    }
  }
  
  // 並列ツール実行
  async executeParallel(
    executions: Array<{tool: string; params: unknown}>
  ): Promise<MCPToolResult[]> {
    return this.parallelExecutor.execute(
      executions.map(exec => () => this.executeTool(exec.tool, exec.params))
    );
  }
  
  // Serena専用メソッド
  getSerenaTool(): SerenaMCPTool | null {
    return this.tools.get('serena') as SerenaMCPTool;
  }
}
```

### 2. 並列実行エンジン

```typescript
class ParallelExecutor {
  private semaphore: Semaphore;
  
  constructor(private maxParallel: number = 10) {
    this.semaphore = new Semaphore(maxParallel);
  }
  
  async execute<T>(
    tasks: Array<() => Promise<T>>
  ): Promise<T[]> {
    // 依存関係のないタスクを並列実行
    const results = await Promise.allSettled(
      tasks.map(task => this.executeWithSemaphore(task))
    );
    
    // 結果の処理
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        throw new MCPError(
          'PARALLEL_EXECUTION_FAILED',
          `Task ${index} failed: ${result.reason}`
        );
      }
    });
  }
  
  private async executeWithSemaphore<T>(
    task: () => Promise<T>
  ): Promise<T> {
    await this.semaphore.acquire();
    try {
      return await task();
    } finally {
      this.semaphore.release();
    }
  }
}
```

## トランスポート層実装

### 1. 標準入出力（stdio）トランスポート

```typescript
class StdioTransport implements MCPTransport {
  private process: ChildProcess;
  private messageQueue: MessageQueue;
  
  constructor(private config: StdioConfig) {}
  
  async connect(): Promise<void> {
    this.process = spawn(this.config.command, this.config.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...this.config.env }
    });
    
    // JSON-RPC通信のセットアップ
    this.setupJsonRpc();
  }
  
  async sendRequest(method: string, params: any): Promise<any> {
    const id = generateId();
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };
    
    return this.messageQueue.send(request);
  }
  
  private setupJsonRpc(): void {
    // ストリームパーサーの設定
    const parser = new JsonRpcParser();
    
    this.process.stdout.pipe(parser).on('data', (message) => {
      this.handleMessage(message);
    });
    
    // エラーハンドリング
    this.process.stderr.on('data', (data) => {
      if (this.config.debug) {
        console.error('MCP Server stderr:', data.toString());
      }
    });
  }
}
```

### 2. HTTPトランスポート

```typescript
class HttpTransport implements MCPTransport {
  private client: HttpClient;
  
  constructor(private config: HttpConfig) {
    this.client = new HttpClient({
      baseURL: config.url,
      timeout: config.timeout || 30000,
      headers: config.headers
    });
  }
  
  async sendRequest(method: string, params: any): Promise<any> {
    const response = await this.client.post('/rpc', {
      jsonrpc: '2.0',
      id: generateId(),
      method,
      params
    });
    
    if (response.data.error) {
      throw new MCPError(
        response.data.error.code,
        response.data.error.message
      );
    }
    
    return response.data.result;
  }
}
```

## エラーハンドリング

### 1. エラー分類と対処

```typescript
enum MCPErrorCode {
  // 接続エラー
  CONNECTION_FAILED = 'CONNECTION_FAILED',
  CONNECTION_LOST = 'CONNECTION_LOST',
  TIMEOUT = 'TIMEOUT',
  
  // プロトコルエラー
  INVALID_REQUEST = 'INVALID_REQUEST',
  METHOD_NOT_FOUND = 'METHOD_NOT_FOUND',
  INVALID_PARAMS = 'INVALID_PARAMS',
  
  // 実行エラー
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  TOOL_NOT_FOUND = 'TOOL_NOT_FOUND',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  
  // 権限エラー
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED'
}

class MCPErrorHandler {
  handle(error: MCPError): MCPToolResult {
    switch (error.code) {
      case MCPErrorCode.CONNECTION_LOST:
        // 再接続を試みる
        return this.attemptReconnection(error);
        
      case MCPErrorCode.TIMEOUT:
        // タイムアウトの場合はリトライ
        return this.retryWithBackoff(error);
        
      case MCPErrorCode.RATE_LIMIT_EXCEEDED:
        // レート制限の場合は待機
        return this.waitAndRetry(error);
        
      default:
        // その他のエラーは上位層に伝播
        throw error;
    }
  }
}
```

### 2. リトライ戦略

```typescript
interface RetryPolicy {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
}

class RetryManager {
  constructor(private policy: RetryPolicy) {}
  
  async executeWithRetry<T>(
    fn: () => Promise<T>,
    context?: string
  ): Promise<T> {
    let lastError: Error;
    let delay = this.policy.initialDelay;
    
    for (let attempt = 0; attempt <= this.policy.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        // リトライ可能なエラーかチェック
        if (!this.isRetryable(error)) {
          throw error;
        }
        
        // 最大試行回数に達した場合
        if (attempt === this.policy.maxRetries) {
          throw new MCPError(
            'MAX_RETRIES_EXCEEDED',
            `Failed after ${this.policy.maxRetries} retries: ${error.message}`
          );
        }
        
        // 待機してリトライ
        await this.wait(delay);
        delay = Math.min(delay * this.policy.backoffMultiplier, this.policy.maxDelay);
      }
    }
    
    throw lastError!;
  }
  
  private isRetryable(error: any): boolean {
    if (!this.policy.retryableErrors) {
      return true;
    }
    
    return this.policy.retryableErrors.includes(error.code);
  }
}
```

## 設定とカスタマイズ

### 1. MCP設定ファイル形式

```yaml
# mcp.config.yaml
servers:
  - name: serena
    transport: stdio
    command: serena-mcp
    args: []
    env:
      SERENA_PROJECT_ROOT: ${PROJECT_ROOT}
    
  - name: filesystem
    transport: stdio
    command: @akiojin/mcp-filesystem
    args: ["--root", "${PROJECT_ROOT}"]
    
  - name: custom-api
    transport: http
    url: http://localhost:8080/mcp
    headers:
      Authorization: Bearer ${API_KEY}

options:
  maxParallel: 10
  timeout: 30000
  retryPolicy:
    maxRetries: 3
    initialDelay: 1000
    maxDelay: 10000
    backoffMultiplier: 2
```

### 2. プログラマティック設定

```typescript
const mcpManager = new MCPManager({
  servers: [
    {
      name: 'serena',
      transport: 'stdio',
      command: 'serena-mcp',
      env: {
        SERENA_PROJECT_ROOT: process.cwd()
      }
    }
  ],
  options: {
    maxParallel: 10,
    timeout: 30000,
    debug: process.env.DEBUG === 'true'
  }
});

// 動的にサーバーを追加
await mcpManager.registerServer({
  name: 'database',
  transport: 'http',
  url: 'http://db-mcp:8080'
});
```

## パフォーマンス最適化

### 1. 接続プーリング

```typescript
class ConnectionPool {
  private connections: Map<string, MCPConnection> = new Map();
  private maxConnections: number = 10;
  
  async getConnection(server: string): Promise<MCPConnection> {
    // 既存の接続を再利用
    if (this.connections.has(server)) {
      const conn = this.connections.get(server)!;
      if (conn.isAlive()) {
        return conn;
      }
    }
    
    // 新しい接続を作成
    if (this.connections.size >= this.maxConnections) {
      // 最も使用されていない接続を閉じる
      await this.evictLRU();
    }
    
    const conn = await this.createConnection(server);
    this.connections.set(server, conn);
    return conn;
  }
}
```

### 2. キャッシング戦略

```typescript
class MCPCache {
  private cache: LRUCache<string, CacheEntry>;
  
  constructor(options: CacheOptions) {
    this.cache = new LRUCache({
      max: options.maxSize || 1000,
      ttl: options.ttl || 60000, // 1分
      updateAgeOnGet: true
    });
  }
  
  async get<T>(
    key: string,
    fetcher: () => Promise<T>
  ): Promise<T> {
    // キャッシュチェック
    const cached = this.cache.get(key);
    if (cached && !this.isStale(cached)) {
      return cached.value as T;
    }
    
    // フェッチして キャッシュ
    const value = await fetcher();
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
    
    return value;
  }
}
```

## セキュリティ考慮事項

### 1. サンドボックス実行

```typescript
class MCPSandbox {
  async executeInSandbox(
    server: MCPServerConfig,
    params: any
  ): Promise<any> {
    // Bunワーカーで隔離実行
    const worker = new Worker('./mcp-worker.ts', {
      permissions: {
        read: false,
        write: false,
        net: server.transport === 'http'
      }
    });
    
    return worker.run({ server, params });
  }
}
```

### 2. 入力検証

```typescript
class InputValidator {
  validate(params: unknown, schema: JSONSchema7): void {
    const ajv = new Ajv({ strict: true });
    const validate = ajv.compile(schema);
    
    if (!validate(params)) {
      throw new MCPError(
        'INVALID_PARAMS',
        `Invalid parameters: ${ajv.errorsText(validate.errors)}`
      );
    }
  }
}
```

## テスト戦略

### 1. ユニットテスト

```typescript
describe('MCPManager', () => {
  let manager: MCPManager;
  
  beforeEach(() => {
    manager = new MCPManager({
      servers: [],
      options: { maxParallel: 5 }
    });
  });
  
  describe('executeTool', () => {
    it('should execute tool successfully', async () => {
      const mockTool: MCPTool = {
        name: 'test',
        description: 'Test tool',
        version: '1.0.0',
        inputSchema: { type: 'object' },
        execute: jest.fn().mockResolvedValue({ success: true, data: 'result' })
      };
      
      manager.registerTool(mockTool);
      const result = await manager.executeTool('test', {});
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('result');
    });
  });
});
```

### 2. 統合テスト

```typescript
describe('Serena Integration', () => {
  let mcpManager: MCPManager;
  
  beforeAll(async () => {
    mcpManager = new MCPManager({
      servers: [{
        name: 'serena',
        transport: 'stdio',
        command: 'serena-mcp'
      }]
    });
    
    await mcpManager.initialize();
  });
  
  it('should find symbols in codebase', async () => {
    const serena = mcpManager.getSerenaTool();
    const symbols = await serena.methods.findSymbol({
      name: 'MCPManager',
      type: 'class'
    });
    
    expect(symbols).toHaveLength(1);
    expect(symbols[0].name).toBe('MCPManager');
  });
});
```

## 今後の拡張計画

### Phase 1: 基本実装
- JSON-RPC 2.0プロトコル実装
- Stdioトランスポート
- Serena統合
- 基本的なエラーハンドリング

### Phase 2: 拡張機能
- HTTPトランスポート
- WebSocketトランスポート  
- プロンプトテンプレート対応
- リソース管理

### Phase 3: 最適化
- 接続プーリング
- 高度なキャッシング
- メトリクス収集
- パフォーマンス最適化
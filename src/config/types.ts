/**
 * 統一されたConfigインターフェース
 */

// MCPServerConfig
export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// ChatMessage
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// セッションConfig
export interface SessionConfig {
  id: string;
  startedAt: Date;
  config: Config;
  history: ChatMessage[];
}

// TaskConfig
export interface TaskConfig {
  description: string;
  files?: string[];
  parallel?: boolean;
  timeout?: number;
  context?: Record<string, unknown>;
}

// TaskResult
export interface TaskResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: Error;
  duration?: number;
}

export interface Config {
  // LLMConfig
  llm: {
    provider: 'openai' | 'anthropic' | 'local-gptoss' | 'local-lmstudio';
    apiKey?: string; // OpenAI、Anthropicの場合は必須だが、ランタイムでチェック
    model?: string; // Providerごとのデフォルト値使用可能
    timeout: number; // 必須：Timeout時間（ミリseconds）
    maxRetries: number; // 必須：最大Retry回数
    temperature?: number; // Options：0.0-2.0の範囲
    maxTokens?: number; // Options：最大トークン数
  };

  // MCPConfig
  mcp: {
    servers: MCPServerConfig[]; // MCPServerConfigのリスト
    timeout: number; // 必須：MCPConnectionTimeout
    enabled: boolean; // 必須：MCP機能の有効/無効
    maxRetries: number; // 必須：MCP通信の最大Retry回数
  };

  // アプリケーションConfig
  app: {
    logLevel: 'debug' | 'info' | 'warn' | 'error'; // 必須：ログレベル
    logDir: string; // 必須：ログディレクトリパス
    maxParallel: number; // 必須：最大ParallelExecute数
    silent: boolean; // 必須：サイレントモードの有効/無効
    timeout: number; // 必須：アプリケーション全体のTimeout
  };

  // パスConfig
  paths: {
    cache: string; // 必須：キャッシュディレクトリパス
    history: string; // 必須：Historyファイルパス
    config: string; // 必須：Configファイルパス
  };

  // LocalConfig（後方互換性のため）
  localEndpoint?: string; // Options：LocalAPIエンドポイント
}

/**
 * Configのデフォルト値
 */
export const DEFAULT_CONFIG: Config = {
  llm: {
    provider: 'openai',
    timeout: 60000, // 60seconds
    maxRetries: 3,
    temperature: 0.7,
    maxTokens: 2000,
  },
  mcp: {
    servers: [
      {
        name: 'filesystem',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem'],
      },
    ],
    timeout: 30000, // 30seconds
    enabled: true,
    maxRetries: 2,
  },
  app: {
    logLevel: 'info',
    logDir: './logs',
    maxParallel: 5,
    silent: false,
    timeout: 300000, // 5minutes
  },
  paths: {
    cache: '.agents-cache',
    history: '.agents-history',
    config: '.agents.yaml',
  },
};

/**
 * 環境変数のマッピング
 */
export const ENV_MAPPING = {
  // LLMConfig
  AGENTS_PROVIDER: 'llm.provider',
  AGENTS_API_KEY: 'llm.apiKey',
  AGENTS_MODEL: 'llm.model',
  AGENTS_LLM_TIMEOUT: 'llm.timeout',
  AGENTS_LLM_MAX_RETRIES: 'llm.maxRetries',
  AGENTS_LOCAL_ENDPOINT: 'localEndpoint',

  // MCPConfig
  AGENTS_USE_MCP: 'mcp.enabled',
  AGENTS_MCP_TIMEOUT: 'mcp.timeout',
  AGENTS_MCP_MAX_RETRIES: 'mcp.maxRetries',

  // アプリケーションConfig
  AGENTS_LOG_LEVEL: 'app.logLevel',
  AGENTS_LOG_DIR: 'app.logDir',
  AGENTS_MAX_PARALLEL: 'app.maxParallel',
  AGENTS_SILENT: 'app.silent',
  AGENTS_TIMEOUT: 'app.timeout',

  // パスConfig
  AGENTS_CACHE_PATH: 'paths.cache',
  AGENTS_HISTORY_PATH: 'paths.history',
} as const;

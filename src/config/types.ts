/**
 * 統一された設定インターフェース
 */

// MCPサーバー設定
export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// チャットメッセージ
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// セッション設定
export interface SessionConfig {
  id: string;
  startedAt: Date;
  config: Config;
  history: ChatMessage[];
}

// タスク設定
export interface TaskConfig {
  description: string;
  files?: string[];
  parallel?: boolean;
  timeout?: number;
  context?: Record<string, unknown>;
}

// タスク結果
export interface TaskResult {
  success: boolean;
  message: string;
  data?: unknown;
  error?: Error;
  duration?: number;
}

export interface Config {
  // LLM設定
  llm: {
    provider: 'openai' | 'anthropic' | 'local-gptoss' | 'local-lmstudio';
    apiKey?: string; // OpenAI、Anthropicの場合は必須だが、ランタイムでチェック
    model?: string; // プロバイダーごとのデフォルト値使用可能
    timeout: number; // 必須：タイムアウト時間（ミリ秒）
    maxRetries: number; // 必須：最大リトライ回数
    temperature?: number; // オプション：0.0-2.0の範囲
    maxTokens?: number; // オプション：最大トークン数
  };

  // MCP設定
  mcp: {
    servers: MCPServerConfig[]; // MCPサーバー設定のリスト
    timeout: number; // 必須：MCP接続タイムアウト
    enabled: boolean; // 必須：MCP機能の有効/無効
    maxRetries: number; // 必須：MCP通信の最大リトライ回数
  };

  // アプリケーション設定
  app: {
    logLevel: 'debug' | 'info' | 'warn' | 'error'; // 必須：ログレベル
    logDir: string; // 必須：ログディレクトリパス
    maxParallel: number; // 必須：最大並列実行数
    silent: boolean; // 必須：サイレントモードの有効/無効
    timeout: number; // 必須：アプリケーション全体のタイムアウト
  };

  // パス設定
  paths: {
    cache: string; // 必須：キャッシュディレクトリパス
    history: string; // 必須：履歴ファイルパス
    config: string; // 必須：設定ファイルパス
  };

  // ローカル設定（後方互換性のため）
  localEndpoint?: string; // オプション：ローカルAPIエンドポイント
}

/**
 * 設定のデフォルト値
 */
export const DEFAULT_CONFIG: Config = {
  llm: {
    provider: 'openai',
    timeout: 60000, // 60秒
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
    timeout: 30000, // 30秒
    enabled: true,
    maxRetries: 2,
  },
  app: {
    logLevel: 'info',
    logDir: './logs',
    maxParallel: 5,
    silent: false,
    timeout: 300000, // 5分
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
  // LLM設定
  AGENTS_PROVIDER: 'llm.provider',
  AGENTS_API_KEY: 'llm.apiKey',
  AGENTS_MODEL: 'llm.model',
  AGENTS_LLM_TIMEOUT: 'llm.timeout',
  AGENTS_LLM_MAX_RETRIES: 'llm.maxRetries',
  AGENTS_LOCAL_ENDPOINT: 'localEndpoint',

  // MCP設定
  AGENTS_USE_MCP: 'mcp.enabled',
  AGENTS_MCP_TIMEOUT: 'mcp.timeout',
  AGENTS_MCP_MAX_RETRIES: 'mcp.maxRetries',

  // アプリケーション設定
  AGENTS_LOG_LEVEL: 'app.logLevel',
  AGENTS_LOG_DIR: 'app.logDir',
  AGENTS_MAX_PARALLEL: 'app.maxParallel',
  AGENTS_SILENT: 'app.silent',
  AGENTS_TIMEOUT: 'app.timeout',

  // パス設定
  AGENTS_CACHE_PATH: 'paths.cache',
  AGENTS_HISTORY_PATH: 'paths.history',
} as const;

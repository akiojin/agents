import type { MCPServerConfig } from '../types/config.js';

/**
 * 統一された設定インターフェース
 */
export interface Config {
  // LLM設定
  llm: {
    provider: 'openai' | 'anthropic' | 'local-gptoss' | 'local-lmstudio';
    apiKey?: string;
    model?: string;
    timeout: number;
    maxRetries: number;
    temperature?: number;
    maxTokens?: number;
  };

  // MCP設定
  mcp: {
    servers: MCPServerConfig[];
    timeout: number;
    enabled: boolean;
    maxRetries: number;
  };

  // アプリケーション設定
  app: {
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    logDir: string;
    maxParallel: number;
    silent: boolean;
    timeout: number;
  };

  // パス設定
  paths: {
    cache: string;
    history: string;
    config: string;
  };

  // ローカル設定（後方互換性のため）
  localEndpoint?: string;
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

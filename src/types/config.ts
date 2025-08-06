// エージェント設定の型定義
export interface Config {
  // LLMプロバイダー設定
  provider: 'openai' | 'anthropic' | 'local-gptoss' | 'local-lmstudio';
  apiKey?: string;
  localEndpoint?: string;
  model?: string;

  // MCP設定
  useMCP: boolean;
  mcpServers?: MCPServerConfig[];

  // 実行設定
  maxParallel: number;
  timeout: number;

  // ログ設定
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // パス設定
  cachePath: string;
  historyPath: string;
}

// MCPサーバー設定
export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// セッション設定
export interface SessionConfig {
  id: string;
  startedAt: Date;
  config: Config;
  history: ChatMessage[];
}

// チャットメッセージ
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
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

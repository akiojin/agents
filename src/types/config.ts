// AgentConfigの型定義
export interface Config {
  // LLMProviderConfig
  provider: 'openai' | 'anthropic' | 'local-gptoss' | 'local-lmstudio';
  apiKey?: string;
  localEndpoint?: string;
  model?: string;

  // MCPConfig
  useMCP: boolean;
  mcpServers?: MCPServerConfig[];

  // ExecuteConfig
  maxParallel: number;
  timeout: number;

  // ログConfig
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // パスConfig
  cachePath: string;
  historyPath: string;
}

// MCPServerConfig
export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// セッションConfig
export interface SessionConfig {
  id: string;
  startedAt: Date;
  config: Config;
  history: ChatMessage[];
}

// ChatMessage
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
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

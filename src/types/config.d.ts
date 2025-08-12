export interface Config {
    provider: 'openai' | 'anthropic' | 'local-gptoss' | 'local-lmstudio';
    apiKey?: string;
    localEndpoint?: string;
    model?: string;
    useMCP: boolean;
    mcpServers?: MCPServerConfig[];
    maxParallel: number;
    timeout: number;
    logLevel: 'debug' | 'info' | 'warn' | 'error';
    cachePath: string;
    historyPath: string;
}
export interface MCPServerConfig {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
}
export interface SessionConfig {
    id: string;
    startedAt: Date;
    config: Config;
    history: ChatMessage[];
}
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
export interface TaskConfig {
    description: string;
    files?: string[];
    parallel?: boolean;
    timeout?: number;
    context?: Record<string, unknown>;
}
export interface TaskResult {
    success: boolean;
    message: string;
    data?: unknown;
    error?: Error;
    duration?: number;
}

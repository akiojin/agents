/**
 * 統一されたConfigインターフェース
 */
export interface MCPServerConfig {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    type?: 'stdio' | 'sse' | 'http';
}
export interface MCPJsonConfig {
    mcpServers: {
        [serverName: string]: {
            type?: 'stdio' | 'sse' | 'http';
            command?: string;
            args?: string[];
            env?: Record<string, string>;
            url?: string;
            headers?: Record<string, string>;
        };
    };
}
export interface MCPJsonServerEntry {
    type?: 'stdio' | 'sse' | 'http';
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
}
export interface ChatMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
export interface SessionConfig {
    id: string;
    startedAt: Date;
    config: Config;
    history: ChatMessage[];
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
export interface Config {
    llm: {
        provider: 'openai' | 'anthropic' | 'local-gptoss' | 'local-lmstudio';
        apiKey?: string;
        model?: string;
        timeout: number;
        maxRetries: number;
        temperature?: number;
        maxTokens?: number;
        responseFormat?: {
            enabled: boolean;
            maxLineLength?: number;
            useSimpleLists?: boolean;
            avoidTables?: boolean;
            minimizeEmojis?: boolean;
        };
    };
    mcp: {
        servers: MCPServerConfig[];
        timeout: number;
        enabled: boolean;
        maxRetries: number;
    };
    app: {
        logLevel: 'debug' | 'info' | 'warn' | 'error';
        logDir: string;
        maxParallel: number;
        silent: boolean;
        timeout: number;
    };
    paths: {
        cache: string;
        history: string;
        config: string;
    };
    functions?: {
        filesystem: {
            enabled: boolean;
            security: {
                allowedPaths: string[];
                allowCurrentDirectoryChange: boolean;
                restrictToStartupDirectory: boolean;
            };
        };
        bash?: {
            enabled: boolean;
            security: {
                allowedCommands: string[];
                blockedCommands: string[];
                timeout: number;
                restrictWorkingDirectory: boolean;
                allowedEnvVars: string[];
                allowedShells: string[];
            };
        };
    };
    localEndpoint?: string;
}
/**
 * Configのデフォルト値
 */
export declare const DEFAULT_CONFIG: Config;
/**
 * 環境変数のマッピング
 */
export declare const ENV_MAPPING: {
    readonly AGENTS_PROVIDER: "llm.provider";
    readonly AGENTS_API_KEY: "llm.apiKey";
    readonly AGENTS_MODEL: "llm.model";
    readonly AGENTS_LLM_TIMEOUT: "llm.timeout";
    readonly AGENTS_LLM_MAX_RETRIES: "llm.maxRetries";
    readonly AGENTS_LOCAL_ENDPOINT: "localEndpoint";
    readonly AGENTS_USE_MCP: "mcp.enabled";
    readonly AGENTS_MCP_TIMEOUT: "mcp.timeout";
    readonly AGENTS_MCP_MAX_RETRIES: "mcp.maxRetries";
    readonly AGENTS_LOG_LEVEL: "app.logLevel";
    readonly AGENTS_LOG_DIR: "app.logDir";
    readonly AGENTS_MAX_PARALLEL: "app.maxParallel";
    readonly AGENTS_SILENT: "app.silent";
    readonly AGENTS_TIMEOUT: "app.timeout";
    readonly AGENTS_CACHE_PATH: "paths.cache";
    readonly AGENTS_HISTORY_PATH: "paths.history";
};
//# sourceMappingURL=types.d.ts.map
"use strict";
/**
 * 統一されたConfigインターフェース
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV_MAPPING = exports.DEFAULT_CONFIG = void 0;
/**
 * Configのデフォルト値
 */
exports.DEFAULT_CONFIG = {
    llm: {
        provider: 'openai',
        timeout: 60000, // 60seconds
        maxRetries: 3,
        temperature: 0.7,
        maxTokens: 2000,
    },
    mcp: {
        servers: [],
        timeout: 30000, // 30seconds for MCP operations
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
        config: 'settings.json',
    },
    functions: {
        filesystem: {
            enabled: true,
            security: {
                allowedPaths: [process.cwd()],
                allowCurrentDirectoryChange: true,
                restrictToStartupDirectory: true
            }
        },
        bash: {
            enabled: true,
            security: {
                allowedCommands: [],
                blockedCommands: ['rm -rf /', 'shutdown', 'reboot', 'halt', 'poweroff', 'mkfs', 'fdisk'],
                timeout: 30000,
                restrictWorkingDirectory: true,
                allowedEnvVars: [],
                allowedShells: ['/bin/bash', '/bin/sh']
            }
        }
    },
    localEndpoint: 'http://host.docker.internal:1234',
};
/**
 * 環境変数のマッピング
 */
exports.ENV_MAPPING = {
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
};
//# sourceMappingURL=types.js.map
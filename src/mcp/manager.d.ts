import { EventEmitter } from 'events';
export interface Tool {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
}
export declare class MCPManager extends EventEmitter {
    private config;
    private servers;
    private processes;
    private tools;
    private mcpConfig;
    private initializationStatus;
    private isInitializing;
    constructor(config: import('../types/config.js').Config);
    /**
     * 新しい統一Configシステムを使用するコンストラクタ
     */
    static fromUnifiedConfig(config: import('../config/types.js').Config): MCPManager;
    initialize(): Promise<void>;
    private startServer;
    listTools(): Promise<Tool[]>;
    listToolsWithServerInfo(): Promise<Array<{
        serverName: string;
        toolName: string;
        tool: Tool;
    }>>;
    invokeTool(toolName: string, params?: Record<string, unknown>): Promise<unknown>;
    /**
     * ツール名に基づいて適切なサーバーを特定
     */
    private getServerForTool;
    private getDefaultServer;
    shutdown(): Promise<void>;
    restartServer(serverName: string): Promise<void>;
    getServerStatus(): Map<string, boolean>;
    /**
     * MCPConfigのGet
     */
    getMCPConfig(): {
        timeout: number;
        maxRetries: number;
        enabled: boolean;
    };
    /**
     * MCPConfigのUpdate
     */
    updateMCPConfig(newConfig: Partial<typeof this.mcpConfig>): void;
    /**
     * サーバーの初期化状態を更新
     */
    private updateServerStatus;
    /**
     * 初期化進捗を取得
     */
    getInitializationProgress(): {
        isInitializing: boolean;
        total: number;
        completed: number;
        failed: number;
        servers: Array<{
            name: string;
            type: 'stdio' | 'http' | 'sse';
            status: 'pending' | 'connecting' | 'initializing' | 'listing-tools' | 'completed' | 'failed';
            error?: string;
            startedAt?: Date;
            completedAt?: Date;
            toolCount?: number;
            duration?: number;
        }>;
    };
    /**
     * 初期化が完了しているかチェック
     */
    isInitializationCompleted(): boolean;
}

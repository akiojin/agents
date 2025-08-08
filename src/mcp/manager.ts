import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type { Config, MCPServerConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { MCPClient, HTTPMCPClient, SSEMCPClient } from './client.js';

// MCP クライアントの共通インターフェース
interface MCPClientInterface {
  connect(process?: any): Promise<void>;
  listTools(): Promise<Tool[]>;
  invokeTool(name: string, params?: Record<string, unknown>): Promise<unknown>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getName(): string;
  getTimeout(): number;
  getMaxRetries(): number;
}

export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export class MCPManager extends EventEmitter {
  private config: import('../types/config.js').Config;
  private servers: Map<string, MCPClientInterface> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private tools: Map<string, Tool> = new Map();
  private mcpConfig: {
    timeout: number;
    maxRetries: number;
    enabled: boolean;
  };

  // 初期化進捗追跡
  private initializationStatus: Map<string, {
    status: 'pending' | 'connecting' | 'initializing' | 'listing-tools' | 'completed' | 'failed';
    error?: string;
    startedAt?: Date;
    completedAt?: Date;
    toolCount?: number;
    type: 'stdio' | 'http' | 'sse';
  }> = new Map();
  private isInitializing: boolean = false;

  constructor(config: import('../types/config.js').Config) {
    super();
    this.config = config;

    // MCPConfigを抽出（統一Configまたは従来Configから）
    this.mcpConfig = {
      timeout: 30000, // デフォルト30seconds for MCP operations
      maxRetries: 2, // デフォルト2回
      enabled: config.useMCP ?? true,
    };
  }

  /**
   * 新しい統一Configシステムを使用するコンストラクタ
   */
  static fromUnifiedConfig(config: import('../config/types.js').Config): MCPManager {
    // 統一Configを従来ConfigにConvert
    const legacyConfig: import('../types/config.js').Config = {
      provider: config.llm.provider,
      apiKey: config.llm.apiKey,
      model: config.llm.model,
      localEndpoint: config.localEndpoint,
      useMCP: config.mcp.enabled,
      mcpServers: config.mcp.servers,
      maxParallel: config.app.maxParallel,
      timeout: config.app.timeout,
      logLevel: config.app.logLevel,
      cachePath: config.paths.cache,
      historyPath: config.paths.history,
    };

    const manager = new MCPManager(legacyConfig);

    // 統一ConfigからMCPConfigをConfig
    manager.mcpConfig = {
      timeout: config.mcp.timeout,
      maxRetries: config.mcp.maxRetries,
      enabled: config.mcp.enabled,
    };

    return manager;
  }

  async initialize(): Promise<void> {
    if (!this.mcpConfig.enabled || !this.config.mcpServers) {
      logger.info('MCP is disabled');
      return;
    }

    this.isInitializing = true;
    logger.info('Initializing MCP servers...');

    // 全サーバーの初期化状態をpendingに設定
    for (const serverConfig of this.config.mcpServers) {
      this.initializationStatus.set(serverConfig.name, {
        status: 'pending',
        type: (serverConfig.type as 'stdio' | 'http' | 'sse') || 'stdio',
      });
    }

    // 進捗更新イベントを発行
    this.emit('initialization-started', this.getInitializationProgress());

    // 全サーバーを並列で初期化
    const initPromises = this.config.mcpServers.map(async (serverConfig) => {
      try {
        // サーバー開始のログを詳細レベルに変更（コンソール表示を抑制）
        logger.debug(`Starting server ${serverConfig.name} (${serverConfig.type || 'stdio'})`);
        await this.startServer(serverConfig);
        // 成功メッセージもログレベルを下げる
        logger.debug(`Server ${serverConfig.name} started successfully`);
      } catch (error) {
        // エラーをコンソールに即座に表示せず、ログとステータスのみ更新
        logger.debug(`Failed to start MCP server: ${serverConfig.name}`, error);
        this.updateServerStatus(serverConfig.name, 'failed', error instanceof Error ? error.message : String(error));
        this.emit('server-status-updated', { 
          serverName: serverConfig.name, 
          status: this.initializationStatus.get(serverConfig.name)!
        });
      }
    });

    // すべての初期化が完了するまで待機
    await Promise.allSettled(initPromises);

    // 初期化完了メッセージもログレベルを下げる
    logger.debug(`MCP initialization completed: ${this.initializationStatus.size} servers processed`);

    this.isInitializing = false;
    this.emit('initialization-completed', this.getInitializationProgress());
  }

  private async startServer(serverConfig: MCPServerConfig): Promise<void> {
    const serverName = serverConfig.name;
    
    try {
      this.updateServerStatus(serverName, 'connecting');
      logger.info(`Starting MCP server: ${serverName} (${serverConfig.type || 'stdio'})`);

      let client: MCPClientInterface;

      // サーバータイプ別にクライアントを作成
      if (serverConfig.type === 'http') {
        if (!serverConfig.url) {
          throw new Error(`HTTP server ${serverName}: URL is required`);
        }
        
        logger.info(`HTTP server ${serverName} will connect to: ${serverConfig.url}`);
        client = new HTTPMCPClient(serverName, serverConfig.url, {
          timeout: this.mcpConfig.timeout,
          maxRetries: this.mcpConfig.maxRetries,
        });
        
        this.updateServerStatus(serverName, 'initializing');
        await client.connect();
        
      } else if (serverConfig.type === 'sse') {
        if (!serverConfig.url) {
          throw new Error(`SSE server ${serverName}: URL is required`);
        }
        
        logger.info(`SSE server ${serverName} will connect to: ${serverConfig.url}`);
        client = new SSEMCPClient(serverName, serverConfig.url, {
          timeout: this.mcpConfig.timeout,
          maxRetries: this.mcpConfig.maxRetries,
        });
        
        this.updateServerStatus(serverName, 'initializing');
        await client.connect();
        
      } else {
        // STDIOタイプの処理（既存の実装）
        const childProcess = spawn(serverConfig.command, serverConfig.args || [], {
          env: { ...process.env, ...serverConfig.env },
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        this.processes.set(serverName, childProcess);

        client = new MCPClient(serverName, {
          timeout: this.mcpConfig.timeout,
          maxRetries: this.mcpConfig.maxRetries,
        });

        this.updateServerStatus(serverName, 'initializing');
        await client.connect(childProcess);
      }

      this.servers.set(serverName, client);

      // ツール一覧取得
      this.updateServerStatus(serverName, 'listing-tools');
      const tools = await client.listTools();
      for (const tool of tools) {
        this.tools.set(`${serverName}:${tool.name}`, tool);
      }

      // 完了状態に更新
      this.updateServerStatus(serverName, 'completed', undefined, tools.length);
      logger.info(`MCP server started: ${serverName} (${tools.length} tools)`);
      
      // 進捗更新イベントを発行
      this.emit('server-initialized', { serverName, toolCount: tools.length });

    } catch (error) {
      this.updateServerStatus(serverName, 'failed', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async listTools(): Promise<Tool[]> {
    return Array.from(this.tools.values());
  }

  async listToolsWithServerInfo(): Promise<Array<{ serverName: string; toolName: string; tool: Tool }>> {
    const result: Array<{ serverName: string; toolName: string; tool: Tool }> = [];
    for (const [key, tool] of this.tools.entries()) {
      const [serverName, toolName] = key.includes(':') 
        ? key.split(':', 2)
        : ['default', tool.name];
      result.push({ serverName, toolName: toolName || tool.name, tool });
    }
    return result;
  }

  async invokeTool(toolName: string, params?: Record<string, unknown>): Promise<unknown> {
    const [serverName, name] = toolName.includes(':')
      ? toolName.split(':', 2)
      : [this.getServerForTool(toolName), toolName];

    const client = this.servers.get(serverName || '');
    if (!client) {
      throw new Error(`MCPServernot found: ${serverName || 'デフォルト'}`);
    }

    return client.invokeTool(name || '', params);
  }

  /**
   * ツール名に基づいて適切なサーバーを特定
   */
  private getServerForTool(toolName: string): string {
    // serenaプレフィックスのツールはserenaサーバーに送信
    if (toolName.startsWith('serena_')) {
      const serenaServer = Array.from(this.servers.keys()).find(name => 
        name.includes('serena') || name === 'serena'
      );
      if (serenaServer) {
        logger.debug(`Routing ${toolName} to serena server: ${serenaServer}`);
        return serenaServer;
      }
    }

    // mcp__で始まるツールは対応するサーバーを検索
    if (toolName.startsWith('mcp__')) {
      const serverHint = toolName.split('__')[1]; // mcp__filesystem__ -> filesystem
      const matchingServer = Array.from(this.servers.keys()).find(name => 
        name.includes(serverHint)
      );
      if (matchingServer) {
        logger.debug(`Routing ${toolName} to MCP server: ${matchingServer}`);
        return matchingServer;
      }
    }

    // フォールバック: デフォルトサーバーを使用
    const defaultServer = this.getDefaultServer();
    logger.debug(`Routing ${toolName} to default server: ${defaultServer}`);
    return defaultServer;
  }

  private getDefaultServer(): string {
    const serverNames = Array.from(this.servers.keys());
    if (serverNames.length === 0) {
      throw new Error('利用可能なMCPServerがありnot');
    }
    return serverNames[0] || '';
  }

  async shutdown(): Promise<void> {
    logger.info('MCPServerをシャットダウン中...');

    // すべてのクライアントをDisconnect
    for (const [name, client] of this.servers) {
      try {
        await client.disconnect();
      } catch (error) {
        logger.error(`クライアントのDisconnectにFailed: ${name}`, error);
      }
    }

    // すべてのプロセスをExit
    for (const [name, process] of this.processes) {
      try {
        process.kill('SIGTERM');
        logger.info(`プロセスをExitdone: ${name}`);
      } catch (error) {
        logger.error(`プロセスのExitにFailed: ${name}`, error);
      }
    }

    this.servers.clear();
    this.processes.clear();
    this.tools.clear();
  }

  async restartServer(serverName: string): Promise<void> {
    const serverConfig = this.config.mcpServers?.find((s) => s.name === serverName);
    if (!serverConfig) {
      throw new Error(`ServerConfignot found: ${serverName}`);
    }

    // 既存のServerを停止
    const client = this.servers.get(serverName);
    if (client) {
      await client.disconnect();
      this.servers.delete(serverName);
    }

    const process = this.processes.get(serverName);
    if (process) {
      process.kill('SIGTERM');
      this.processes.delete(serverName);
    }

    // Serverを再起動
    await this.startServer(serverConfig);
  }

  getServerStatus(): Map<string, boolean> {
    const status = new Map<string, boolean>();
    for (const [name, client] of this.servers) {
      status.set(name, client.isConnected());
    }
    return status;
  }

  /**
   * MCPConfigのGet
   */
  getMCPConfig() {
    return { ...this.mcpConfig };
  }

  /**
   * MCPConfigのUpdate
   */
  updateMCPConfig(newConfig: Partial<typeof this.mcpConfig>): void {
    this.mcpConfig = { ...this.mcpConfig, ...newConfig };
    logger.info('MCPConfigをUpdatedone:', this.mcpConfig);
  }

  /**
   * サーバーの初期化状態を更新
   */
  private updateServerStatus(
    serverName: string,
    status: 'pending' | 'connecting' | 'initializing' | 'listing-tools' | 'completed' | 'failed',
    error?: string,
    toolCount?: number
  ): void {
    const currentStatus = this.initializationStatus.get(serverName);
    if (!currentStatus) return;

    const updatedStatus = {
      ...currentStatus,
      status,
      error,
      toolCount,
      ...(status === 'connecting' && { startedAt: new Date() }),
      ...(status === 'completed' || status === 'failed' && { completedAt: new Date() }),
    };

    this.initializationStatus.set(serverName, updatedStatus);
    this.emit('server-status-updated', { serverName, status: updatedStatus });
  }

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
  } {
    const servers = Array.from(this.initializationStatus.entries()).map(([name, status]) => {
      const duration = status.startedAt && status.completedAt
        ? status.completedAt.getTime() - status.startedAt.getTime()
        : undefined;

      return {
        name,
        type: status.type,
        status: status.status,
        error: status.error,
        startedAt: status.startedAt,
        completedAt: status.completedAt,
        toolCount: status.toolCount,
        duration,
      };
    });

    const completed = servers.filter(s => s.status === 'completed').length;
    const failed = servers.filter(s => s.status === 'failed').length;

    return {
      isInitializing: this.isInitializing,
      total: servers.length,
      completed,
      failed,
      servers,
    };
  }

  /**
   * 初期化が完了しているかチェック
   */
  isInitializationCompleted(): boolean {
    return !this.isInitializing && this.initializationStatus.size > 0;
  }
}

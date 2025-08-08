import { spawn, type ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import type { Config, MCPServerConfig } from '../types/config.js';
import { logger } from '../utils/logger.js';
import { MCPClient } from './client.js';

export interface Tool {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

export class MCPManager extends EventEmitter {
  private config: import('../types/config.js').Config;
  private servers: Map<string, MCPClient> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private tools: Map<string, Tool> = new Map();
  private mcpConfig: {
    timeout: number;
    maxRetries: number;
    enabled: boolean;
  };

  constructor(config: import('../types/config.js').Config) {
    super();
    this.config = config;

    // MCPConfigを抽出（統一Configまたは従来Configから）
    this.mcpConfig = {
      timeout: 120000, // デフォルト2minutes for MCP operations
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

    logger.info('Initializing MCP servers...');

    for (const serverConfig of this.config.mcpServers) {
      try {
        await this.startServer(serverConfig);
      } catch (error) {
        logger.error(`Failed to start MCP server: ${serverConfig.name}`, error);
      }
    }
  }

  private async startServer(serverConfig: MCPServerConfig): Promise<void> {
    logger.info(`Starting MCP server: ${serverConfig.name}`);

    // プロセスを起動
    const childProcess = spawn(serverConfig.command, serverConfig.args || [], {
      env: { ...process.env, ...serverConfig.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.processes.set(serverConfig.name, childProcess);

    // MCPクライアントを作成（統一Configを使用）
    const client = new MCPClient(serverConfig.name, {
      timeout: this.mcpConfig.timeout,
      maxRetries: this.mcpConfig.maxRetries,
    });

    await client.connect(childProcess);
    this.servers.set(serverConfig.name, client);

    // ToolをGet - forEach + asyncの問題を修正：for...ofループを使用
    const tools = await client.listTools();
    for (const tool of tools) {
      this.tools.set(`${serverConfig.name}:${tool.name}`, tool);
    }

    logger.info(`MCP server started: ${serverConfig.name} (${tools.length} tools)`);
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
      : [this.getDefaultServer(), toolName];

    const client = this.servers.get(serverName || '');
    if (!client) {
      throw new Error(`MCPServernot found: ${serverName || 'デフォルト'}`);
    }

    return client.invokeTool(name || '', params);
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
}

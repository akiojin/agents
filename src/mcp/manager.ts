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
  private config: Config;
  private servers: Map<string, MCPClient> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private tools: Map<string, Tool> = new Map();

  constructor(config: Config) {
    super();
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (!this.config.useMCP || !this.config.mcpServers) {
      logger.info('MCPは無効化されています');
      return;
    }

    logger.info('MCPサーバーを初期化中...');

    for (const serverConfig of this.config.mcpServers) {
      try {
        await this.startServer(serverConfig);
      } catch (error) {
        logger.error(`MCPサーバーの起動に失敗: ${serverConfig.name}`, error);
      }
    }
  }

  private async startServer(serverConfig: MCPServerConfig): Promise<void> {
    logger.info(`MCPサーバーを起動中: ${serverConfig.name}`);

    // プロセスを起動
    const childProcess = spawn(serverConfig.command, serverConfig.args || [], {
      env: { ...process.env, ...serverConfig.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.processes.set(serverConfig.name, childProcess);

    // MCPクライアントを作成
    const client = new MCPClient(serverConfig.name);
    await client.connect(childProcess);
    this.servers.set(serverConfig.name, client);

    // ツールを取得
    const tools = await client.listTools();
    tools.forEach((tool) => {
      this.tools.set(`${serverConfig.name}:${tool.name}`, tool);
    });

    logger.info(`MCPサーバーが起動しました: ${serverConfig.name} (${tools.length}個のツール)`);
  }

  async listTools(): Promise<Tool[]> {
    return Array.from(this.tools.values());
  }

  async invokeTool(toolName: string, params?: Record<string, unknown>): Promise<unknown> {
    const [serverName, name] = toolName.includes(':')
      ? toolName.split(':', 2)
      : [this.getDefaultServer(), toolName];

    const client = this.servers.get(serverName || '');
    if (!client) {
      throw new Error(`MCPサーバーが見つかりません: ${serverName || 'デフォルト'}`);
    }

    return client.invokeTool(name || '', params);
  }

  private getDefaultServer(): string {
    const serverNames = Array.from(this.servers.keys());
    if (serverNames.length === 0) {
      throw new Error('利用可能なMCPサーバーがありません');
    }
    return serverNames[0] || '';
  }

  async shutdown(): Promise<void> {
    logger.info('MCPサーバーをシャットダウン中...');

    // すべてのクライアントを切断
    for (const [name, client] of this.servers) {
      try {
        await client.disconnect();
      } catch (error) {
        logger.error(`クライアントの切断に失敗: ${name}`, error);
      }
    }

    // すべてのプロセスを終了
    for (const [name, process] of this.processes) {
      try {
        process.kill('SIGTERM');
        logger.info(`プロセスを終了しました: ${name}`);
      } catch (error) {
        logger.error(`プロセスの終了に失敗: ${name}`, error);
      }
    }

    this.servers.clear();
    this.processes.clear();
    this.tools.clear();
  }

  async restartServer(serverName: string): Promise<void> {
    const serverConfig = this.config.mcpServers?.find((s) => s.name === serverName);
    if (!serverConfig) {
      throw new Error(`サーバー設定が見つかりません: ${serverName}`);
    }

    // 既存のサーバーを停止
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

    // サーバーを再起動
    await this.startServer(serverConfig);
  }

  getServerStatus(): Map<string, boolean> {
    const status = new Map<string, boolean>();
    for (const [name, client] of this.servers) {
      status.set(name, client.isConnected());
    }
    return status;
  }
}

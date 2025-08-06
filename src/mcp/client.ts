import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import * as jsonrpc from 'jsonrpc-lite';
import { logger } from '../utils/logger.js';
import type { Tool } from './manager.js';

export class MCPClient extends EventEmitter {
  private name: string;
  private process: ChildProcess | null = null;
  private connected: boolean = false;
  private requestId: number = 0;
  private pendingRequests: Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();

  constructor(name: string) {
    super();
    this.name = name;
  }

  async connect(process: ChildProcess): Promise<void> {
    this.process = process;
    
    // stdout からのデータを処理
    if (process.stdout) {
      process.stdout.on('data', (data) => {
        this.handleData(data.toString());
      });
    }

    // stderr からのエラーを処理
    if (process.stderr) {
      process.stderr.on('data', (data) => {
        logger.error(`MCPサーバーエラー [${this.name}]:`, data.toString());
      });
    }

    // プロセス終了を処理
    process.on('exit', (code) => {
      logger.info(`MCPサーバー終了 [${this.name}]: code=${code}`);
      this.connected = false;
      this.emit('disconnected');
    });

    // 初期化リクエストを送信
    await this.initialize();
    this.connected = true;
  }

  private async initialize(): Promise<void> {
    const response = await this.sendRequest('initialize', {
      protocolVersion: '1.0',
      clientInfo: {
        name: '@akiojin/agents',
        version: '0.1.0',
      },
    });
    
    logger.info(`MCPサーバー初期化完了 [${this.name}]:`, response);
  }

  private handleData(data: string): void {
    try {
      // 改行で分割して各JSONを処理
      const lines = data.split('\n').filter((line) => line.trim());
      
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const message = jsonrpc.parseObject(parsed);
          
          if (message.type === 'success' || message.type === 'error') {
            // レスポンスの処理
            const id = message.payload.id;
            const pending = this.pendingRequests.get(id);
            
            if (pending) {
              if (message.type === 'success') {
                pending.resolve(message.payload.result);
              } else {
                pending.reject(new Error(message.payload.error?.message || 'Unknown error'));
              }
              this.pendingRequests.delete(id);
            }
          } else if (message.type === 'notification') {
            // 通知の処理
            this.emit('notification', message.payload);
          }
        } catch (error) {
          logger.debug(`JSONパースエラー [${this.name}]:`, error);
        }
      }
    } catch (error) {
      logger.error(`データ処理エラー [${this.name}]:`, error);
    }
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.process || !this.process.stdin) {
      throw new Error('MCPサーバーが接続されていません');
    }

    const id = ++this.requestId;
    const request = jsonrpc.request(id, method, params);
    const json = JSON.stringify(request) + '\n';

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      // タイムアウト設定
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`リクエストタイムアウト: ${method}`));
      }, 30000);

      // リクエスト送信
      this.process!.stdin!.write(json, (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // レスポンスが返ってきたらタイムアウトをクリア
      const originalResolve = this.pendingRequests.get(id)?.resolve;
      if (originalResolve) {
        this.pendingRequests.set(id, {
          resolve: (value) => {
            clearTimeout(timeout);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timeout);
            reject(error);
          },
        });
      }
    });
  }

  async listTools(): Promise<Tool[]> {
    try {
      const response = await this.sendRequest('tools/list') as { tools: Tool[] };
      return response.tools || [];
    } catch (error) {
      logger.error(`ツールリスト取得エラー [${this.name}]:`, error);
      return [];
    }
  }

  async invokeTool(name: string, params?: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.sendRequest('tools/call', {
        name,
        arguments: params,
      });
    } catch (error) {
      logger.error(`ツール実行エラー [${this.name}/${name}]:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      try {
        // 終了通知を送信
        await this.sendRequest('shutdown');
      } catch (error) {
        logger.debug('シャットダウンリクエストエラー:', error);
      }
      
      // プロセスを終了
      this.process.kill('SIGTERM');
      this.process = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return this.name;
  }
}
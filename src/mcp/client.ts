import { EventEmitter } from 'events';
import type { ChildProcess } from 'child_process';
import * as jsonrpc from 'jsonrpc-lite';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import type { Tool } from './manager.js';

export class MCPClient extends EventEmitter {
  private name: string;
  private process: ChildProcess | null = null;
  private connected: boolean = false;
  private requestId: number = 0;
  private pendingRequests: Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  > = new Map();
  private timeout: number;
  private maxRetries: number;

  constructor(name: string, options: { timeout?: number; maxRetries?: number } = {}) {
    super();
    this.name = name;
    this.timeout = options.timeout || 30000; // デフォルト30seconds
    this.maxRetries = options.maxRetries || 2; // デフォルト2回Retry
  }

  async connect(process: ChildProcess): Promise<void> {
    try {
      this.process = process;

      // stdout からのデータをProcessing
      if (process.stdout) {
        process.stdout.on('data', (data) => {
          try {
            this.handleData(data.toString());
          } catch (error) {
            logger.error(`データProcessingError [${this.name}]:`, error);
            // データProcessingErrorでもプロセス全体をExitさせない
          }
        });
      }

      // stderr からのErrorをProcessing
      if (process.stderr) {
        process.stderr.on('data', (data) => {
          logger.error(`MCPServerError [${this.name}]:`, data.toString());
        });
      }

      // プロセスExitをProcessing
      process.on('exit', (code) => {
        logger.info(`MCPServerExit [${this.name}]: code=${code}`);
        this.connected = false;
        this.emit('disconnected');
      });

      // Errorイベントをキャッチ
      process.on('error', (error) => {
        logger.error(`MCPプロセスError [${this.name}]:`, error);
        this.connected = false;
        this.emit('error', error);
      });

      // InitializeRequestをSend
      await this.initialize();
      this.connected = true;
    } catch (error) {
      logger.error(`MCPConnectionError [${this.name}]:`, error);
      this.connected = false;
      // ErrorをラップしてDetailsInfoを追加
      throw new Error(`MCPServer [${this.name}] Failed to connect to: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async initialize(): Promise<void> {
    try {
      const response = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {}
        },
        clientInfo: {
          name: '@akiojin/agents',
          version: '0.1.0',
        },
      });

      logger.info(`MCPServerInitializeCompleted [${this.name}]:`, response);
      
      // Send initialized notification
      await this.sendNotification('notifications/initialized', {});
    } catch (error) {
      logger.error(`MCPInitializeError [${this.name}]:`, error);
      // InitializeErrorはConnectionErrorとして扱う
      throw new Error(`MCPServer [${this.name}] Initialize failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private handleData(data: string): void {
    try {
      // 改行でminutes割して各JSONをProcessing
      const lines = data.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const message = jsonrpc.parseObject(parsed);

          if (message.type === 'success' || message.type === 'error') {
            // ResponseのProcessing
            const id = message.payload.id;
            const pending = id !== null ? this.pendingRequests.get(id) : undefined;

            if (pending) {
              if (message.type === 'success') {
                pending.resolve(message.payload.result);
              } else {
                const errorMessage = message.payload.error?.message || 'Unknown error';
                const errorCode = message.payload.error?.code || -1;
                logger.error(`MCPErrorResponse [${this.name}]:`, { errorMessage, errorCode });
                pending.reject(new Error(`MCP Error (${errorCode}): ${errorMessage}`));
              }
              if (id !== null) this.pendingRequests.delete(id);
            } else {
              logger.warn(`未ProcessingのResponse [${this.name}]:`, message);
            }
          } else if (message.type === 'notification') {
            // 通知のProcessing
            try {
              this.emit('notification', message.payload);
            } catch (error) {
              logger.error(`通知ProcessingError [${this.name}]:`, error);
            }
          } else {
            logger.warn(`不明なMessageタイプ [${this.name}]:`, message.type);
          }
        } catch (parseError) {
          logger.debug(`JSON解析Error [${this.name}] (行: "${line.substring(0, 100)}..."):`, parseError);
          // items別の行の解析Errorは続行可能
        }
      }
    } catch (error) {
      logger.error(`データProcessingError [${this.name}]:`, error);
      // データProcessingErrorはConnectionをDisconnectしない
    }
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    // Retry付きでRequestSend
    const result = await withRetry(
      async () => {
        return new Promise((resolve, reject) => {
          try {
            if (!this.process || !this.process.stdin) {
              reject(new Error(`MCPServer [${this.name}] がConnectionnot initialized`));
              return;
            }

            const id = ++this.requestId;
            const request = jsonrpc.request(id, method, params as any);
            const json = JSON.stringify(request) + '\n';

            // Requestを記録
            this.pendingRequests.set(id, { resolve, reject });

            // TimeoutConfig（Config値を使用）
            const timeout = setTimeout(() => {
              if (id !== null) this.pendingRequests.delete(id);
              reject(new Error(`RequestTimeout [${this.name}/${method}]: ${this.timeout}ミリsecondsを超えました`));
            }, this.timeout);

            // RequestSend
            this.process!.stdin!.write(json, (error) => {
              if (error) {
                clearTimeout(timeout);
                if (id !== null) this.pendingRequests.delete(id);
                logger.error(`RequestSendError [${this.name}/${method}]:`, error);
                reject(new Error(`RequestSendにFaileddone [${this.name}/${method}]: ${error.message}`));
                return;
              }

              // RequestSendSuccess時のデバッグログ
              logger.debug(`RequestSendCompleted [${this.name}/${method}]`);
            });

            // Responseが返ってきたらTimeoutをcleared
            const originalResolve = resolve;
            const originalReject = reject;
            
            this.pendingRequests.set(id, {
              resolve: (value) => {
                clearTimeout(timeout);
                originalResolve(value);
              },
              reject: (error) => {
                clearTimeout(timeout);
                originalReject(error);
              },
            });

          } catch (error) {
            logger.error(`Request準備Error [${this.name}/${method}]:`, error);
            reject(new Error(`Requestの準備にFaileddone [${this.name}/${method}]: ${error instanceof Error ? error.message : String(error)}`));
          }
        });
      },
      {
        maxRetries: this.maxRetries,
        delay: 1000,
        exponentialBackoff: true,
        timeout: this.timeout,
        shouldRetry: this.isRetryableError.bind(this),
      }
    );

    if (!result.success) {
      logger.error(`MCPRequestError after retries [${this.name}/${method}]:`, result.error);
      throw result.error!;
    }

    return result.result!;
  }

  private async sendNotification(method: string, params?: unknown): Promise<void> {
    try {
      if (!this.process || !this.process.stdin) {
        throw new Error(`MCPServer [${this.name}] Connection not initialized`);
      }

      const notification = jsonrpc.notification(method, params as any);
      const json = JSON.stringify(notification) + '\n';

      this.process.stdin.write(json, (error) => {
        if (error) {
          logger.error(`NotificationSendError [${this.name}/${method}]:`, error);
        } else {
          logger.debug(`NotificationSent [${this.name}/${method}]`);
        }
      });
    } catch (error) {
      logger.error(`SendNotificationError [${this.name}/${method}]:`, error);
    }
  }

  async listTools(): Promise<Tool[]> {
    try {
      // ConnectionCheck
      if (!this.connected) {
        logger.warn(`MCPServer [${this.name}] が未Connectionです`);
        return [];
      }

      const response = (await this.sendRequest('tools/list')) as { tools: Tool[] };
      
      // ResponseValidation
      if (!response || typeof response !== 'object') {
        logger.warn(`無効なResponse形式 [${this.name}]:`, response);
        return [];
      }

      const tools = response.tools || [];
      logger.debug(`ToolリストGetCompleted [${this.name}]: ${tools.length}itemsのTool`);
      
      return tools;
    } catch (error) {
      logger.error(`ToolリストGetError [${this.name}]:`, error);
      
      // ErrorのDetails化
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          logger.warn(`ToolリストGetがtimed out [${this.name}]`);
        } else if (error.message.includes('not found')) {
          logger.warn(`Toolリストエンドポイントnot found [${this.name}]`);
        }
      }

      // Error時は空配列を返してアプリケーションを継続
      return [];
    }
  }

  async invokeTool(name: string, params?: Record<string, unknown>): Promise<unknown> {
    const { globalProgressReporter } = await import('../ui/progress.js');
    
    // 基本的なValidation
    if (!name || name.trim().length === 0) {
      globalProgressReporter.showError('Tool名が指定not initialized');
      throw new Error('Tool名が指定not initialized');
    }

    // ConnectionCheck
    if (!this.connected) {
      globalProgressReporter.showError(`MCPServer [${this.name}] がConnectionnot initialized`);
      throw new Error(`MCPServer [${this.name}] がConnectionnot initialized`);
    }

    // プロセスStatusCheck
    if (!this.process || this.process.killed) {
      globalProgressReporter.showError(`MCPServer [${this.name}] のプロセスが無効です`);
      throw new Error(`MCPServer [${this.name}] のプロセスが無効です`);
    }

    // プログレス表示Started
    globalProgressReporter.startTask(
      `MCPToolExecute: ${name}`,
      ['ConnectionCheck', 'ToolExecute', 'ResponseValidation']
    );

    logger.debug(`ToolExecuteStarted [${this.name}/${name}]:`, { params });
    
    try {
      // ConnectionCheckCompleted
      globalProgressReporter.updateSubtask(0);
      
      // ToolExecute
      globalProgressReporter.updateSubtask(1);
      globalProgressReporter.showInfo(`${this.name}Serverで${name}ToolをExecute中...`);

      // Retry付きでToolExecute
      const result = await withRetry(
        async () => {
          // ToolExecuteRequest
          const result = await this.sendRequest('tools/call', {
            name: name.trim(),
            arguments: params || {},
          });

          // ResultValidation
          if (result === undefined || result === null) {
            logger.warn(`ToolExecuteResultが空です [${this.name}/${name}]`);
            return { error: false, message: 'ToolExecuteはSuccessdoneが、Resultは空でした', result: null };
          }

          return result;
        },
        {
          maxRetries: this.maxRetries,
          delay: 1000,
          exponentialBackoff: true,
          timeout: this.timeout,
          shouldRetry: this.isRetryableError.bind(this),
        }
      );

      // ResponseValidation
      globalProgressReporter.updateSubtask(2);

      if (!result.success) {
        logger.error(`ToolExecuteError after retries [${this.name}/${name}]:`, result.error);
        globalProgressReporter.completeTask(false);

        // ErrorのDetails化とFallback
        let errorMessage = 'ToolExecute中にErroroccurreddone';
        let shouldRetry = false;
        const error = result.error!;

        if (error instanceof Error) {
          if (error.message.includes('timeout')) {
            errorMessage = `ToolExecuteTimeout: ${name} (${this.timeout}ミリsecondsを超えました)`;
          } else if (error.message.includes('not found') || error.message.includes('unknown')) {
            errorMessage = `Toolnot found: ${name}`;
          } else if (error.message.includes('permission') || error.message.includes('unauthorized')) {
            errorMessage = `ToolExecute権限がありnot: ${name}`;
          } else if (error.message.includes('connection') || error.message.includes('disconnect')) {
            errorMessage = `ConnectionError: MCPServer [${this.name}] との通信にFaileddone`;
            shouldRetry = true;
          } else if (error.message.includes('invalid') || error.message.includes('argument')) {
            errorMessage = `無効なArguments: ${name}`;
          } else {
            errorMessage = `ToolExecuteError: ${error.message}`;
          }
        }

        globalProgressReporter.showError(errorMessage);

        // FallbackResultを返す（アプリケーションクラッシュを防止）
        const fallbackResult = {
          error: true,
          message: errorMessage,
          toolName: name,
          serverName: this.name,
          canRetry: shouldRetry,
          originalError: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
          attemptCount: result.attemptCount,
          totalTime: result.totalTime,
        };

        // 重大なErrorの場合のみ例外を投げる、それ以外はFallbackResultを返す
        if (error instanceof Error && error.message.includes('Critical')) {
          throw error;
        }

        return fallbackResult;
      }

      globalProgressReporter.completeTask(true);
      globalProgressReporter.showInfo(`ToolExecuteCompleted: ${name} (試行回数: ${result.attemptCount}, 所要時間: ${result.totalTime}ms)`);
      
      logger.debug(`ToolExecuteCompleted [${this.name}/${name}]`, {
        attemptCount: result.attemptCount,
        totalTime: result.totalTime,
      });
      
      return result.result!;
    } catch (error) {
      globalProgressReporter.completeTask(false);
      globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.process) {
        try {
          // 保留中のRequestをCleanup
          const pendingCount = this.pendingRequests.size;
          if (pendingCount > 0) {
            logger.info(`保留中のRequestをCancel中 [${this.name}]: ${pendingCount}items`);
            
            // 保留中のRequestにErrorを返す
            for (const [id, { reject }] of this.pendingRequests) {
              reject(new Error(`MCPServer [${this.name}] がDisconnectされたため、RequestがCancelさed`));
            }
            this.pendingRequests.clear();
          }

          // Exit通知をSend（Timeout付き）
          const shutdownPromise = this.sendRequest('shutdown');
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Shutdown timeout')), 5000)
          );

          await Promise.race([shutdownPromise, timeoutPromise]);
          logger.debug(`シャットダウンRequestSendCompleted [${this.name}]`);

        } catch (shutdownError) {
          logger.debug(`シャットダウンRequestError [${this.name}]:`, shutdownError);
          // シャットダウンErrorは無視して続行
        }

        // プロセスをExit
        try {
          if (!this.process.killed) {
            this.process.kill('SIGTERM');
            
            // プロセスExitを少し待つ
            await new Promise<void>((resolve) => {
              const timeout = setTimeout(() => {
                if (this.process && !this.process.killed) {
                  logger.warn(`強制ExitをExecute中 [${this.name}]`);
                  this.process.kill('SIGKILL');
                }
                resolve();
              }, 3000);

              if (this.process) {
                this.process.on('exit', () => {
                  clearTimeout(timeout);
                  resolve();
                });
              } else {
                clearTimeout(timeout);
                resolve();
              }
            });
          }
        } catch (killError) {
          logger.error(`プロセスExitError [${this.name}]:`, killError);
          // プロセスExitErrorも続行
        }

        this.process = null;
        this.connected = false;
        logger.info(`MCPDisconnectCompleted [${this.name}]`);
      }
    } catch (error) {
      logger.error(`MCPDisconnectError [${this.name}]:`, error);
      // DisconnectErrorでもStatusをリセット
      this.process = null;
      this.connected = false;
      this.pendingRequests.clear();
      
      // DisconnectErrorは致命的ではないので例外を投げない
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return this.name;
  }

  getTimeout(): number {
    return this.timeout;
  }

  getMaxRetries(): number {
    return this.maxRetries;
  }

  /**
   * MCPのErrorがRetry可能かを判定
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // Timeout、ConnectionErrorはRetry可能
      if (message.includes('timeout') ||
          message.includes('connection') ||
          message.includes('disconnect') ||
          message.includes('network') ||
          message.includes('econnrefused') ||
          message.includes('enotfound')) {
        return true;
      }

      // MCP特有のError
      if (message.includes('server not responding') ||
          message.includes('communication error') ||
          message.includes('temporary')) {
        return true;
      }

      // 権限Errorや見つからないErrorはRetryしない
      if (message.includes('not found') ||
          message.includes('permission') ||
          message.includes('unauthorized') ||
          message.includes('invalid')) {
        return false;
      }
    }

    return false;
  }
}

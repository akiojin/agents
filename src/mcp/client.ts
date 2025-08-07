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
  private pendingRequests: Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
    }
  > = new Map();

  constructor(name: string) {
    super();
    this.name = name;
  }

  async connect(process: ChildProcess): Promise<void> {
    try {
      this.process = process;

      // stdout からのデータを処理
      if (process.stdout) {
        process.stdout.on('data', (data) => {
          try {
            this.handleData(data.toString());
          } catch (error) {
            logger.error(`データ処理エラー [${this.name}]:`, error);
            // データ処理エラーでもプロセス全体を終了させない
          }
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

      // エラーイベントをキャッチ
      process.on('error', (error) => {
        logger.error(`MCPプロセスエラー [${this.name}]:`, error);
        this.connected = false;
        this.emit('error', error);
      });

      // 初期化リクエストを送信
      await this.initialize();
      this.connected = true;
    } catch (error) {
      logger.error(`MCP接続エラー [${this.name}]:`, error);
      this.connected = false;
      // エラーをラップして詳細情報を追加
      throw new Error(`MCPサーバー [${this.name}] への接続に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async initialize(): Promise<void> {
    try {
      const response = await this.sendRequest('initialize', {
        protocolVersion: '1.0',
        clientInfo: {
          name: '@akiojin/agents',
          version: '0.1.0',
        },
      });

      logger.info(`MCPサーバー初期化完了 [${this.name}]:`, response);
    } catch (error) {
      logger.error(`MCP初期化エラー [${this.name}]:`, error);
      // 初期化エラーは接続エラーとして扱う
      throw new Error(`MCPサーバー [${this.name}] の初期化に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    }
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
            const pending = id !== null ? this.pendingRequests.get(id) : undefined;

            if (pending) {
              if (message.type === 'success') {
                pending.resolve(message.payload.result);
              } else {
                const errorMessage = message.payload.error?.message || 'Unknown error';
                const errorCode = message.payload.error?.code || -1;
                logger.error(`MCPエラーレスポンス [${this.name}]:`, { errorMessage, errorCode });
                pending.reject(new Error(`MCP Error (${errorCode}): ${errorMessage}`));
              }
              if (id !== null) this.pendingRequests.delete(id);
            } else {
              logger.warn(`未処理のレスポンス [${this.name}]:`, message);
            }
          } else if (message.type === 'notification') {
            // 通知の処理
            try {
              this.emit('notification', message.payload);
            } catch (error) {
              logger.error(`通知処理エラー [${this.name}]:`, error);
            }
          } else {
            logger.warn(`不明なメッセージタイプ [${this.name}]:`, message.type);
          }
        } catch (parseError) {
          logger.debug(`JSON解析エラー [${this.name}] (行: "${line.substring(0, 100)}..."):`, parseError);
          // 個別の行の解析エラーは続行可能
        }
      }
    } catch (error) {
      logger.error(`データ処理エラー [${this.name}]:`, error);
      // データ処理エラーは接続を切断しない
    }
  }

  private async sendRequest(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      try {
        if (!this.process || !this.process.stdin) {
          reject(new Error(`MCPサーバー [${this.name}] が接続されていません`));
          return;
        }

        const id = ++this.requestId;
        const request = jsonrpc.request(id, method, params as any);
        const json = JSON.stringify(request) + '\n';

        // リクエストを記録
        this.pendingRequests.set(id, { resolve, reject });

        // タイムアウト設定
        const timeout = setTimeout(() => {
          if (id !== null) this.pendingRequests.delete(id);
          reject(new Error(`リクエストタイムアウト [${this.name}/${method}]: 30秒を超えました`));
        }, 30000);

        // リクエスト送信
        this.process!.stdin!.write(json, (error) => {
          if (error) {
            clearTimeout(timeout);
            if (id !== null) this.pendingRequests.delete(id);
            logger.error(`リクエスト送信エラー [${this.name}/${method}]:`, error);
            reject(new Error(`リクエスト送信に失敗しました [${this.name}/${method}]: ${error.message}`));
            return;
          }

          // リクエスト送信成功時のデバッグログ
          logger.debug(`リクエスト送信完了 [${this.name}/${method}]`);
        });

        // レスポンスが返ってきたらタイムアウトをクリア
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
        logger.error(`リクエスト準備エラー [${this.name}/${method}]:`, error);
        reject(new Error(`リクエストの準備に失敗しました [${this.name}/${method}]: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  async listTools(): Promise<Tool[]> {
    try {
      // 接続確認
      if (!this.connected) {
        logger.warn(`MCPサーバー [${this.name}] が未接続です`);
        return [];
      }

      const response = (await this.sendRequest('tools/list')) as { tools: Tool[] };
      
      // レスポンス検証
      if (!response || typeof response !== 'object') {
        logger.warn(`無効なレスポンス形式 [${this.name}]:`, response);
        return [];
      }

      const tools = response.tools || [];
      logger.debug(`ツールリスト取得完了 [${this.name}]: ${tools.length}個のツール`);
      
      return tools;
    } catch (error) {
      logger.error(`ツールリスト取得エラー [${this.name}]:`, error);
      
      // エラーの詳細化
      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          logger.warn(`ツールリスト取得がタイムアウトしました [${this.name}]`);
        } else if (error.message.includes('not found')) {
          logger.warn(`ツールリストエンドポイントが見つかりません [${this.name}]`);
        }
      }

      // エラー時は空配列を返してアプリケーションを継続
      return [];
    }
  }

  async invokeTool(name: string, params?: Record<string, unknown>): Promise<unknown> {
    try {
      // 基本的な検証
      if (!name || name.trim().length === 0) {
        throw new Error('ツール名が指定されていません');
      }

      // 接続確認
      if (!this.connected) {
        throw new Error(`MCPサーバー [${this.name}] が接続されていません`);
      }

      // プロセス状態確認
      if (!this.process || this.process.killed) {
        throw new Error(`MCPサーバー [${this.name}] のプロセスが無効です`);
      }

      logger.debug(`ツール実行開始 [${this.name}/${name}]:`, { params });

      // ツール実行リクエスト
      const result = await this.sendRequest('tools/call', {
        name: name.trim(),
        arguments: params || {},
      });

      // 結果検証
      if (result === undefined || result === null) {
        logger.warn(`ツール実行結果が空です [${this.name}/${name}]`);
        return { error: false, message: 'ツール実行は成功しましたが、結果は空でした', result: null };
      }

      logger.debug(`ツール実行完了 [${this.name}/${name}]`);
      return result;

    } catch (error) {
      logger.error(`ツール実行エラー [${this.name}/${name}]:`, error);

      // エラーの詳細化とフォールバック
      let errorMessage = 'ツール実行中にエラーが発生しました';
      let shouldRetry = false;

      if (error instanceof Error) {
        if (error.message.includes('timeout')) {
          errorMessage = `ツール実行タイムアウト: ${name} (30秒を超えました)`;
        } else if (error.message.includes('not found') || error.message.includes('unknown')) {
          errorMessage = `ツールが見つかりません: ${name}`;
        } else if (error.message.includes('permission') || error.message.includes('unauthorized')) {
          errorMessage = `ツール実行権限がありません: ${name}`;
        } else if (error.message.includes('connection') || error.message.includes('disconnect')) {
          errorMessage = `接続エラー: MCPサーバー [${this.name}] との通信に失敗しました`;
          shouldRetry = true;
        } else if (error.message.includes('invalid') || error.message.includes('argument')) {
          errorMessage = `無効な引数: ${name}`;
        } else {
          errorMessage = `ツール実行エラー: ${error.message}`;
        }
      }

      // フォールバック結果を返す（アプリケーションクラッシュを防止）
      const fallbackResult = {
        error: true,
        message: errorMessage,
        toolName: name,
        serverName: this.name,
        canRetry: shouldRetry,
        originalError: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      };

      // 重大なエラーの場合のみ例外を投げる、それ以外はフォールバック結果を返す
      if (error instanceof Error && error.message.includes('Critical')) {
        throw error;
      }

      return fallbackResult;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.process) {
        try {
          // 保留中のリクエストをクリーンアップ
          const pendingCount = this.pendingRequests.size;
          if (pendingCount > 0) {
            logger.info(`保留中のリクエストをキャンセル中 [${this.name}]: ${pendingCount}件`);
            
            // 保留中のリクエストにエラーを返す
            for (const [id, { reject }] of this.pendingRequests) {
              reject(new Error(`MCPサーバー [${this.name}] が切断されたため、リクエストがキャンセルされました`));
            }
            this.pendingRequests.clear();
          }

          // 終了通知を送信（タイムアウト付き）
          const shutdownPromise = this.sendRequest('shutdown');
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Shutdown timeout')), 5000)
          );

          await Promise.race([shutdownPromise, timeoutPromise]);
          logger.debug(`シャットダウンリクエスト送信完了 [${this.name}]`);

        } catch (shutdownError) {
          logger.debug(`シャットダウンリクエストエラー [${this.name}]:`, shutdownError);
          // シャットダウンエラーは無視して続行
        }

        // プロセスを終了
        try {
          if (!this.process.killed) {
            this.process.kill('SIGTERM');
            
            // プロセス終了を少し待つ
            await new Promise<void>((resolve) => {
              const timeout = setTimeout(() => {
                if (this.process && !this.process.killed) {
                  logger.warn(`強制終了を実行中 [${this.name}]`);
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
          logger.error(`プロセス終了エラー [${this.name}]:`, killError);
          // プロセス終了エラーも続行
        }

        this.process = null;
        this.connected = false;
        logger.info(`MCP切断完了 [${this.name}]`);
      }
    } catch (error) {
      logger.error(`MCP切断エラー [${this.name}]:`, error);
      // 切断エラーでも状態をリセット
      this.process = null;
      this.connected = false;
      this.pendingRequests.clear();
      
      // 切断エラーは致命的ではないので例外を投げない
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getName(): string {
    return this.name;
  }
}

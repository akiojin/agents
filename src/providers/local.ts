import type { ChatMessage } from '../config/types.js';
import { LLMProvider, type ChatOptions, type CompletionOptions } from './base.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

interface LocalAPIRequest {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  prompt?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface LocalAPIResponse {
  choices: Array<{
    message?: { content: string };
    text?: string;
  }>;
}

export class LocalProvider extends LLMProvider {
  private providerType: 'local-gptoss' | 'local-lmstudio';

  constructor(endpoint: string = 'http://127.0.0.1:1234', providerType: 'local-gptoss' | 'local-lmstudio' = 'local-gptoss', options?: {
    timeout?: number;
    maxRetries?: number;
    temperature?: number;
    maxTokens?: number;
  }) {
    super(undefined, endpoint, options);
    this.providerType = providerType;
  }

  private async makeRequest(body: LocalAPIRequest): Promise<LocalAPIResponse> {
    // 指定されたエンドポイントを使用：http://127.0.0.1:1234
    const endpoint = `${this.endpoint}/v1/chat/completions`;

    logger.debug(`ローカルAPI リクエスト開始: ${endpoint}`, { 
      providerType: this.providerType,
      hasModel: !!body.model,
    });

    // リトライ付きでAPI呼び出し実行
    const result = await withRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
        }, this.providerOptions.timeout); // プロバイダー設定からタイムアウト値を取得

        try {
          const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': '@akiojin/agents',
            },
            body: JSON.stringify(body),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!response.ok) {
            let errorMessage = `ローカルAPI エラー: ${response.status} ${response.statusText}`;
            
            try {
              const errorBody = await response.text();
              if (errorBody) {
                errorMessage += ` - ${errorBody}`;
              }
            } catch (readError) {
              logger.debug('エラーレスポンス読み取り失敗:', readError);
            }

            // HTTPステータスコード別のエラーメッセージ
            switch (response.status) {
              case 400:
                throw new Error('無効なリクエストです。パラメータを確認してください。');
              case 401:
                throw new Error('認証が必要です。APIキーまたは設定を確認してください。');
              case 404:
                throw new Error('エンドポイントが見つかりません。サーバー設定を確認してください。');
              case 500:
                throw new Error('ローカルサーバーで内部エラーが発生しました。');
              case 502:
              case 503:
              case 504:
                throw new Error('ローカルサーバーが利用できません。サーバーの状態を確認してください。');
              default:
                throw new Error(errorMessage);
            }
          }

          // レスポンス検証
          const contentType = response.headers.get('content-type');
          if (!contentType?.includes('application/json')) {
            throw new Error(`期待されたJSONレスポンスではありません: ${contentType}`);
          }

          const result = await response.json() as LocalAPIResponse;
          
          // 基本的なレスポンス形式検証
          if (!result || typeof result !== 'object') {
            throw new Error('無効なJSONレスポンス形式です');
          }

          if (!result.choices || !Array.isArray(result.choices) || result.choices.length === 0) {
            throw new Error('レスポンスにchoicesが含まれていません');
          }

          return result;

        } catch (fetchError) {
          clearTimeout(timeout);
          
          if (fetchError instanceof Error) {
            if (fetchError.name === 'AbortError') {
              throw new Error(`ローカルAPIリクエストがタイムアウトしました（${this.providerOptions.timeout / 1000}秒）`);
            } else if (fetchError.message.includes('ECONNREFUSED')) {
              throw new Error(`ローカルサーバー（${this.endpoint}）に接続できません。サーバーが起動しているか確認してください。`);
            } else if (fetchError.message.includes('ENOTFOUND')) {
              throw new Error(`ローカルサーバーのアドレス（${this.endpoint}）が見つかりません。設定を確認してください。`);
            }
          }
          
          throw fetchError;
        }
      },
      {
        maxRetries: this.providerOptions.maxRetries,
        delay: 1000,
        exponentialBackoff: true,
        timeout: this.providerOptions.timeout,
        shouldRetry: this.isRetryableError.bind(this),
      }
    );

    if (!result.success) {
      logger.error('ローカルAPIリクエストエラー after retries:', result.error);
      throw result.error!;
    }

    logger.debug('ローカルAPIリクエスト完了', {
      attemptCount: result.attemptCount,
      totalTime: result.totalTime,
    });
    return result.result!;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    try {
      // 入力検証
      if (!messages || messages.length === 0) {
        throw new Error('メッセージが指定されていません');
      }

      // メッセージ形式の検証と変換
      const localMessages = messages.map((msg, index) => {
        if (!msg.role || !msg.content) {
          throw new Error(`無効なメッセージ形式 (インデックス: ${index})`);
        }
        
        const content = msg.content.trim();
        if (content.length === 0) {
          throw new Error(`空のメッセージ内容 (インデックス: ${index})`);
        }
        
        return {
          role: msg.role,
          content,
        };
      });

      const body: LocalAPIRequest = {
        messages: localMessages,
        temperature: Math.min(Math.max(options?.temperature || this.providerOptions.temperature || 0.7, 0), 2),
        max_tokens: Math.min(Math.max(options?.maxTokens || this.providerOptions.maxTokens || 2000, 1), 8192),
        stream: options?.stream || false,
      };

      if (options?.model) {
        body.model = options.model;
      }

      logger.debug(`ローカルプロバイダーチャット開始: ${this.providerType}`, {
        messageCount: localMessages.length,
        model: body.model,
        maxTokens: body.max_tokens,
        endpoint: this.endpoint,
      });

      const response = await this.makeRequest(body);

      // レスポンス内容を取得（OpenAI互換APIを想定）
      const content = response.choices[0]?.message?.content;

      if (!content) {
        // より詳細なエラー情報
        const choice = response.choices[0];
        if (choice?.finish_reason === 'length') {
          throw new Error('レスポンスが最大トークン数に達しました。max_tokensを増やしてください。');
        } else {
          throw new Error('ローカルAPIから空のレスポンスが返されました');
        }
      }

      const trimmedContent = content.trim();
      if (trimmedContent.length === 0) {
        throw new Error('ローカルAPIから空の内容が返されました');
      }

      logger.debug(`ローカルプロバイダーチャット完了: ${trimmedContent.length}文字`);
      return trimmedContent;

    } catch (error) {
      logger.error('Local provider chat error:', error);
      
      // エラーメッセージの改善
      if (error instanceof Error) {
        if (error.message.includes('接続できません') || error.message.includes('ECONNREFUSED')) {
          throw new Error(`ローカルサーバー（${this.endpoint}）への接続に失敗しました。サーバーが起動しているか確認してください。`);
        } else if (error.message.includes('タイムアウト')) {
          throw new Error('ローカルサーバーへのリクエストがタイムアウトしました。サーバーの負荷を確認してください。');
        }
      }
      
      throw error;
    }
  }

  async complete(options: CompletionOptions): Promise<string> {
    try {
      // 新しいOpenAI互換エンドポイントを使用
      const body: LocalAPIRequest = {
        messages: [
          {
            role: 'user',
            content: options.prompt,
          }
        ],
        temperature: options.temperature || this.providerOptions.temperature || 0.7,
        max_tokens: options.maxTokens || this.providerOptions.maxTokens || 2000,
        stream: options.stream || false,
      };

      if (options.model) {
        body.model = options.model;
      }

      logger.debug('ローカルプロバイダー completion 開始', {
        promptLength: options.prompt.length,
        model: body.model,
        endpoint: this.endpoint,
      });

      const response = await this.makeRequest(body);

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('応答が空です');
      }

      logger.debug(`ローカルプロバイダー completion 完了: ${content.length}文字`);
      return content;
    } catch (error) {
      logger.error('Local provider completion error:', error);
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      // 指定されたエンドポイントのモデルリスト
      const endpoint = `${this.endpoint}/v1/models`;
      
      logger.debug('ローカルプロバイダー モデルリスト取得開始:', endpoint);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': '@akiojin/agents',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        logger.warn(`モデルリストの取得に失敗: ${response.status} ${response.statusText}`);
        return ['local-model'];
      }

      const data = (await response.json()) as { data: Array<{ id: string }> };
      const models = data.data?.map((model) => model.id) || ['local-model'];
      
      logger.debug('ローカルプロバイダー モデルリスト取得完了:', models);
      return models;
    } catch (error) {
      logger.error('Local provider list models error:', error);
      // エラーの場合はデフォルトモデルを返す
      return ['local-model'];
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      logger.debug(`ローカルプロバイダー接続検証開始: ${this.endpoint}`);
      
      // まずモデルエンドポイントで接続確認
      try {
        const modelsController = new AbortController();
        setTimeout(() => modelsController.abort(), 5000); // 5秒タイムアウト

        const modelsResponse = await fetch(`${this.endpoint}/v1/models`, {
          method: 'GET',
          signal: modelsController.signal,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': '@akiojin/agents',
          },
        });

        if (modelsResponse.ok) {
          logger.debug('ローカルサーバー接続検証成功（/v1/models）');
          return true;
        }
        
        logger.debug(`モデルエンドポイントレスポンス: ${modelsResponse.status} ${modelsResponse.statusText}`);
      } catch (modelsError) {
        logger.debug('モデルエンドポイント接続失敗:', modelsError);
      }

      // 次にチャット completions エンドポイントで軽量テスト
      try {
        const testController = new AbortController();
        setTimeout(() => testController.abort(), 3000); // 3秒タイムアウト

        const testBody = {
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
          temperature: 0,
        };

        const testResponse = await fetch(`${this.endpoint}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': '@akiojin/agents',
          },
          body: JSON.stringify(testBody),
          signal: testController.signal,
        });

        // 200-299の範囲、または400番台（設定エラーだが接続は成功）
        if (testResponse.status < 500) {
          logger.debug(`ローカルサーバー接続検証成功（/v1/chat/completions）: ${testResponse.status}`);
          return true;
        }
        
        logger.debug(`チャット completions テスト: ${testResponse.status} ${testResponse.statusText}`);
      } catch (testError) {
        logger.debug('チャット completions テスト失敗:', testError);
      }

      // 最後の手段として基本的な接続テストを実行
      try {
        const baseController = new AbortController();
        setTimeout(() => baseController.abort(), 2000); // 2秒タイムアウト

        const baseResponse = await fetch(this.endpoint, {
          method: 'HEAD',
          signal: baseController.signal,
        });

        // ステータスコードが500未満なら接続は成功している
        if (baseResponse.status < 500) {
          logger.debug(`ローカルサーバー基本接続確認: ${baseResponse.status}`);
          return true;
        }
      } catch (baseError) {
        logger.debug('基本接続テストも失敗:', baseError);
      }

      logger.error(`ローカルプロバイダー接続検証失敗: ${this.endpoint}`);
      return false;

    } catch (error) {
      logger.error('Local provider connection validation failed:', error);
      
      // エラーログに詳細情報を記録
      if (error instanceof Error) {
        logger.error('接続検証エラー詳細:', {
          message: error.message,
          endpoint: this.endpoint,
          providerType: this.providerType,
        });
        
        if (error.message.includes('ECONNREFUSED')) {
          logger.error(`サーバー（${this.endpoint}）が起動していない可能性があります`);
        } else if (error.message.includes('ENOTFOUND')) {
          logger.error(`サーバーアドレス（${this.endpoint}）が無効な可能性があります`);
        }
      }
      
      return false;
    }
  }

  /**
   * ローカルAPIのエラーがリトライ可能かを判定
   */
  private isRetryableError(error: unknown): boolean {
    // ネットワークエラー
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('timeout') ||
          message.includes('connection') ||
          message.includes('network') ||
          message.includes('econnrefused') ||
          message.includes('enotfound') ||
          message.includes('abort')) {
        return true;
      }
    }

    // HTTPステータスコードベースの判定
    if (error && typeof error === 'object' && error !== null && 'status' in error) {
      const statusError = error as { status?: number };
      const status = statusError.status;
      // サーバーエラー（500番台）はリトライ可能
      return status !== undefined && status >= 500;
    }

    return false;
  }
}

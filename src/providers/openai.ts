import OpenAI from 'openai';
import type { ChatMessage } from '../config/types.js';
import { LLMProvider, type ChatOptions, type CompletionOptions } from './base.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(
    apiKey: string,
    model?: string,
    options?: {
      timeout?: number;
      maxRetries?: number;
      temperature?: number;
      maxTokens?: number;
    },
  ) {
    super(apiKey, undefined, options);
    this.client = new OpenAI({ apiKey });
    this.defaultModel = model || 'gpt-4-turbo-preview';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    // 入力検証
    if (!messages || messages.length === 0) {
      throw new Error('メッセージが指定されていません');
    }

    // メッセージの形式検証と変換
    const openaiMessages = messages
      .map((msg, index) => {
        if (!msg.role || !msg.content) {
          throw new Error(`無効なメッセージ形式 (インデックス: ${index})`);
        }
        return {
          role: msg.role,
          content: msg.content.trim(),
        };
      })
      .filter((msg) => msg.content.length > 0);

    if (openaiMessages.length === 0) {
      throw new Error('有効なメッセージが見つかりません');
    }

    const requestConfig = {
      model: options?.model || this.defaultModel,
      messages: openaiMessages,
      temperature: Math.min(
        Math.max(options?.temperature || this.providerOptions.temperature || 0.7, 0),
        2,
      ),
      max_tokens: Math.min(
        Math.max(options?.maxTokens || this.providerOptions.maxTokens || 2000, 1),
        8192,
      ),
      stream: false as const,
    };

    logger.debug(`OpenAI API リクエスト開始: ${requestConfig.model}`, {
      messageCount: openaiMessages.length,
      temperature: requestConfig.temperature,
      maxTokens: requestConfig.max_tokens,
    });

    // リトライ付きでAPI呼び出し実行
    const result = await withRetry(
      async () => {
        // タイムアウト設定（オプション、プロバイダー設定、またはデフォルト値の順）
        const timeoutMs = options?.timeout || this.providerOptions.timeout;
        const apiPromise = this.client.chat.completions.create(requestConfig);

        // Promise.raceでタイムアウトを実装
        const response = await Promise.race([
          apiPromise,
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`OpenAI APIリクエストが${timeoutMs / 1000}秒でタイムアウトしました`),
                ),
              timeoutMs,
            ),
          ),
        ]);

        // レスポンス検証
        if (!response) {
          throw new Error('APIからレスポンスが返されませんでした');
        }

        if (!('choices' in response)) {
          throw new Error('ストリーミングレスポンスは非対応です');
        }

        if (!response.choices || response.choices.length === 0) {
          throw new Error('APIレスポンスにchoicesが含まれていません');
        }

        const choice = response.choices[0];
        if (!choice?.message?.content) {
          if (choice?.finish_reason === 'length') {
            throw new Error(
              'レスポンスが最大トークン数に達しました。maxTokensを増やしてください。',
            );
          } else if (choice?.finish_reason === 'content_filter') {
            throw new Error('コンテンツフィルタによりレスポンスがブロックされました。');
          } else {
            throw new Error('APIから空のレスポンスが返されました');
          }
        }

        const content = choice.message.content.trim();
        if (content.length === 0) {
          throw new Error('APIから空の内容が返されました');
        }

        return content;
      },
      {
        maxRetries: this.providerOptions.maxRetries,
        delay: 1000,
        exponentialBackoff: true,
        timeout: options?.timeout || this.providerOptions.timeout,
        shouldRetry: this.isRetryableError.bind(this),
      },
    );

    if (!result.success) {
      logger.error('OpenAI chat error after retries:', result.error);

      // OpenAI特有のエラーハンドリング
      const error = result.error!;
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        const status = apiError.status || apiError.code;

        switch (status) {
          case 401:
            throw new Error('OpenAI APIキーが無効です。設定を確認してください。');
          case 402:
            throw new Error('OpenAI APIの利用枠が不足しています。課金情報を確認してください。');
          case 429:
            throw new Error(
              'OpenAI APIのレート制限に達しました。しばらく待ってからお試しください。',
            );
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error(
              'OpenAI APIサーバーエラーが発生しました。しばらく待ってからお試しください。',
            );
          case 'insufficient_quota':
            throw new Error('OpenAI APIの利用枠を超えています。アカウントを確認してください。');
          case 'model_not_found':
            throw new Error(
              `指定されたモデル "${requestConfig?.model || this.defaultModel}" が見つかりません。`,
            );
          case 'invalid_request_error':
            throw new Error('無効なリクエストです。パラメータを確認してください。');
          default:
            if (apiError.message) {
              throw new Error(`OpenAI API エラー: ${apiError.message}`);
            }
        }
      }

      // ネットワークエラー
      if (error instanceof Error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          throw new Error('OpenAI APIへの接続に失敗しました。ネットワーク接続を確認してください。');
        } else if (error.message.includes('timeout') || error.message.includes('タイムアウト')) {
          throw new Error(
            'OpenAI APIリクエストがタイムアウトしました。しばらく待ってからお試しください。',
          );
        }
      }

      // その他のエラーはそのまま再スロー
      throw error;
    }

    logger.debug(`OpenAI APIリクエスト完了: ${result.result!.length}文字`, {
      attemptCount: result.attemptCount,
      totalTime: result.totalTime,
    });
    return result.result!;
  }

  async complete(options: CompletionOptions): Promise<string> {
    // 入力検証
    if (!options || !options.prompt) {
      throw new Error('プロンプトが指定されていません');
    }

    const trimmedPrompt = options.prompt.trim();
    if (trimmedPrompt.length === 0) {
      throw new Error('プロンプトが空です');
    }

    if (trimmedPrompt.length > 32000) {
      throw new Error('プロンプトが長すぎます（最大32,000文字）');
    }

    const requestConfig = {
      model: options.model || this.defaultModel,
      messages: [{ role: 'user' as const, content: trimmedPrompt }],
      temperature: Math.min(
        Math.max(options.temperature || this.providerOptions.temperature || 0.7, 0),
        2,
      ),
      max_tokens: Math.min(
        Math.max(options.maxTokens || this.providerOptions.maxTokens || 2000, 1),
        8192,
      ),
      stream: false as const,
    };

    logger.debug(`OpenAI completion API リクエスト開始: ${requestConfig.model}`);

    // リトライ付きでAPI呼び出し実行
    const result = await withRetry(
      async () => {
        // タイムアウト設定（オプション、プロバイダー設定、またはデフォルト値の順）
        const timeoutMs = options.timeout || this.providerOptions.timeout;
        const apiPromise = this.client.chat.completions.create(requestConfig);

        // Promise.raceでタイムアウトを実装
        const response = await Promise.race([
          apiPromise,
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `OpenAI completion APIリクエストが${timeoutMs / 1000}秒でタイムアウトしました`,
                  ),
                ),
              timeoutMs,
            ),
          ),
        ]);

        // レスポンス検証（chatメソッドと同様）
        if (!response || !('choices' in response)) {
          throw new Error('ストリーミングレスポンスは非対応です');
        }

        const choice = response.choices[0];
        if (!choice?.message?.content) {
          if (choice?.finish_reason === 'length') {
            throw new Error(
              'レスポンスが最大トークン数に達しました。maxTokensを増やしてください。',
            );
          } else if (choice?.finish_reason === 'content_filter') {
            throw new Error('コンテンツフィルタによりレスポンスがブロックされました。');
          } else {
            throw new Error('APIから空のレスポンスが返されました');
          }
        }

        const content = choice.message.content.trim();
        if (content.length === 0) {
          throw new Error('APIから空の内容が返されました');
        }

        return content;
      },
      {
        maxRetries: this.providerOptions.maxRetries,
        delay: 1000,
        exponentialBackoff: true,
        timeout: options.timeout || this.providerOptions.timeout,
        shouldRetry: this.isRetryableError.bind(this),
      },
    );

    if (!result.success) {
      logger.error('OpenAI completion error after retries:', result.error);

      // chatメソッドと同様のエラーハンドリング
      const error = result.error!;
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        const status = apiError.status || apiError.code;

        switch (status) {
          case 401:
            throw new Error('OpenAI APIキーが無効です。設定を確認してください。');
          case 402:
            throw new Error('OpenAI APIの利用枠が不足しています。課金情報を確認してください。');
          case 429:
            throw new Error(
              'OpenAI APIのレート制限に達しました。しばらく待ってからお試しください。',
            );
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error(
              'OpenAI APIサーバーエラーが発生しました。しばらく待ってからお試しください。',
            );
          default:
            if (apiError.message) {
              throw new Error(`OpenAI API エラー: ${apiError.message}`);
            }
        }
      }

      if (error instanceof Error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          throw new Error('OpenAI APIへの接続に失敗しました。ネットワーク接続を確認してください。');
        } else if (error.message.includes('timeout') || error.message.includes('タイムアウト')) {
          throw new Error(
            'OpenAI completion APIリクエストがタイムアウトしました。しばらく待ってからお試しください。',
          );
        }
      }

      throw error;
    }

    logger.debug(`OpenAI completion API 完了: ${result.result!.length}文字`, {
      attemptCount: result.attemptCount,
      totalTime: result.totalTime,
    });
    return result.result!;
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.models.list();
      return response.data.filter((model) => model.id.includes('gpt')).map((model) => model.id);
    } catch (error) {
      logger.error('OpenAI list models error:', error);
      throw error;
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      logger.debug('OpenAI接続検証開始');

      // タイムアウト付きでモデルリストを取得（プロバイダー設定を使用）
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Connection validation timeout')),
          this.providerOptions.timeout,
        ),
      );

      const modelsPromise = this.client.models.list();

      await Promise.race([modelsPromise, timeoutPromise]);

      logger.debug('OpenAI接続検証成功');
      return true;
    } catch (error) {
      logger.error('OpenAI connection validation failed:', error);

      // エラーログに詳細情報を記録
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        logger.error('OpenAI API エラー詳細:', {
          status: apiError.status,
          code: apiError.code,
          message: apiError.message,
        });
      }

      return false;
    }
  }

  /**
   * OpenAI APIのエラーがリトライ可能かを判定
   */
  private isRetryableError(error: unknown): boolean {
    // ネットワークエラー
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (
        message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('network') ||
        message.includes('enotfound') ||
        message.includes('econnrefused')
      ) {
        return true;
      }
    }

    // OpenAI APIのステータスコードベースの判定
    if (error && typeof error === 'object' && error !== null && 'status' in error) {
      const statusError = error as { status?: number; code?: number };
      const status = statusError.status || statusError.code;
      // レート制限、サーバーエラーはリトライ可能
      return status === 429 || (status !== undefined && status >= 500);
    }

    return false;
  }
}

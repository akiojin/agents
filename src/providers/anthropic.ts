import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from '../config/types.js';
import { LLMProvider, type ChatOptions, type CompletionOptions } from './base.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

export class AnthropicProvider extends LLMProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, model?: string, options?: {
    timeout?: number;
    maxRetries?: number;
    temperature?: number;
    maxTokens?: number;
  }) {
    super(apiKey, undefined, options);
    this.client = new Anthropic({ apiKey });
    this.defaultModel = model || 'claude-3-opus-20240229';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    // 入力検証
    if (!messages || messages.length === 0) {
      throw new Error('メッセージが指定されていません');
    }

    // システムメッセージとその他のメッセージを分離
    const systemMessage = messages.find((msg) => msg.role === 'system');
    const otherMessages = messages.filter((msg) => msg.role !== 'system');

    if (otherMessages.length === 0) {
      throw new Error('ユーザーまたはアシスタントメッセージが必要です');
    }

    // メッセージ形式の検証と変換
    const anthropicMessages = otherMessages.map((msg, index) => {
      if (!msg.role || !msg.content) {
        throw new Error(`無効なメッセージ形式 (インデックス: ${index})`);
      }
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        throw new Error(`サポートされていないロール: ${msg.role}`);
      }
      
      const content = msg.content.trim();
      if (content.length === 0) {
        throw new Error(`空のメッセージ内容 (インデックス: ${index})`);
      }
      
      return {
        role: msg.role as 'user' | 'assistant',
        content,
      };
    });

    const requestConfig = {
      model: options?.model || this.defaultModel,
      messages: anthropicMessages,
      system: systemMessage?.content?.trim(),
      max_tokens: Math.min(Math.max(options?.maxTokens || this.providerOptions.maxTokens || 2000, 1), 8192),
      temperature: Math.min(Math.max(options?.temperature || this.providerOptions.temperature || 0.7, 0), 1),
    };

    logger.debug(`Anthropic API リクエスト開始: ${requestConfig.model}`, {
      messageCount: anthropicMessages.length,
      hasSystem: !!requestConfig.system,
      temperature: requestConfig.temperature,
      maxTokens: requestConfig.max_tokens,
    });

    // リトライ付きでAPI呼び出し実行
    const result = await withRetry(
      async () => {
        // タイムアウト設定（オプション、プロバイダー設定、またはデフォルト値の順）
        const timeoutMs = options?.timeout || this.providerOptions.timeout;
        const apiPromise = this.client.messages.create(requestConfig);
        
        // Promise.raceでタイムアウトを実装
        const response = await Promise.race([
          apiPromise,
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Anthropic APIリクエストが${timeoutMs / 1000}秒でタイムアウトしました`)), timeoutMs)
          )
        ]);

        // レスポンス検証
        if (!response) {
          throw new Error('APIからレスポンスが返されませんでした');
        }

        if (!response.content || response.content.length === 0) {
          throw new Error('APIレスポンスにコンテンツが含まれていません');
        }

        const content = response.content[0];
        if (!content) {
          throw new Error('レスポンスコンテンツが空です');
        }

        if (content.type !== 'text') {
          throw new Error(`サポートされていないコンテンツタイプ: ${content.type}`);
        }

        const text = content.text?.trim();
        if (!text || text.length === 0) {
          if (response.stop_reason === 'max_tokens') {
            throw new Error('レスポンスが最大トークン数に達しました。max_tokensを増やしてください。');
          } else {
            throw new Error('APIから空の内容が返されました');
          }
        }

        return text;
      },
      {
        maxRetries: this.providerOptions.maxRetries,
        delay: 1000,
        exponentialBackoff: true,
        timeout: options?.timeout || this.providerOptions.timeout,
        shouldRetry: this.isRetryableError.bind(this),
      }
    );

    if (!result.success) {
      logger.error('Anthropic chat error after retries:', result.error);

      // Anthropic特有のエラーハンドリング
      const error = result.error!;
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        const status = apiError.status || apiError.statusCode;
        
        switch (status) {
          case 401:
            throw new Error('Anthropic APIキーが無効です。設定を確認してください。');
          case 402:
            throw new Error('Anthropic APIの利用枠が不足しています。課金情報を確認してください。');
          case 429:
            throw new Error('Anthropic APIのレート制限に達しました。しばらく待ってからお試しください。');
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('Anthropic APIサーバーエラーが発生しました。しばらく待ってからお試しください。');
          default:
            if (apiError.message) {
              throw new Error(`Anthropic API エラー: ${apiError.message}`);
            }
        }
      }

      // ネットワークエラー
      if (error instanceof Error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          throw new Error('Anthropic APIへの接続に失敗しました。ネットワーク接続を確認してください。');
        } else if (error.message.includes('timeout') || error.message.includes('タイムアウト')) {
          throw new Error('Anthropic APIリクエストがタイムアウトしました。しばらく待ってからお試しください。');
        } else if (error.message.includes('サポートされていない')) {
          throw error; // カスタムエラーはそのまま
        }
      }

      throw error;
    }

    logger.debug(`Anthropic APIリクエスト完了: ${result.result!.length}文字`, {
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

    const requestConfig = {
      model: options.model || this.defaultModel,
      messages: [{ role: 'user' as const, content: trimmedPrompt }],
      max_tokens: Math.min(Math.max(options.maxTokens || this.providerOptions.maxTokens || 2000, 1), 8192),
      temperature: Math.min(Math.max(options.temperature || this.providerOptions.temperature || 0.7, 0), 1),
    };

    logger.debug(`Anthropic completion API リクエスト開始: ${requestConfig.model}`);

    // リトライ付きでAPI呼び出し実行
    const result = await withRetry(
      async () => {
        // タイムアウト設定（オプション、プロバイダー設定、またはデフォルト値の順）
        const timeoutMs = options.timeout || this.providerOptions.timeout;
        const apiPromise = this.client.messages.create(requestConfig);
        
        // Promise.raceでタイムアウトを実装
        const response = await Promise.race([
          apiPromise,
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Anthropic completionリクエストが${timeoutMs / 1000}秒でタイムアウトしました`)), timeoutMs)
          )
        ]);

        // レスポンス検証
        if (!response || !response.content || response.content.length === 0) {
          throw new Error('APIからレスポンスが返されませんでした');
        }

        const content = response.content[0];
        if (!content || content.type !== 'text') {
          throw new Error('テキスト以外の応答を受信しました');
        }

        const text = content.text?.trim();
        if (!text || text.length === 0) {
          if (response.stop_reason === 'max_tokens') {
            throw new Error('レスポンスが最大トークン数に達しました。max_tokensを増やしてください。');
          } else {
            throw new Error('APIから空の内容が返されました');
          }
        }

        return text;
      },
      {
        maxRetries: this.providerOptions.maxRetries,
        delay: 1000,
        exponentialBackoff: true,
        timeout: options.timeout || this.providerOptions.timeout,
        shouldRetry: this.isRetryableError.bind(this),
      }
    );

    if (!result.success) {
      logger.error('Anthropic completion error after retries:', result.error);
      
      // chatメソッドと同様のエラーハンドリング
      const error = result.error!;
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        const status = apiError.status || apiError.statusCode;
        
        switch (status) {
          case 401:
            throw new Error('Anthropic APIキーが無効です。設定を確認してください。');
          case 402:
            throw new Error('Anthropic APIの利用枠が不足しています。課金情報を確認してください。');
          case 429:
            throw new Error('Anthropic APIのレート制限に達しました。しばらく待ってからお試しください。');
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('Anthropic APIサーバーエラーが発生しました。しばらく待ってからお試しください。');
          default:
            if (apiError.message) {
              throw new Error(`Anthropic API エラー: ${apiError.message}`);
            }
        }
      }

      // タイムアウトエラーのハンドリング
      if (error instanceof Error && (error.message.includes('timeout') || error.message.includes('タイムアウト'))) {
        throw new Error('Anthropic completionリクエストがタイムアウトしました。しばらく待ってからお試しください。');
      }
      
      throw error;
    }

    logger.debug(`Anthropic completion API 完了: ${result.result!.length}文字`, {
      attemptCount: result.attemptCount,
      totalTime: result.totalTime,
    });
    return result.result!;
  }

  async listModels(): Promise<string[]> {
    // Anthropic APIは現在モデルリストエンドポイントを提供していないため、
    // 利用可能なモデルをハードコーディング
    return [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
    ];
  }

  async validateConnection(): Promise<boolean> {
    try {
      logger.debug('Anthropic接続検証開始');
      
      // タイムアウト付きで最小限のリクエストを実行（プロバイダー設定を使用）
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Connection validation timeout')), this.providerOptions.timeout)
      );
      
      const testPromise = this.client.messages.create({
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });
      
      await Promise.race([testPromise, timeoutPromise]);
      
      logger.debug('Anthropic接続検証成功');
      return true;
      
    } catch (error) {
      logger.error('Anthropic connection validation failed:', error);
      
      // エラーログに詳細情報を記録
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        logger.error('Anthropic API エラー詳細:', {
          status: apiError.status,
          statusCode: apiError.statusCode,
          message: apiError.message,
          type: apiError.type,
        });
      }
      
      return false;
    }
  }

  /**
   * Anthropic APIのエラーがリトライ可能かを判定
   */
  private isRetryableError(error: unknown): boolean {
    // ネットワークエラー
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      if (message.includes('timeout') ||
          message.includes('connection') ||
          message.includes('network') ||
          message.includes('enotfound') ||
          message.includes('econnrefused')) {
        return true;
      }
    }

    // Anthropic APIのステータスコードベースの判定
    if (error && typeof error === 'object' && error !== null && 'status' in error) {
      const statusError = error as { status?: number; statusCode?: number };
      const status = statusError.status || statusError.statusCode;
      // レート制限、サーバーエラーはリトライ可能
      return status === 429 || (status !== undefined && status >= 500);
    }

    return false;
  }
}

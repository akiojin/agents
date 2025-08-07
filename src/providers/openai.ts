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
    // 入力Validation
    if (!messages || messages.length === 0) {
      throw new Error('No messages specified');
    }

    // Messageの形式ValidationとConvert
    const openaiMessages = messages
      .map((msg, index) => {
        if (!msg.role || !msg.content) {
          throw new Error(`Invalid message format (Index: ${index})`);
        }
        return {
          role: msg.role,
          content: msg.content.trim(),
        };
      })
      .filter((msg) => msg.content.length > 0);

    if (openaiMessages.length === 0) {
      throw new Error('有効なMessagenot found');
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

    logger.debug(`OpenAI API RequestStarted: ${requestConfig.model}`, {
      messageCount: openaiMessages.length,
      temperature: requestConfig.temperature,
      maxTokens: requestConfig.max_tokens,
    });

    // Retry付きでAPI呼び出しExecute
    const result = await withRetry(
      async () => {
        // TimeoutConfig（Options、ProviderConfig、またはデフォルト値の順）
        const timeoutMs = options?.timeout || this.providerOptions.timeout;
        const apiPromise = this.client.chat.completions.create(requestConfig);

        // Promise.raceでTimeoutを実装
        const response = await Promise.race([
          apiPromise,
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(`OpenAI APIRequestが${timeoutMs / 1000}secondsでtimed out`),
                ),
              timeoutMs,
            ),
          ),
        ]);

        // ResponseValidation
        if (!response) {
          throw new Error('APIからResponseが返されnotでした');
        }

        if (!('choices' in response)) {
          throw new Error('ストリーミングResponseは非対応です');
        }

        if (!response.choices || response.choices.length === 0) {
          throw new Error('APIResponse does not contain choices');
        }

        const choice = response.choices[0];
        if (!choice?.message?.content) {
          if (choice?.finish_reason === 'length') {
            throw new Error(
              'Responseが最大トークン数に達done。maxTokensを増やしてplease。',
            );
          } else if (choice?.finish_reason === 'content_filter') {
            throw new Error('コンテンツフィルタによりResponseがブロックさed。');
          } else {
            throw new Error('APIreturned empty response');
          }
        }

        const content = choice.message.content.trim();
        if (content.length === 0) {
          throw new Error('APIreturned empty content');
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

      // OpenAI特有のErrorハンドリング
      const error = result.error!;
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        const status = apiError.status || apiError.code;

        switch (status) {
          case 401:
            throw new Error('OpenAI APIキーが無効です。Please check settings。');
          case 402:
            throw new Error('OpenAI APIのquotaが不足してing。課金InfoをCheckしてplease。');
          case 429:
            throw new Error(
              'OpenAI APIのRate limitに達done。しばらく待ってからお試しplease。',
            );
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error(
              'OpenAI APIServerErroroccurreddone。しばらく待ってからお試しplease。',
            );
          case 'insufficient_quota':
            throw new Error('OpenAI APIのquotaを超えてing。アカウントをCheckしてplease。');
          case 'model_not_found':
            throw new Error(
              `specifiedModel "${requestConfig?.model || this.defaultModel}" not found。`,
            );
          case 'invalid_request_error':
            throw new Error('無効なRequestです。ParametersをCheckしてplease。');
          default:
            if (apiError.message) {
              throw new Error(`OpenAI API Error: ${apiError.message}`);
            }
        }
      }

      // ネットワークError
      if (error instanceof Error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          throw new Error('OpenAI APIFailed to connect to。ネットワークConnectionをCheckしてplease。');
        } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
          throw new Error(
            'OpenAI APIRequestがtimed out。しばらく待ってからお試しplease。',
          );
        }
      }

      // その他のErrorはそのまま再スロー
      throw error;
    }

    logger.debug(`OpenAI APIRequestCompleted: ${result.result!.length}characters`, {
      attemptCount: result.attemptCount,
      totalTime: result.totalTime,
    });
    return result.result!;
  }

  async complete(options: CompletionOptions): Promise<string> {
    // 入力Validation
    if (!options || !options.prompt) {
      throw new Error('プロンプトが指定not initialized');
    }

    const trimmedPrompt = options.prompt.trim();
    if (trimmedPrompt.length === 0) {
      throw new Error('プロンプトが空です');
    }

    if (trimmedPrompt.length > 32000) {
      throw new Error('プロンプトがis too long（最大32,000characters）');
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

    logger.debug(`OpenAI completion API RequestStarted: ${requestConfig.model}`);

    // Retry付きでAPI呼び出しExecute
    const result = await withRetry(
      async () => {
        // TimeoutConfig（Options、ProviderConfig、またはデフォルト値の順）
        const timeoutMs = options.timeout || this.providerOptions.timeout;
        const apiPromise = this.client.chat.completions.create(requestConfig);

        // Promise.raceでTimeoutを実装
        const response = await Promise.race([
          apiPromise,
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error(
                    `OpenAI completion APIRequestが${timeoutMs / 1000}secondsでtimed out`,
                  ),
                ),
              timeoutMs,
            ),
          ),
        ]);

        // ResponseValidation（chatメソッドと同様）
        if (!response || !('choices' in response)) {
          throw new Error('ストリーミングResponseは非対応です');
        }

        const choice = response.choices[0];
        if (!choice?.message?.content) {
          if (choice?.finish_reason === 'length') {
            throw new Error(
              'Responseが最大トークン数に達done。maxTokensを増やしてplease。',
            );
          } else if (choice?.finish_reason === 'content_filter') {
            throw new Error('コンテンツフィルタによりResponseがブロックさed。');
          } else {
            throw new Error('APIreturned empty response');
          }
        }

        const content = choice.message.content.trim();
        if (content.length === 0) {
          throw new Error('APIreturned empty content');
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

      // chatメソッドと同様のErrorハンドリング
      const error = result.error!;
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        const status = apiError.status || apiError.code;

        switch (status) {
          case 401:
            throw new Error('OpenAI APIキーが無効です。Please check settings。');
          case 402:
            throw new Error('OpenAI APIのquotaが不足してing。課金InfoをCheckしてplease。');
          case 429:
            throw new Error(
              'OpenAI APIのRate limitに達done。しばらく待ってからお試しplease。',
            );
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error(
              'OpenAI APIServerErroroccurreddone。しばらく待ってからお試しplease。',
            );
          default:
            if (apiError.message) {
              throw new Error(`OpenAI API Error: ${apiError.message}`);
            }
        }
      }

      if (error instanceof Error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          throw new Error('OpenAI APIFailed to connect to。ネットワークConnectionをCheckしてplease。');
        } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
          throw new Error(
            'OpenAI completion APIRequestがtimed out。しばらく待ってからお試しplease。',
          );
        }
      }

      throw error;
    }

    logger.debug(`OpenAI completion API Completed: ${result.result!.length}characters`, {
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
      logger.debug('OpenAIConnectionValidationStarted');

      // Timeout付きでModelリストをGet（ProviderConfigを使用）
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error('Connection validation timeout')),
          this.providerOptions.timeout,
        ),
      );

      const modelsPromise = this.client.models.list();

      await Promise.race([modelsPromise, timeoutPromise]);

      logger.debug('OpenAIConnectionValidationSuccess');
      return true;
    } catch (error) {
      logger.error('OpenAI connection validation failed:', error);

      // ErrorログにDetailsInfoを記録
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        logger.error('OpenAI API ErrorDetails:', {
          status: apiError.status,
          code: apiError.code,
          message: apiError.message,
        });
      }

      return false;
    }
  }

  /**
   * OpenAI APIのErrorがRetry可能かを判定
   */
  private isRetryableError(error: unknown): boolean {
    // ネットワークError
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
      // Rate limit、ServerErrorはRetry可能
      return status === 429 || (status !== undefined && status >= 500);
    }

    return false;
  }
}

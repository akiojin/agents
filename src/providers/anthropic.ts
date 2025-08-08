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
    // 入力Validation
    if (!messages || messages.length === 0) {
      throw new Error('No messages specified');
    }

    // システムMessageとその他のMessageを分離
    // 'tool'ロールのメッセージも除外（Anthropicがサポートしていないため）
    const systemMessage = messages.find((msg) => msg.role === 'system');
    const otherMessages = messages.filter((msg) => msg.role !== 'system' && msg.role !== 'tool');

    if (otherMessages.length === 0) {
      throw new Error('UserまたはAssistantMessageが必要です');
    }

    // Message形式のValidationとConvert
    const anthropicMessages = otherMessages.map((msg, index) => {
      // Find original index in messages array for better error reporting
      const originalIndex = messages.indexOf(msg);
      
      if (!msg.role || !msg.content) {
        logger.error(`Invalid message at index ${originalIndex}:`, msg);
        throw new Error(`Invalid message format (Index: ${originalIndex}, role: ${msg.role})`);
      }
      if (msg.role !== 'user' && msg.role !== 'assistant') {
        logger.error(`Unsupported role at index ${originalIndex}:`, msg);
        throw new Error(`Unsupported role: ${msg.role} (Index: ${originalIndex})`);
      }
      
      const content = msg.content.trim();
      if (content.length === 0) {
        throw new Error(`Empty message content (Index: ${originalIndex})`);
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

    logger.debug(`Anthropic API RequestStarted: ${requestConfig.model}`, {
      messageCount: anthropicMessages.length,
      hasSystem: !!requestConfig.system,
      temperature: requestConfig.temperature,
      maxTokens: requestConfig.max_tokens,
    });

    // Retry付きでAPI呼び出しExecute
    const result = await withRetry(
      async () => {
        // TimeoutConfig（Options、ProviderConfig、またはデフォルト値の順）
        const timeoutMs = options?.timeout || this.providerOptions.timeout;
        const apiPromise = this.client.messages.create(requestConfig);
        
        // Promise.raceでTimeoutを実装
        const response = await Promise.race([
          apiPromise,
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Anthropic APIRequestが${timeoutMs / 1000}secondsでtimed out`)), timeoutMs)
          )
        ]);

        // ResponseValidation
        if (!response) {
          throw new Error('APIからResponseが返されnotでした');
        }

        if (!response.content || response.content.length === 0) {
          throw new Error('APIResponseにコンテンツが含まれていnot');
        }

        const content = response.content[0];
        if (!content) {
          throw new Error('Responseコンテンツが空です');
        }

        if (content.type !== 'text') {
          throw new Error(`サポートされていないコンテンツタイプ: ${content.type}`);
        }

        const text = content.text?.trim();
        if (!text || text.length === 0) {
          if (response.stop_reason === 'max_tokens') {
            throw new Error('Responseが最大トークン数に達done。max_tokensを増やしてplease。');
          } else {
            throw new Error('APIreturned empty content');
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

      // Anthropic特有のErrorハンドリング
      const error = result.error!;
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        const status = apiError.status || apiError.statusCode;
        
        switch (status) {
          case 401:
            throw new Error('Anthropic APIキーが無効です。Please check settings。');
          case 402:
            throw new Error('Anthropic APIのquotaが不足してing。課金InfoをCheckしてplease。');
          case 429:
            throw new Error('Anthropic APIのRate limitに達done。しばらく待ってからお試しplease。');
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('Anthropic APIServerErroroccurreddone。しばらく待ってからお試しplease。');
          default:
            if (apiError.message) {
              throw new Error(`Anthropic API Error: ${apiError.message}`);
            }
        }
      }

      // ネットワークError
      if (error instanceof Error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ECONNREFUSED')) {
          throw new Error('Anthropic APIFailed to connect to。ネットワークConnectionをCheckしてplease。');
        } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
          throw new Error('Anthropic APIRequestがtimed out。しばらく待ってからお試しplease。');
        } else if (error.message.includes('サポートされていない')) {
          throw error; // カスタムErrorはそのまま
        }
      }

      throw error;
    }

    logger.debug(`Anthropic APIRequestCompleted: ${result.result!.length}characters`, {
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

    const requestConfig = {
      model: options.model || this.defaultModel,
      messages: [{ role: 'user' as const, content: trimmedPrompt }],
      max_tokens: Math.min(Math.max(options.maxTokens || this.providerOptions.maxTokens || 2000, 1), 8192),
      temperature: Math.min(Math.max(options.temperature || this.providerOptions.temperature || 0.7, 0), 1),
    };

    logger.debug(`Anthropic completion API RequestStarted: ${requestConfig.model}`);

    // Retry付きでAPI呼び出しExecute
    const result = await withRetry(
      async () => {
        // TimeoutConfig（Options、ProviderConfig、またはデフォルト値の順）
        const timeoutMs = options.timeout || this.providerOptions.timeout;
        const apiPromise = this.client.messages.create(requestConfig);
        
        // Promise.raceでTimeoutを実装
        const response = await Promise.race([
          apiPromise,
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(`Anthropic completionRequestが${timeoutMs / 1000}secondsでtimed out`)), timeoutMs)
          )
        ]);

        // ResponseValidation
        if (!response || !response.content || response.content.length === 0) {
          throw new Error('APIからResponseが返されnotでした');
        }

        const content = response.content[0];
        if (!content || content.type !== 'text') {
          throw new Error('テキスト以外の応答をReceivedone');
        }

        const text = content.text?.trim();
        if (!text || text.length === 0) {
          if (response.stop_reason === 'max_tokens') {
            throw new Error('Responseが最大トークン数に達done。max_tokensを増やしてplease。');
          } else {
            throw new Error('APIreturned empty content');
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
      
      // chatメソッドと同様のErrorハンドリング
      const error = result.error!;
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        const status = apiError.status || apiError.statusCode;
        
        switch (status) {
          case 401:
            throw new Error('Anthropic APIキーが無効です。Please check settings。');
          case 402:
            throw new Error('Anthropic APIのquotaが不足してing。課金InfoをCheckしてplease。');
          case 429:
            throw new Error('Anthropic APIのRate limitに達done。しばらく待ってからお試しplease。');
          case 500:
          case 502:
          case 503:
          case 504:
            throw new Error('Anthropic APIServerErroroccurreddone。しばらく待ってからお試しplease。');
          default:
            if (apiError.message) {
              throw new Error(`Anthropic API Error: ${apiError.message}`);
            }
        }
      }

      // TimeoutErrorのハンドリング
      if (error instanceof Error && (error.message.includes('timeout') || error.message.includes('Timeout'))) {
        throw new Error('Anthropic completionRequestがtimed out。しばらく待ってからお試しplease。');
      }
      
      throw error;
    }

    logger.debug(`Anthropic completion API Completed: ${result.result!.length}characters`, {
      attemptCount: result.attemptCount,
      totalTime: result.totalTime,
    });
    return result.result!;
  }

  async listModels(): Promise<string[]> {
    // Anthropic APIは現在Modelリストエンドポイントを提供していないため、
    // 利用可能なModelをハードコーディング
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
      logger.debug('AnthropicConnectionValidationStarted');
      
      // Timeout付きで最小限のRequestをExecute（ProviderConfigを使用）
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('Connection validation timeout')), this.providerOptions.timeout)
      );
      
      const testPromise = this.client.messages.create({
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });
      
      await Promise.race([testPromise, timeoutPromise]);
      
      logger.debug('AnthropicConnectionValidationSuccess');
      return true;
      
    } catch (error) {
      logger.error('Anthropic connection validation failed:', error);
      
      // ErrorログにDetailsInfoを記録
      if (error && typeof error === 'object' && 'status' in error) {
        const apiError = error as any;
        logger.error('Anthropic API ErrorDetails:', {
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
   * Anthropic APIのErrorがRetry可能かを判定
   */
  private isRetryableError(error: unknown): boolean {
    // ネットワークError
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
      // Rate limit、ServerErrorはRetry可能
      return status === 429 || (status !== undefined && status >= 500);
    }

    return false;
  }
}

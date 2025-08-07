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
    // specifiedエンドポイントを使用：http://127.0.0.1:1234
    const endpoint = `${this.endpoint}/v1/chat/completions`;

    logger.debug(`Local API request started: ${endpoint}`, { 
      providerType: this.providerType,
      hasModel: !!body.model,
    });

    // Execute API call with retry
    const result = await withRetry(
      async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => {
          controller.abort();
        }, this.providerOptions.timeout); // Get timeout value from provider settings

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
            let errorMessage = `Local API error: ${response.status} ${response.statusText}`;
            
            try {
              const errorBody = await response.text();
              if (errorBody) {
                errorMessage += ` - ${errorBody}`;
              }
            } catch (readError) {
              logger.debug('Failed to read error response:', readError);
            }

            // Error message by HTTP status code
            switch (response.status) {
              case 400:
                throw new Error('Invalid request. Please check parameters.');
              case 401:
                throw new Error('Authentication required. Please check API key or settings.');
              case 404:
                throw new Error('Endpoint not found. Please check server settings.');
              case 500:
                throw new Error('Internal error occurred on local server.');
              case 502:
              case 503:
              case 504:
                throw new Error('Local server unavailable. Please check server status.');
              default:
                throw new Error(errorMessage);
            }
          }

          // ResponseValidation
          const contentType = response.headers.get('content-type');
          if (!contentType?.includes('application/json')) {
            throw new Error(`Not expected JSON response: ${contentType}`);
          }

          const result = await response.json() as LocalAPIResponse;
          
          // 基本的なResponse形式Validation
          if (!result || typeof result !== 'object') {
            throw new Error('Invalid JSON response format');
          }

          if (!result.choices || !Array.isArray(result.choices) || result.choices.length === 0) {
            throw new Error('Response does not contain choices');
          }

          return result;

        } catch (fetchError) {
          clearTimeout(timeout);
          
          if (fetchError instanceof Error) {
            if (fetchError.name === 'AbortError') {
              throw new Error(`Local API requestがtimed out（${this.providerOptions.timeout / 1000}seconds）`);
            } else if (fetchError.message.includes('ECONNREFUSED')) {
              throw new Error(`LocalServer（${this.endpoint}）cannot connect to。Please check if server is running。`);
            } else if (fetchError.message.includes('ENOTFOUND')) {
              throw new Error(`LocalServerのアドレス（${this.endpoint}）not found。Please check settings。`);
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
      logger.error('Local API requestError after retries:', result.error);
      throw result.error!;
    }

    logger.debug('Local API requestCompleted', {
      attemptCount: result.attemptCount,
      totalTime: result.totalTime,
    });
    return result.result!;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    try {
      // 入力Validation
      if (!messages || messages.length === 0) {
        throw new Error('No messages specified');
      }

      // Message形式のValidationとConvert
      const localMessages = messages.map((msg, index) => {
        if (!msg.role || !msg.content) {
          throw new Error(`Invalid message format (Index: ${index})`);
        }
        
        const content = msg.content.trim();
        if (content.length === 0) {
          throw new Error(`Empty message content (Index: ${index})`);
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

      logger.debug(`LocalProvider chat started: ${this.providerType}`, {
        messageCount: localMessages.length,
        model: body.model,
        maxTokens: body.max_tokens,
        endpoint: this.endpoint,
      });

      const response = await this.makeRequest(body);

      // Response内容をGet（OpenAI互換APIを想定）
      const content = response.choices[0]?.message?.content;

      if (!content) {
        // よりDetailsなErrorInfo
        const choice = response.choices[0];
        if (choice?.finish_reason === 'length') {
          throw new Error('Responseが最大トークン数に達done。max_tokensを増やしてplease。');
        } else {
          throw new Error('LocalAPIreturned empty response');
        }
      }

      const trimmedContent = content.trim();
      if (trimmedContent.length === 0) {
        throw new Error('LocalAPIreturned empty content');
      }

      logger.debug(`LocalProvider chat completed: ${trimmedContent.length}characters`);
      return trimmedContent;

    } catch (error) {
      logger.error('Local provider chat error:', error);
      
      // Improved error messages
      if (error instanceof Error) {
        if (error.message.includes('Connectionできnot') || error.message.includes('ECONNREFUSED')) {
          throw new Error(`LocalServer（${this.endpoint}）Failed to connect to。Please check if server is running。`);
        } else if (error.message.includes('Timeout')) {
          throw new Error('LocalServerへのRequestがtimed out。Please check server load。');
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

      logger.debug('LocalProvider completion Started', {
        promptLength: options.prompt.length,
        model: body.model,
        endpoint: this.endpoint,
      });

      const response = await this.makeRequest(body);

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Response is empty');
      }

      logger.debug(`LocalProvider completion Completed: ${content.length}characters`);
      return content;
    } catch (error) {
      logger.error('Local provider completion error:', error);
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      // specifiedエンドポイントのModelリスト
      const endpoint = `${this.endpoint}/v1/models`;
      
      logger.debug('LocalProvider ModelリストGetStarted:', endpoint);
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10secondsTimeout

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
        logger.warn(`ModelリストのGetにFailed: ${response.status} ${response.statusText}`);
        return ['local-model'];
      }

      const data = (await response.json()) as { data: Array<{ id: string }> };
      const models = data.data?.map((model) => model.id) || ['local-model'];
      
      logger.debug('LocalProvider ModelリストGetCompleted:', models);
      return models;
    } catch (error) {
      logger.error('Local provider list models error:', error);
      // Errorの場合はデフォルトModelを返す
      return ['local-model'];
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      logger.debug(`LocalProviderConnectionValidationStarted: ${this.endpoint}`);
      
      // まずModelエンドポイントでConnectionCheck
      try {
        const modelsController = new AbortController();
        setTimeout(() => modelsController.abort(), 5000); // 5secondsTimeout

        const modelsResponse = await fetch(`${this.endpoint}/v1/models`, {
          method: 'GET',
          signal: modelsController.signal,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': '@akiojin/agents',
          },
        });

        if (modelsResponse.ok) {
          logger.debug('LocalServerConnectionValidationSuccess（/v1/models）');
          return true;
        }
        
        logger.debug(`ModelエンドポイントResponse: ${modelsResponse.status} ${modelsResponse.statusText}`);
      } catch (modelsError) {
        logger.debug('ModelエンドポイントConnectionFailed:', modelsError);
      }

      // 次にChat completions エンドポイントで軽量テスト
      try {
        const testController = new AbortController();
        setTimeout(() => testController.abort(), 3000); // 3secondsTimeout

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

        // 200-299の範囲、または400番台（ConfigErrorだがConnectionはSuccess）
        if (testResponse.status < 500) {
          logger.debug(`LocalServerConnectionValidationSuccess（/v1/chat/completions）: ${testResponse.status}`);
          return true;
        }
        
        logger.debug(`Chat completions テスト: ${testResponse.status} ${testResponse.statusText}`);
      } catch (testError) {
        logger.debug('Chat completions テストFailed:', testError);
      }

      // 最後の手段として基本的なConnectionテストをExecute
      try {
        const baseController = new AbortController();
        setTimeout(() => baseController.abort(), 2000); // 2secondsTimeout

        const baseResponse = await fetch(this.endpoint, {
          method: 'HEAD',
          signal: baseController.signal,
        });

        // ステータスコードが500未満ならConnectionはSuccessしている
        if (baseResponse.status < 500) {
          logger.debug(`LocalServer基本ConnectionCheck: ${baseResponse.status}`);
          return true;
        }
      } catch (baseError) {
        logger.debug('基本ConnectionテストもFailed:', baseError);
      }

      logger.error(`LocalProviderConnectionValidationFailed: ${this.endpoint}`);
      return false;

    } catch (error) {
      logger.error('Local provider connection validation failed:', error);
      
      // ErrorログにDetailsInfoを記録
      if (error instanceof Error) {
        logger.error('ConnectionValidationErrorDetails:', {
          message: error.message,
          endpoint: this.endpoint,
          providerType: this.providerType,
        });
        
        if (error.message.includes('ECONNREFUSED')) {
          logger.error(`Server（${this.endpoint}）が起動していない可能性があります`);
        } else if (error.message.includes('ENOTFOUND')) {
          logger.error(`Serverアドレス（${this.endpoint}）が無効な可能性があります`);
        }
      }
      
      return false;
    }
  }

  /**
   * LocalAPIのErrorがRetry可能かを判定
   */
  private isRetryableError(error: unknown): boolean {
    // ネットワークError
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
      // ServerError（500番台）はRetry可能
      return status !== undefined && status >= 500;
    }

    return false;
  }
}

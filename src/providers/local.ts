import type { ChatMessage } from '../config/types.js';
import { LLMProvider, type ChatOptions, type CompletionOptions, type ChatResponse, type ToolCall } from './base.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';

interface LocalAPIRequest {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  prompt?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  tools?: any[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface LocalAPIResponse {
  choices: Array<{
    message?: { 
      content: string;
      tool_calls?: ToolCall[];
    };
    text?: string;
    finish_reason?: 'stop' | 'length' | 'tool_calls';
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
    logger.debug(`LocalProvider initialized with endpoint: ${this.endpoint}`);
  }

  private async makeRequest(body: LocalAPIRequest): Promise<LocalAPIResponse> {
    // specifiedエンドポイントを使用
    const endpoint = `${this.endpoint}/v1/chat/completions`;

    logger.debug(`Local API request started: ${endpoint}`, { 
      providerType: this.providerType,
      hasModel: !!body.model,
      timeout: this.providerOptions.timeout,
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
          
          logger.error('Fetch error details:', {
            name: fetchError instanceof Error ? fetchError.name : 'unknown',
            message: fetchError instanceof Error ? fetchError.message : fetchError,
            endpoint
          });
          
          if (fetchError instanceof Error) {
            if (fetchError.name === 'AbortError') {
              throw new Error(`Local API request timed out (${this.providerOptions.timeout / 1000} seconds)`);
            } else if (fetchError.message.includes('ECONNREFUSED')) {
              throw new Error(`Cannot connect to local server (${this.endpoint}). Please check if server is running.`);
            } else if (fetchError.message.includes('ENOTFOUND')) {
              throw new Error(`Local server address (${this.endpoint}) not found. Please check settings.`);
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
      logger.error('Local API request error after retries:', result.error);
      throw result.error!;
    }

    logger.debug('Local API request completed', {
      attemptCount: result.attemptCount,
      totalTime: result.totalTime,
    });
    return result.result!;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string | ChatResponse> {
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

      // Function Calling対応
      if (options?.tools && options.tools.length > 0) {
        body.tools = options.tools.map(tool => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters
          }
        }));
        
        if (options.tool_choice) {
          body.tool_choice = options.tool_choice;
        }
        
        // 大きすぎるリクエストを防ぐため、ツール数を制限
        // GPT-OSSは10個程度のツールで安定動作
        const MAX_TOOLS = 10;
        if (options.tools.length > MAX_TOOLS) {
          logger.debug(`Limiting tools from ${options.tools.length} to ${MAX_TOOLS} for GPT-OSS`);
          // 最も関連性の高いツールを選択
          body.tools = body.tools!.slice(0, MAX_TOOLS);
        }
        
        logger.debug(`Function calling enabled: ${options.tools.length} tools`, {
          tools: options.tools.map(t => t.name)
        });
      }

      // リクエストサイズを確認
      const requestSize = JSON.stringify(body).length;
      if (requestSize > 10000) {
        console.log(`[Debug] Large request: ${requestSize} bytes (${Math.round(requestSize/1024)}KB)`);
      }
      
      // Function Callingリクエストの詳細をログに出力
      if (body.tools && body.tools.length > 0) {
        console.log(`[Debug] Function Calling request:`);
        console.log(`  Tools count: ${body.tools.length}`);
        console.log(`  Tool choice: ${body.tool_choice}`);
        console.log(`  First 3 tools: ${body.tools.slice(0, 3).map(t => t.function.name).join(', ')}`);
        
        // リクエストボディをファイルに保存してデバッグ
        try {
          const fs = require('fs');
          fs.writeFileSync('/tmp/function_calling_request.json', JSON.stringify(body, null, 2));
          console.log(`[Debug] Request saved to /tmp/function_calling_request.json`);
        } catch (err) {
          // Ignore file write errors
        }
      }
      
      logger.debug(`LocalProvider chat started: ${this.providerType}`, {
        messageCount: localMessages.length,
        model: body.model,
        maxTokens: body.max_tokens,
        endpoint: this.endpoint,
        hasTools: !!body.tools,
        toolsCount: body.tools?.length,
        toolChoice: body.tool_choice,
        requestSize,
      });

      const response = await this.makeRequest(body);

      // デバッグ: レスポンス構造を確認
      console.log(`[Debug] Response analysis:`);
      console.log(`  Has choices: ${!!response.choices}`);
      console.log(`  Choices length: ${response.choices?.length}`);
      
      if (response.choices?.[0]) {
        const choice = response.choices[0];
        console.log(`  First choice:`);
        console.log(`    Has message: ${!!choice.message}`);
        console.log(`    Message keys: ${choice.message ? Object.keys(choice.message).join(', ') : 'none'}`);
        console.log(`    Has tool_calls: ${!!choice.message?.tool_calls}`);
        console.log(`    Tool calls length: ${choice.message?.tool_calls?.length || 0}`);
        console.log(`    Finish reason: ${choice.finish_reason}`);
        
        // レスポンスをファイルに保存
        try {
          const fs = require('fs');
          fs.writeFileSync('/tmp/function_calling_response.json', JSON.stringify(response, null, 2));
          console.log(`[Debug] Response saved to /tmp/function_calling_response.json`);
        } catch (err) {
          // Ignore file write errors
        }
      }
      
      logger.debug('Local API raw response structure:', {
        hasChoices: !!response.choices,
        choicesLength: response.choices?.length,
        firstChoice: response.choices?.[0] ? {
          hasMessage: !!response.choices[0].message,
          messageKeys: response.choices[0].message ? Object.keys(response.choices[0].message) : [],
          hasToolCalls: !!response.choices[0].message?.tool_calls,
          toolCallsLength: response.choices[0].message?.tool_calls?.length,
          finishReason: response.choices[0].finish_reason
        } : null
      });

      const choice = response.choices[0];
      if (!choice?.message) {
        throw new Error('Local API returned invalid response format');
      }

      const message = choice.message;
      const content = message.content || '';
      const tool_calls = message.tool_calls;
      const finish_reason = choice.finish_reason;

      // Function Calling レスポンスの場合
      if (tool_calls && tool_calls.length > 0) {
        logger.debug(`Tool calls detected: ${tool_calls.length} calls`);
        
        const chatResponse: ChatResponse = {
          content: content.trim(),
          tool_calls,
          finish_reason: finish_reason || 'tool_calls'
        };
        
        return chatResponse;
      }

      // 通常のテキストレスポンスの場合
      if (!content) {
        if (finish_reason === 'length') {
          throw new Error('Response reached maximum token limit. Please increase max_tokens.');
        } else {
          throw new Error('Local API returned empty response');
        }
      }

      const trimmedContent = content.trim();
      if (trimmedContent.length === 0) {
        throw new Error('Local API returned empty content');
      }

      logger.debug(`LocalProvider chat completed: ${trimmedContent.length} characters`);
      return trimmedContent;

    } catch (error) {
      logger.error('Local provider chat error:', error);
      
      // Improved error messages
      if (error instanceof Error) {
        if (error.message.includes('Cannot connect') || error.message.includes('ECONNREFUSED')) {
          throw new Error(`Failed to connect to local server (${this.endpoint}). Please check if server is running.`);
        } else if (error.message.includes('Timeout')) {
          throw new Error('Request to local server timed out. Please check server load.');
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

      logger.debug('LocalProvider completion started', {
        promptLength: options.prompt.length,
        model: body.model,
        endpoint: this.endpoint,
      });

      const response = await this.makeRequest(body);

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('Response is empty');
      }

      logger.debug(`LocalProvider completion completed: ${content.length} characters`);
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
      
      logger.debug('LocalProvider getting model list:', endpoint);
      
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
        logger.warn(`Failed to get model list: ${response.status} ${response.statusText}`);
        return ['local-model'];
      }

      const data = (await response.json()) as { data: Array<{ id: string }> };
      const models = data.data?.map((model) => model.id) || ['local-model'];
      
      logger.debug('LocalProvider model list retrieved:', models);
      return models;
    } catch (error) {
      logger.error('Local provider list models error:', error);
      // Errorの場合はデフォルトModelを返す
      return ['local-model'];
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      logger.debug(`LocalProvider connection validation started: ${this.endpoint}`);
      
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
          logger.debug('Local server connection validation success (/v1/models)');
          return true;
        }
        
        logger.debug(`Model endpoint response: ${modelsResponse.status} ${modelsResponse.statusText}`);
      } catch (modelsError) {
        logger.debug('Model endpoint connection failed:', modelsError);
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
          logger.debug(`Local server connection validation success (/v1/chat/completions): ${testResponse.status}`);
          return true;
        }
        
        logger.debug(`Chat completions test: ${testResponse.status} ${testResponse.statusText}`);
      } catch (testError) {
        logger.debug('Chat completions test failed:', testError);
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
          logger.debug(`Local server basic connection check: ${baseResponse.status}`);
          return true;
        }
      } catch (baseError) {
        logger.debug('Basic connection test also failed:', baseError);
      }

      logger.error(`LocalProvider connection validation failed: ${this.endpoint}`);
      return false;

    } catch (error) {
      logger.error('Local provider connection validation failed:', error);
      
      // ErrorログにDetailsInfoを記録
      if (error instanceof Error) {
        logger.error('Connection validation error details:', {
          message: error.message,
          endpoint: this.endpoint,
          providerType: this.providerType,
        });
        
        if (error.message.includes('ECONNREFUSED')) {
          logger.error(`Server (${this.endpoint}) may not be running`);
        } else if (error.message.includes('ENOTFOUND')) {
          logger.error(`Server address (${this.endpoint}) may be invalid`);
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

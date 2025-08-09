import type { ChatMessage } from '../config/types.js';
import { LLMProvider, type ChatOptions, type CompletionOptions, type ChatResponse, type ToolCall } from './base.js';
import { logger } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import { DynamicToolSelector } from '../mcp/tool-selector.js';
import { ToolLimitDetector } from '../mcp/tool-limit-detector.js';

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
  private responseFormatConfig?: {
    enabled: boolean;
    maxLineLength?: number;
    useSimpleLists?: boolean;
    avoidTables?: boolean;
    minimizeEmojis?: boolean;
  };
  private toolSelector: DynamicToolSelector;
  private toolLimitDetector: ToolLimitDetector;

  constructor(endpoint: string, providerType: 'local-gptoss' | 'local-lmstudio' = 'local-gptoss', options?: {
    timeout?: number;
    maxRetries?: number;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: {
      enabled: boolean;
      maxLineLength?: number;
      useSimpleLists?: boolean;
      avoidTables?: boolean;
      minimizeEmojis?: boolean;
    };
  }) {
    if (!endpoint) {
      throw new Error('endpoint が指定されていません');
    }
    super(undefined, endpoint, options);
    this.providerType = providerType;
    this.responseFormatConfig = options?.responseFormat;
    this.toolSelector = new DynamicToolSelector();
    this.toolLimitDetector = new ToolLimitDetector();
    
    // プロバイダー設定をツール選択器に設定
    this.toolSelector.setProvider(providerType);
    
    logger.debug(`LocalProvider initialized with endpoint: ${this.endpoint}`);
  }

  async complete(options: CompletionOptions): Promise<string> {
    // Convert single prompt to chat format
    const messages: ChatMessage[] = [
      { role: 'user', content: options.prompt }
    ];
    
    const response = await this.chat(messages, {
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });
    
    // Extract string from response
    if (typeof response === 'string') {
      return response;
    }
    return response.content;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string | ChatResponse> {
    try {
      logger.debug(`[LocalProvider] Starting chat with ${messages.length} messages`);
      
      // Tool handling
      const tools = options?.tools || [];
      let selectedTools = tools;
      
      if (tools.length > 0) {
        // Check if we've hit tool limit for this provider
        const limitReached = this.toolLimitDetector.isLimitReached(this.providerType);
        
        if (limitReached) {
          logger.info(`[LocalProvider] Tool limit reached for ${this.providerType}, disabling tools`);
          selectedTools = [];
        } else {
          // Select appropriate tools for this provider
          selectedTools = await this.toolSelector.selectTools(tools, messages);
          logger.debug(`[LocalProvider] Selected ${selectedTools.length} tools from ${tools.length} available`);
        }
      }
      
      // Prepare the request body
      const body: LocalAPIRequest = {
        model: options?.model || 'local-model',
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        temperature: options?.temperature ?? this.providerOptions.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? this.providerOptions.maxTokens ?? 4000,
        stream: false,
      };
      
      // Add tools if selected
      if (selectedTools.length > 0) {
        body.tools = selectedTools;
        body.tool_choice = options?.toolChoice || 'auto';
      }
      
      // Make the API request
      const response = await this.makeRequest(body);
      
      // Process the response
      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response from local LLM');
      }
      
      const choice = response.choices[0];
      
      // Check for tool calls
      if (choice.message?.tool_calls && choice.message.tool_calls.length > 0) {
        // Check if we've hit the limit
        const wasSuccessful = this.toolLimitDetector.recordToolUsage(
          this.providerType,
          choice.finish_reason === 'tool_calls'
        );
        
        if (!wasSuccessful) {
          logger.warn(`[LocalProvider] Tool usage seems to be failing for ${this.providerType}`);
        }
        
        return {
          content: choice.message.content || '',
          toolCalls: choice.message.tool_calls,
        } as ChatResponse;
      }
      
      // Return the text content
      const content = choice.message?.content || choice.text || '';
      return content;
    } catch (error) {
      logger.error('[LocalProvider] Chat error:', error);
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.endpoint}/v1/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        logger.warn(`[LocalProvider] Failed to list models: ${response.status}`);
        return ['local-model'];
      }
      
      const data = await response.json();
      return data.data?.map((model: any) => model.id) || ['local-model'];
    } catch (error) {
      logger.error('[LocalProvider] Failed to list models:', error);
      return ['local-model'];
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/v1/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(5000),
      });
      
      logger.debug(`[LocalProvider] Connection validation response: ${response.status}`);
      return response.ok;
    } catch (error) {
      logger.error('[LocalProvider] Connection validation failed:', error);
      return false;
    }
  }

  private async makeRequest(body: LocalAPIRequest): Promise<LocalAPIResponse> {
    // エンドポイントを使用
    const endpoint = `${this.endpoint}/v1/chat/completions`;
    
    logger.debug(`[LocalProvider] Making request to: ${endpoint}`);
    logger.debug(`[LocalProvider] Request body:`, JSON.stringify(body, null, 2));
    
    try {
      const response = await withRetry(
        async () => {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(this.providerOptions.timeout || 30000),
          });
          
          if (!res.ok) {
            const errorText = await res.text();
            logger.error(`[LocalProvider] HTTP error: ${res.status} - ${errorText}`);
            throw new Error(`HTTP error! status: ${res.status}, message: ${errorText}`);
          }
          
          return res;
        },
        {
          maxRetries: this.providerOptions.maxRetries || 3,
          retryDelay: 1000,
          shouldRetry: (error: any) => {
            // 5xx errors are retryable
            if (error.message?.includes('status: 5')) {
              return true;
            }
            // Network errors are retryable
            if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
              return true;
            }
            return false;
          },
        }
      );
      
      const data = await response.json();
      logger.debug(`[LocalProvider] Response received:`, JSON.stringify(data, null, 2));
      
      return data as LocalAPIResponse;
    } catch (error) {
      logger.error(`[LocalProvider] Request failed:`, error);
      throw error;
    }
  }
}

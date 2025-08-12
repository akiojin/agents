import { 
  LLMProvider, 
  ChatMessage, 
  CompletionOptions, 
  ChatOptions, 
  ChatResponse 
} from './base';
import { GeminiToOpenAIConverter, GeminiContent, OpenAIMessage } from '../../packages/adapter/gemini-to-openai';
import { logger } from '../utils/logger';

/**
 * Provider that adapts between Gemini and OpenAI formats
 * Enables connection to OpenAI-compatible APIs like LM Studio
 */
export class GeminiAdapterProvider extends LLMProvider {
  private model: string;
  private baseUrl: string;
  private converter: typeof GeminiToOpenAIConverter;

  constructor(apiKey: string, model: string = 'local-model', baseUrl: string = 'http://localhost:1234/v1') {
    super(apiKey, baseUrl);
    this.model = model;
    this.baseUrl = baseUrl;
    this.converter = GeminiToOpenAIConverter;
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
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add system prompt if configured
        const systemPrompt = await this.getSystemPrompt();
        const allMessages: ChatMessage[] = systemPrompt 
          ? [{ role: 'system', content: systemPrompt }, ...messages]
          : messages;

        // Convert to OpenAI format
        const openaiMessages = this.convertToOpenAIFormat(allMessages);

        // Make API request with timeout
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30秒のタイムアウト
        
        try {
          const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify({
              model: this.model,
              messages: openaiMessages,
              temperature: options?.temperature ?? this.providerOptions.temperature ?? 0.7,
              max_tokens: options?.maxTokens ?? this.providerOptions.maxTokens ?? 4000,
              stream: false,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeout);

          if (!response.ok) {
            const error = await response.text();
            throw new Error(`API request failed: ${response.status} - ${error}`);
          }

          const data = await response.json();
          
          if (!data.choices || data.choices.length === 0) {
            throw new Error('No response from API');
          }

          return data.choices[0].message.content || '';
        } catch (error: any) {
          clearTimeout(timeout);
          
          if (error.name === 'AbortError') {
            throw new Error('Request timed out after 30 seconds');
          }
          throw error;
        }
      } catch (error: any) {
        lastError = error;
        
        // リトライ可能なエラーかチェック
        const isRetryable = 
          error.message?.includes('terminated') ||
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('ECONNRESET') ||
          error.message?.includes('timed out') ||
          error.message?.includes('socket hang up');
        
        if (isRetryable && attempt < maxRetries) {
          logger.warn(`GeminiAdapterProvider chat attempt ${attempt} failed, retrying in ${attempt * 1000}ms:`, error.message);
          await new Promise(resolve => setTimeout(resolve, attempt * 1000));
          continue;
        }
        
        logger.error(`GeminiAdapterProvider chat error (attempt ${attempt}/${maxRetries}):`, error);
        throw error;
      }
    }
    
    // すべてのリトライが失敗した場合
    throw lastError || new Error('All retry attempts failed');
  }

  async listModels(): Promise<string[]> {
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10秒のタイムアウト
        
        const response = await fetch(`${this.baseUrl}/models`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        if (!response.ok) {
          throw new Error(`Failed to list models: ${response.status}`);
        }
        
        const data = await response.json();
        return data.data?.map((model: any) => model.id) || [];
      } catch (error: any) {
        const isRetryable = 
          error.name === 'AbortError' ||
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('ECONNRESET') ||
          error.message?.includes('terminated');
        
        if (isRetryable && attempt < maxRetries) {
          logger.warn(`GeminiAdapterProvider: List models attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
          continue;
        }
        
        logger.error(`GeminiAdapterProvider: Failed to list models after ${attempt} attempts:`, error.message);
        return [];
      }
    }
    
    return [];
  }

  async validateConnection(): Promise<boolean> {
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10秒のタイムアウト
        
        const response = await fetch(`${this.baseUrl}/models`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
          signal: controller.signal,
        });
        
        clearTimeout(timeout);
        
        if (response.ok) {
          logger.info(`GeminiAdapterProvider: Connection validated to ${this.baseUrl}`);
          return true;
        }
        
        logger.warn(`GeminiAdapterProvider: Connection validation failed with status ${response.status}`);
        return false;
      } catch (error: any) {
        const isRetryable = 
          error.name === 'AbortError' ||
          error.message?.includes('ECONNREFUSED') ||
          error.message?.includes('ECONNRESET') ||
          error.message?.includes('terminated');
        
        if (isRetryable && attempt < maxRetries) {
          logger.warn(`GeminiAdapterProvider: Connection validation attempt ${attempt} failed, retrying...`);
          await new Promise(resolve => setTimeout(resolve, attempt * 500));
          continue;
        }
        
        logger.error(`GeminiAdapterProvider: Connection validation failed after ${attempt} attempts:`, error.message);
        return false;
      }
    }
    
    return false;
  }

  private convertToOpenAIFormat(messages: ChatMessage[]): OpenAIMessage[] {
    // Convert our simple format to Gemini format first
    const geminiContents: GeminiContent[] = messages.map(msg => ({
      role: msg.role === 'system' ? 'user' : msg.role === 'assistant' ? 'model' : msg.role,
      parts: [{ text: msg.role === 'system' ? `System: ${msg.content}` : msg.content }],
    }));

    // Then use the converter to get OpenAI format
    return this.converter.convertContentsToMessages(geminiContents);
  }

  private async getSystemPrompt(): Promise<string | null> {
    // Use the parent class system prompt if set
    if (this.systemPrompt) {
      return this.systemPrompt;
    }
    
    // Get system prompt from environment or configuration
    const envPrompt = process.env.AGENTS_SYSTEM_PROMPT;
    if (envPrompt) {
      return envPrompt;
    }

    // Use DeepAgents system prompt
    const { DEEP_AGENT_SYSTEM_PROMPT } = await import('../../packages/prompts/deep-agent-system.js');
    return DEEP_AGENT_SYSTEM_PROMPT;
  }

  getName(): string {
    return 'gemini-adapter';
  }

  async isAvailable(): Promise<boolean> {
    return this.validateConnection();
  }
}
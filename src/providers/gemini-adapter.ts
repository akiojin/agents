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
    try {
      // Add system prompt if configured
      const systemPrompt = await this.getSystemPrompt();
      const allMessages: ChatMessage[] = systemPrompt 
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : messages;

      // Convert to OpenAI format
      const openaiMessages = this.convertToOpenAIFormat(allMessages);

      // Make API request
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
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API request failed: ${response.status} - ${error}`);
      }

      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('No response from API');
      }

      return data.choices[0].message.content || '';
    } catch (error) {
      logger.error('GeminiAdapterProvider chat error:', error);
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }
      
      const data = await response.json();
      return data.data?.map((model: any) => model.id) || [];
    } catch (error) {
      logger.error('Failed to list models:', error);
      return [];
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      return response.ok;
    } catch {
      return false;
    }
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
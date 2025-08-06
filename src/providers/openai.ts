import OpenAI from 'openai';
import type { ChatMessage } from '../types/config.js';
import { LLMProvider, type ChatOptions, type CompletionOptions } from './base.js';
import { logger } from '../utils/logger.js';

export class OpenAIProvider extends LLMProvider {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey: string, model?: string) {
    super(apiKey);
    this.client = new OpenAI({ apiKey });
    this.defaultModel = model || 'gpt-4-turbo-preview';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    try {
      const openaiMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const response = await this.client.chat.completions.create({
        model: options?.model || this.defaultModel,
        messages: openaiMessages,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 2000,
        stream: false as const,
      });

      if ('choices' in response) {
        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('応答が空です');
        }
        return content;
      } else {
        throw new Error('ストリーミング応答は非対応です');
      }
    } catch (error) {
      logger.error('OpenAI chat error:', error);
      throw error;
    }
  }

  async complete(options: CompletionOptions): Promise<string> {
    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.defaultModel,
        messages: [{ role: 'user', content: options.prompt }],
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: false as const,
      });

      if ('choices' in response) {
        const content = response.choices[0]?.message?.content;
        if (!content) {
          throw new Error('応答が空です');
        }
        return content;
      } else {
        throw new Error('ストリーミング応答は非対応です');
      }
    } catch (error) {
      logger.error('OpenAI completion error:', error);
      throw error;
    }
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
      await this.client.models.list();
      return true;
    } catch (error) {
      logger.error('OpenAI connection validation failed:', error);
      return false;
    }
  }
}

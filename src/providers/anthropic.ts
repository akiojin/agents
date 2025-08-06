import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from '../types/config.js';
import { LLMProvider, type ChatOptions, type CompletionOptions } from './base.js';
import { logger } from '../utils/logger.js';

export class AnthropicProvider extends LLMProvider {
  private client: Anthropic;
  private defaultModel: string;

  constructor(apiKey: string, model?: string) {
    super(apiKey);
    this.client = new Anthropic({ apiKey });
    this.defaultModel = model || 'claude-3-opus-20240229';
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    try {
      // システムメッセージとその他のメッセージを分離
      const systemMessage = messages.find((msg) => msg.role === 'system');
      const otherMessages = messages.filter((msg) => msg.role !== 'system');

      const anthropicMessages = otherMessages.map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      }));

      const response = await this.client.messages.create({
        model: options?.model || this.defaultModel,
        messages: anthropicMessages,
        system: systemMessage?.content,
        max_tokens: options?.maxTokens || 2000,
        temperature: options?.temperature || 0.7,
      });

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('テキスト以外の応答を受信しました');
      }

      return content.text;
    } catch (error) {
      logger.error('Anthropic chat error:', error);
      throw error;
    }
  }

  async complete(options: CompletionOptions): Promise<string> {
    try {
      const response = await this.client.messages.create({
        model: options.model || this.defaultModel,
        messages: [{ role: 'user', content: options.prompt }],
        max_tokens: options.maxTokens || 2000,
        temperature: options.temperature || 0.7,
      });

      const content = response.content[0];
      if (!content || content.type !== 'text') {
        throw new Error('テキスト以外の応答を受信しました');
      }

      return content.text;
    } catch (error) {
      logger.error('Anthropic completion error:', error);
      throw error;
    }
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
      // 最小限のリクエストで接続を確認
      await this.client.messages.create({
        model: this.defaultModel,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      });
      return true;
    } catch (error) {
      logger.error('Anthropic connection validation failed:', error);
      return false;
    }
  }
}

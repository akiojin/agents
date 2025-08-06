import type { ChatMessage } from '../types/config.js';
import { LLMProvider, type ChatOptions, type CompletionOptions } from './base.js';
import { logger } from '../utils/logger.js';

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

  constructor(endpoint: string, providerType: 'local-gptoss' | 'local-lmstudio') {
    super(undefined, endpoint);
    this.providerType = providerType;
  }

  private async makeRequest(body: LocalAPIRequest): Promise<LocalAPIResponse> {
    const endpoint =
      this.providerType === 'local-gptoss'
        ? `${this.endpoint}/v1/chat/completions`
        : `${this.endpoint}/v1/completions`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`ローカルAPI エラー: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<LocalAPIResponse>;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    try {
      const localMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const body: LocalAPIRequest = {
        messages: localMessages,
        temperature: options?.temperature || 0.7,
        max_tokens: options?.maxTokens || 2000,
        stream: options?.stream || false,
      };

      if (options?.model) {
        body.model = options.model;
      }

      const response = await this.makeRequest(body);

      const content =
        this.providerType === 'local-gptoss'
          ? response.choices[0]?.message?.content
          : response.choices[0]?.text;

      if (!content) {
        throw new Error('応答が空です');
      }

      return content;
    } catch (error) {
      logger.error('Local provider chat error:', error);
      throw error;
    }
  }

  async complete(options: CompletionOptions): Promise<string> {
    try {
      const body: LocalAPIRequest = {
        prompt: options.prompt,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: options.stream || false,
      };

      if (options.model) {
        body.model = options.model;
      }

      const response = await this.makeRequest(body);

      const content = response.choices[0]?.text || response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('応答が空です');
      }

      return content;
    } catch (error) {
      logger.error('Local provider completion error:', error);
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      // ローカルプロバイダーのモデルリストエンドポイント
      const endpoint = `${this.endpoint}/v1/models`;
      const response = await fetch(endpoint);

      if (!response.ok) {
        logger.warn('モデルリストの取得に失敗しました');
        return ['local-model'];
      }

      const data = (await response.json()) as { data: Array<{ id: string }> };
      return data.data.map((model) => model.id);
    } catch (error) {
      logger.error('Local provider list models error:', error);
      // エラーの場合はデフォルトモデルを返す
      return ['local-model'];
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.endpoint}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        // healthエンドポイントがない場合はmodelsエンドポイントを試す
        const modelsResponse = await fetch(`${this.endpoint}/v1/models`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
        });
        return modelsResponse.ok;
      }

      return true;
    } catch (error) {
      logger.error('Local provider connection validation failed:', error);
      return false;
    }
  }
}

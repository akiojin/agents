import type { ChatMessage } from '../types/config.js';

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  /** タイムアウト時間（ミリ秒、デフォルト: 30000） */
  timeout?: number;
}

export interface CompletionOptions extends ChatOptions {
  prompt: string;
}

export abstract class LLMProvider {
  protected apiKey?: string;
  protected endpoint?: string;
  protected providerOptions: {
    timeout: number;
    maxRetries: number;
    temperature?: number;
    maxTokens?: number;
  };

  constructor(
    apiKey?: string,
    endpoint?: string,
    options?: {
      timeout?: number;
      maxRetries?: number;
      temperature?: number;
      maxTokens?: number;
    },
  ) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.providerOptions = {
      timeout: options?.timeout || 30000, // デフォルト30秒
      maxRetries: options?.maxRetries || 3, // デフォルト3回
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };
  }

  abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  abstract complete(options: CompletionOptions): Promise<string>;
  abstract listModels(): Promise<string[]>;
  abstract validateConnection(): Promise<boolean>;

  /**
   * プロバイダー設定の取得
   */
  getProviderOptions() {
    return { ...this.providerOptions };
  }

  /**
   * プロバイダー設定の更新
   */
  updateProviderOptions(options: Partial<typeof this.providerOptions>): void {
    this.providerOptions = { ...this.providerOptions, ...options };
  }
}

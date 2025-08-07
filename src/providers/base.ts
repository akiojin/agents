import type { ChatMessage } from '../config/types.js';

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  /** Timeout時間（ミリseconds、デフォルト: 30000） */
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
      timeout: options?.timeout || 30000, // デフォルト30seconds
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
   * ProviderConfigのGet
   */
  getProviderOptions() {
    return { ...this.providerOptions };
  }

  /**
   * ProviderConfigのUpdate
   */
  updateProviderOptions(options: Partial<typeof this.providerOptions>): void {
    this.providerOptions = { ...this.providerOptions, ...options };
  }
}

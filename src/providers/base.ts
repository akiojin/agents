import type { ChatMessage } from '../config/types.js';

export interface FunctionCall {
  name: string;
  arguments: string; // JSON string
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: FunctionCall;
}

export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  /** Timeout時間（ミリseconds、デフォルト: 30000） */
  timeout?: number;
  /** Function Calling用のツール定義 */
  tools?: FunctionDefinition[];
  /** ツール使用の指定（'auto' | 'none' | { type: 'function', function: { name: string } }） */
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

export interface ChatResponse {
  content: string;
  tool_calls?: ToolCall[];
  finish_reason?: 'stop' | 'length' | 'tool_calls';
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
      timeout: options?.timeout || 120000, // デフォルト2minutes for complex queries
      maxRetries: options?.maxRetries || 3, // デフォルト3回
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
    };
  }

  abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<string | ChatResponse>;
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

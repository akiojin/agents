import type { ChatMessage } from '../types/config.js';

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface CompletionOptions extends ChatOptions {
  prompt: string;
}

export abstract class LLMProvider {
  protected apiKey?: string;
  protected endpoint?: string;

  constructor(apiKey?: string, endpoint?: string) {
    this.apiKey = apiKey;
    this.endpoint = endpoint;
  }

  abstract chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;
  abstract complete(options: CompletionOptions): Promise<string>;
  abstract listModels(): Promise<string[]>;
  abstract validateConnection(): Promise<boolean>;
}

import { LLMProvider, ChatMessage, CompletionOptions, ChatOptions, ChatResponse } from './base';
/**
 * Provider that adapts between Gemini and OpenAI formats
 * Enables connection to OpenAI-compatible APIs like LM Studio
 */
export declare class GeminiAdapterProvider extends LLMProvider {
    private model;
    private baseUrl;
    private converter;
    constructor(apiKey: string, model?: string, baseUrl?: string);
    complete(options: CompletionOptions): Promise<string>;
    chat(messages: ChatMessage[], options?: ChatOptions): Promise<string | ChatResponse>;
    listModels(): Promise<string[]>;
    validateConnection(): Promise<boolean>;
    private convertToOpenAIFormat;
    private getSystemPrompt;
    getName(): string;
    isAvailable(): Promise<boolean>;
}
//# sourceMappingURL=gemini-adapter.d.ts.map
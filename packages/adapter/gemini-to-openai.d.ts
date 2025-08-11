/**
 * Gemini format to OpenAI format converter
 * Adapted from open-gemini-cli
 */
export interface GeminiContent {
    role?: string;
    parts?: GeminiPart[];
}
export interface GeminiPart {
    text?: string;
    functionCall?: {
        name?: string;
        args?: any;
    };
    functionResponse?: {
        name?: string;
        response?: any;
    };
}
export interface OpenAIMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content?: string | null;
    tool_calls?: OpenAIToolCall[];
    tool_call_id?: string;
}
export interface OpenAIToolCall {
    id: string;
    type: 'function';
    function: {
        name: string;
        arguments: string;
    };
}
export declare class GeminiToOpenAIConverter {
    /**
     * Convert Gemini contents to OpenAI messages
     */
    static convertContentsToMessages(contents: GeminiContent[]): OpenAIMessage[];
    /**
     * Convert OpenAI messages to Gemini contents
     */
    static convertMessagesToContents(messages: OpenAIMessage[]): GeminiContent[];
    /**
     * Convert Gemini config to OpenAI parameters
     */
    static convertConfigToOpenAIParams(config?: any): any;
}
//# sourceMappingURL=gemini-to-openai.d.ts.map
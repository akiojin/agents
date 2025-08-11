"use strict";
/**
 * Gemini format to OpenAI format converter
 * Adapted from open-gemini-cli
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiToOpenAIConverter = void 0;
class GeminiToOpenAIConverter {
    /**
     * Convert Gemini contents to OpenAI messages
     */
    static convertContentsToMessages(contents) {
        const messages = [];
        for (let i = 0; i < contents.length; i++) {
            const content = contents[i];
            const role = content.role || 'user';
            const parts = content.parts || [];
            if (role === 'user') {
                let combinedText = '';
                const toolMessages = [];
                for (const part of parts) {
                    if (part.text) {
                        combinedText += part.text;
                    }
                    else if (part.functionResponse) {
                        const funcResponse = part.functionResponse;
                        const toolMessage = {
                            role: 'tool',
                            tool_call_id: `${funcResponse?.name || 'unknown'}:0`,
                            content: JSON.stringify(funcResponse?.response || {}),
                        };
                        toolMessages.push(toolMessage);
                    }
                }
                if (combinedText.trim()) {
                    messages.push({
                        role: 'user',
                        content: combinedText.trim(),
                    });
                }
                messages.push(...toolMessages);
            }
            else if (role === 'model') {
                let combinedText = '';
                const toolCalls = [];
                for (const part of parts) {
                    if (part.text) {
                        combinedText += part.text;
                    }
                    else if (part.functionCall) {
                        const isLastMessage = i === contents.length - 1;
                        let hasResponse = false;
                        // Check if there's a corresponding functionResponse
                        for (let j = i + 1; j < contents.length; j++) {
                            const nextContent = contents[j];
                            if (nextContent.role === 'user') {
                                for (const nextPart of nextContent.parts || []) {
                                    if (nextPart.functionResponse?.name === part.functionCall?.name) {
                                        hasResponse = true;
                                        break;
                                    }
                                }
                                if (hasResponse)
                                    break;
                            }
                        }
                        if (isLastMessage && !hasResponse) {
                            continue;
                        }
                        const funcCall = part.functionCall;
                        if (funcCall) {
                            const toolCall = {
                                id: `${funcCall.name || 'unknown'}:0`,
                                type: 'function',
                                function: {
                                    name: funcCall.name || '',
                                    arguments: JSON.stringify(funcCall.args || {}),
                                },
                            };
                            toolCalls.push(toolCall);
                        }
                    }
                }
                if (combinedText.trim() || toolCalls.length > 0) {
                    const assistantMessage = {
                        role: 'assistant',
                        content: combinedText.trim() || null,
                    };
                    if (toolCalls.length > 0) {
                        assistantMessage.tool_calls = toolCalls;
                    }
                    messages.push(assistantMessage);
                }
            }
        }
        return messages;
    }
    /**
     * Convert OpenAI messages to Gemini contents
     */
    static convertMessagesToContents(messages) {
        const contents = [];
        for (const message of messages) {
            if (message.role === 'system') {
                // System messages become user messages with special handling
                contents.push({
                    role: 'user',
                    parts: [{ text: `System: ${message.content}` }],
                });
            }
            else if (message.role === 'user') {
                contents.push({
                    role: 'user',
                    parts: [{ text: message.content || '' }],
                });
            }
            else if (message.role === 'assistant') {
                const parts = [];
                if (message.content) {
                    parts.push({ text: message.content });
                }
                if (message.tool_calls) {
                    for (const toolCall of message.tool_calls) {
                        parts.push({
                            functionCall: {
                                name: toolCall.function.name,
                                args: JSON.parse(toolCall.function.arguments),
                            },
                        });
                    }
                }
                contents.push({
                    role: 'model',
                    parts,
                });
            }
            else if (message.role === 'tool') {
                // Tool responses become function responses
                const toolCallId = message.tool_call_id || '';
                const functionName = toolCallId.split(':')[0];
                contents.push({
                    role: 'user',
                    parts: [{
                            functionResponse: {
                                name: functionName,
                                response: JSON.parse(message.content || '{}'),
                            },
                        }],
                });
            }
        }
        return contents;
    }
    /**
     * Convert Gemini config to OpenAI parameters
     */
    static convertConfigToOpenAIParams(config) {
        if (!config) {
            return {};
        }
        const openaiParams = {};
        if (config.temperature !== undefined) {
            openaiParams.temperature = config.temperature;
        }
        if (config.maxOutputTokens !== undefined) {
            openaiParams.max_tokens = config.maxOutputTokens;
        }
        if (config.topP !== undefined) {
            openaiParams.top_p = config.topP;
        }
        if (config.stopSequences !== undefined) {
            openaiParams.stop = config.stopSequences;
        }
        return openaiParams;
    }
}
exports.GeminiToOpenAIConverter = GeminiToOpenAIConverter;
//# sourceMappingURL=gemini-to-openai.js.map
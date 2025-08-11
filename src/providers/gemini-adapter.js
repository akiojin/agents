"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiAdapterProvider = void 0;
const base_1 = require("./base");
const gemini_to_openai_1 = require("../../packages/adapter/gemini-to-openai");
const logger_1 = require("../utils/logger");
/**
 * Provider that adapts between Gemini and OpenAI formats
 * Enables connection to OpenAI-compatible APIs like LM Studio
 */
class GeminiAdapterProvider extends base_1.LLMProvider {
    constructor(apiKey, model = 'local-model', baseUrl = 'http://localhost:1234/v1') {
        super(apiKey, baseUrl);
        this.model = model;
        this.baseUrl = baseUrl;
        this.converter = gemini_to_openai_1.GeminiToOpenAIConverter;
    }
    async complete(options) {
        // Convert single prompt to chat format
        const messages = [
            { role: 'user', content: options.prompt }
        ];
        const response = await this.chat(messages, {
            temperature: options.temperature,
            maxTokens: options.maxTokens,
        });
        // Extract string from response
        if (typeof response === 'string') {
            return response;
        }
        return response.content;
    }
    async chat(messages, options) {
        try {
            // Add system prompt if configured
            const systemPrompt = await this.getSystemPrompt();
            const allMessages = systemPrompt
                ? [{ role: 'system', content: systemPrompt }, ...messages]
                : messages;
            // Convert to OpenAI format
            const openaiMessages = this.convertToOpenAIFormat(allMessages);
            // Make API request
            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: openaiMessages,
                    temperature: options?.temperature ?? this.providerOptions.temperature ?? 0.7,
                    max_tokens: options?.maxTokens ?? this.providerOptions.maxTokens ?? 4000,
                    stream: false,
                }),
            });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`API request failed: ${response.status} - ${error}`);
            }
            const data = await response.json();
            if (!data.choices || data.choices.length === 0) {
                throw new Error('No response from API');
            }
            return data.choices[0].message.content || '';
        }
        catch (error) {
            logger_1.logger.error('GeminiAdapterProvider chat error:', error);
            throw error;
        }
    }
    async listModels() {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });
            if (!response.ok) {
                throw new Error(`Failed to list models: ${response.status}`);
            }
            const data = await response.json();
            return data.data?.map((model) => model.id) || [];
        }
        catch (error) {
            logger_1.logger.error('Failed to list models:', error);
            return [];
        }
    }
    async validateConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
    convertToOpenAIFormat(messages) {
        // Convert our simple format to Gemini format first
        const geminiContents = messages.map(msg => ({
            role: msg.role === 'system' ? 'user' : msg.role === 'assistant' ? 'model' : msg.role,
            parts: [{ text: msg.role === 'system' ? `System: ${msg.content}` : msg.content }],
        }));
        // Then use the converter to get OpenAI format
        return this.converter.convertContentsToMessages(geminiContents);
    }
    async getSystemPrompt() {
        // Use the parent class system prompt if set
        if (this.systemPrompt) {
            return this.systemPrompt;
        }
        // Get system prompt from environment or configuration
        const envPrompt = process.env.AGENTS_SYSTEM_PROMPT;
        if (envPrompt) {
            return envPrompt;
        }
        // Use DeepAgents system prompt
        const { DEEP_AGENT_SYSTEM_PROMPT } = await Promise.resolve().then(() => __importStar(require('../../packages/prompts/deep-agent-system.js')));
        return DEEP_AGENT_SYSTEM_PROMPT;
    }
    getName() {
        return 'gemini-adapter';
    }
    async isAvailable() {
        return this.validateConnection();
    }
}
exports.GeminiAdapterProvider = GeminiAdapterProvider;
//# sourceMappingURL=gemini-adapter.js.map
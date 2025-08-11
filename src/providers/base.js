"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMProvider = void 0;
class LLMProvider {
    constructor(apiKey, endpoint, options) {
        this.apiKey = apiKey;
        this.endpoint = endpoint;
        this.providerOptions = {
            timeout: options?.timeout || 30000, // デフォルト2minutes for complex queries
            maxRetries: options?.maxRetries || 3, // デフォルト3回
            temperature: options?.temperature,
            maxTokens: options?.maxTokens,
        };
    }
    /**
     * ProviderConfigのGet
     */
    getProviderOptions() {
        return { ...this.providerOptions };
    }
    /**
     * ProviderConfigのUpdate
     */
    updateProviderOptions(options) {
        this.providerOptions = { ...this.providerOptions, ...options };
    }
}
exports.LLMProvider = LLMProvider;
//# sourceMappingURL=base.js.map
import type { Config } from '../config/types.js';
import type { LLMProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { LocalProvider } from './local.js';
import { isValidApiKey, isValidUrl, isDefined } from '../utils/type-guards.js';

export function createProvider(config: Config): LLMProvider {
  switch (config.llm.provider) {
    case 'openai':
      if (!config.llm.apiKey) {
        throw new Error('OpenAI APIキーがConfignot initialized');
      }
      return new OpenAIProvider(config.llm.apiKey, config.llm.model, {
        timeout: config.llm.timeout,
        maxRetries: config.llm.maxRetries,
        temperature: config.llm.temperature,
        maxTokens: config.llm.maxTokens,
      });

    case 'anthropic':
      if (!config.llm.apiKey) {
        throw new Error('Anthropic APIキーがConfignot initialized');
      }
      return new AnthropicProvider(config.llm.apiKey, config.llm.model, {
        timeout: config.llm.timeout,
        maxRetries: config.llm.maxRetries,
        temperature: config.llm.temperature,
        maxTokens: config.llm.maxTokens,
      });

    case 'local-gptoss':
    case 'local-lmstudio':
      // LocalエンドポイントはConfigから取得（必須）
      if (!config.localEndpoint) {
        throw new Error('localEndpoint が設定ファイルに定義されていません');
      }
      const endpoint = config.localEndpoint;
      return new LocalProvider(endpoint, config.llm.provider, {
        timeout: config.llm.timeout,
        maxRetries: config.llm.maxRetries,
        temperature: config.llm.temperature,
        maxTokens: config.llm.maxTokens,
      });

    default:
      throw new Error(`サポートされていないProvider: ${config.llm.provider}`);
  }
}

/**
 * 統一Configシステム用のファクトリー関数
 */
export function createProviderFromUnifiedConfig(
  config: import('../config/types.js').Config,
): LLMProvider {
  const providerOptions = {
    timeout: config.llm.timeout,
    maxRetries: config.llm.maxRetries,
    temperature: config.llm.temperature,
    maxTokens: config.llm.maxTokens,
  };

  switch (config.llm.provider) {
    case 'openai':
      if (!isValidApiKey(config.llm.apiKey)) {
        throw new Error('OpenAI APIキーがConfignot initialized');
      }
      return new OpenAIProvider(config.llm.apiKey, config.llm.model, providerOptions);

    case 'anthropic':
      if (!isValidApiKey(config.llm.apiKey)) {
        throw new Error('Anthropic APIキーがConfignot initialized');
      }
      return new AnthropicProvider(config.llm.apiKey, config.llm.model, providerOptions);

    case 'local-gptoss':
    case 'local-lmstudio': {
      // LocalエンドポイントはConfigから取得（必須）
      if (!config.localEndpoint) {
        throw new Error('localEndpoint が設定ファイルに定義されていません');
      }
      const endpoint = config.localEndpoint;
      
      const localProviderOptions = {
        ...providerOptions,
        responseFormat: config.llm.responseFormat
      };
      return new LocalProvider(endpoint, config.llm.provider, localProviderOptions);
    }

    default:
      throw new Error(`サポートされていないProvider: ${config.llm.provider}`);
  }
}

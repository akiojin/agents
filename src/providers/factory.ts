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
      // Localエンドポイントは環境変数またはデフォルト値を使用
      const endpoint = process.env.AGENTS_LOCAL_ENDPOINT || 'http://127.0.0.1:1234';
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
      // Localエンドポイントは設定ファイル、環境変数、デフォルト値の順で優先
      const configEndpoint = config.localEndpoint;
      const envEndpoint = process.env.AGENTS_LOCAL_ENDPOINT;
      
      const endpoint = 
        (isDefined(configEndpoint) && isValidUrl(configEndpoint)) ? configEndpoint :
        (isDefined(envEndpoint) && isValidUrl(envEndpoint)) ? envEndpoint :
        'http://127.0.0.1:1234';
      
      return new LocalProvider(endpoint, config.llm.provider, providerOptions);
    }

    default:
      throw new Error(`サポートされていないProvider: ${config.llm.provider}`);
  }
}

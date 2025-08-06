import type { Config } from '../types/config.js';
import { LLMProvider } from './base.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { LocalProvider } from './local.js';

export function createProvider(config: Config): LLMProvider {
  switch (config.provider) {
    case 'openai':
      if (!config.apiKey) {
        throw new Error('OpenAI APIキーが設定されていません');
      }
      return new OpenAIProvider(config.apiKey, config.model);

    case 'anthropic':
      if (!config.apiKey) {
        throw new Error('Anthropic APIキーが設定されていません');
      }
      return new AnthropicProvider(config.apiKey, config.model);

    case 'local-gptoss':
    case 'local-lmstudio':
      if (!config.localEndpoint) {
        throw new Error('ローカルエンドポイントが設定されていません');
      }
      return new LocalProvider(config.localEndpoint, config.provider);

    default:
      throw new Error(`サポートされていないプロバイダー: ${config.provider}`);
  }
}
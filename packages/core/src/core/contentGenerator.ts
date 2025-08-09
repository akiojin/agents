/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { Config } from '../config/config.js';
import { getEffectiveModel } from './modelCheck.js';
import { UserTierId } from '../code_assist/types.js';
import { createAgentsContentGenerator } from './agentsContentGenerator.js';
import { OpenAIContentGenerator } from './openaiContentGenerator.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  getTier?(): Promise<UserTierId | undefined>;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  OPENAI_COMPATIBLE = 'openai-compatible',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
};

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): ContentGeneratorConfig {
  // authTypeが明示的に指定されている場合は、それを優先する
  // 環境変数は、authTypeに応じて選択的に使用する
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const googleApiKey = process.env.GOOGLE_API_KEY || undefined;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || undefined;

  // For OPENAI_COMPATIBLE, prioritize environment variables to avoid circular dependency
  let effectiveModel: string;
  
  if (authType === AuthType.OPENAI_COMPATIBLE) {
    // For OpenAI Compatible API, check environment variables first
    effectiveModel = process.env.OPENAI_MODEL || process.env.LOCAL_LLM_MODEL || 'llama-3.2-3b-instruct';
    console.debug(`[ContentGenerator] OPENAI_COMPATIBLE model resolved: ${effectiveModel} (OPENAI_MODEL: ${process.env.OPENAI_MODEL}, LOCAL_LLM_MODEL: ${process.env.LOCAL_LLM_MODEL})`);
  } else {
    // Use runtime model from config if available, otherwise fallback to default
    effectiveModel = config.getModel() || DEFAULT_GEMINI_MODEL;
    console.debug(`[ContentGenerator] Non-OPENAI model resolved: ${effectiveModel}`);
  }

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  // authTypeが明示的にUSE_GEMINIの場合のみGEMINI_API_KEYを使用
  if (authType === AuthType.USE_GEMINI) {
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY is required for Gemini API authentication');
    }
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.vertexai = false;
    getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    ).then((newModel) => {
      if (newModel !== contentGeneratorConfig.model) {
        config.flashFallbackHandler?.(contentGeneratorConfig.model, newModel);
      }
    });

    return contentGeneratorConfig;
  }

  // authTypeが明示的にUSE_VERTEX_AIの場合のみVertex AI設定を使用
  if (authType === AuthType.USE_VERTEX_AI) {
    if (!googleApiKey && !(googleCloudProject && googleCloudLocation)) {
      throw new Error('GOOGLE_API_KEY or GOOGLE_CLOUD_PROJECT/LOCATION is required for Vertex AI authentication');
    }
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;

    return contentGeneratorConfig;
  }

  if (authType === AuthType.OPENAI_COMPATIBLE) {
    const baseUrl = process.env.OPENAI_BASE_URL || process.env.LOCAL_LLM_BASE_URL;
    const isLocalLLM = baseUrl && (
      baseUrl.includes('localhost') || 
      baseUrl.includes('127.0.0.1') || 
      baseUrl.includes('0.0.0.0') ||
      baseUrl.includes('host.docker.internal')
    );
    
    // ローカルLLMの場合はAPI KEY不要
    if (!isLocalLLM) {
      contentGeneratorConfig.apiKey = process.env.OPENAI_API_KEY;
    }
    
    // モデル設定は既に上部で設定済み
    
    console.log('[ContentGeneratorConfig] OpenAI Compatible settings:', {
      baseUrl,
      isLocalLLM,
      model: contentGeneratorConfig.model,
      hasApiKey: !!contentGeneratorConfig.apiKey,
    });
    
    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    const version = process.env.CLI_VERSION || process.version;
    const httpOptions = {
      headers: {
        'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
      },
    };
    return createCodeAssistContentGenerator(
      httpOptions,
      config.authType,
      gcConfig,
      sessionId,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    return createAgentsContentGenerator(config);
  }

  if (config.authType === AuthType.OPENAI_COMPATIBLE) {
    console.log('[ContentGenerator] Creating OpenAI Compatible API generator');
    console.log('[ContentGenerator] Config:', {
      authType: config.authType,
      model: config.model,
      hasApiKey: !!config.apiKey,
    });
    return new OpenAIContentGenerator(config);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}

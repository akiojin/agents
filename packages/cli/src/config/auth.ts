/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthType } from '@indenscale/open-gemini-cli-core';
import { loadEnvironment } from './settings.js';

export const validateAuthMethod = (authMethod: string): string | null => {
  loadEnvironment();
  if (
    authMethod === AuthType.LOGIN_WITH_GOOGLE ||
    authMethod === AuthType.CLOUD_SHELL
  ) {
    return null;
  }

  if (authMethod === AuthType.USE_GEMINI) {
    if (!process.env.GEMINI_API_KEY) {
      return 'GEMINI_API_KEY environment variable not found. Add that to your environment and try again (no reload needed if using .env)!';
    }
    return null;
  }

  if (authMethod === AuthType.USE_VERTEX_AI) {
    const hasVertexProjectLocationConfig =
      !!process.env.GOOGLE_CLOUD_PROJECT && !!process.env.GOOGLE_CLOUD_LOCATION;
    const hasGoogleApiKey = !!process.env.GOOGLE_API_KEY;
    if (!hasVertexProjectLocationConfig && !hasGoogleApiKey) {
      return (
        'When using Vertex AI, you must specify either:\n' +
        '• GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_LOCATION environment variables.\n' +
        '• GOOGLE_API_KEY environment variable (if using express mode).\n' +
        'Update your environment and try again (no reload needed if using .env)!'
      );
    }
    return null;
  }

  if (authMethod === AuthType.OPENAI_COMPATIBLE) {
    // ローカルLLMまたはOpenAI互換APIの設定
    const baseUrl = process.env.OPENAI_BASE_URL || process.env.LOCAL_LLM_BASE_URL;
    
    if (!baseUrl) {
      return 'OPENAI_BASE_URL or LOCAL_LLM_BASE_URL environment variable not found. Add one to your environment and try again (no reload needed if using .env)!';
    }
    
    // ローカルLLMの場合はAPI KEYは不要
    const isLocalLLM = baseUrl.includes('localhost') || 
                       baseUrl.includes('127.0.0.1') || 
                       baseUrl.includes('0.0.0.0') ||
                       baseUrl.includes('host.docker.internal');
    
    if (!isLocalLLM && !process.env.OPENAI_API_KEY) {
      return 'OPENAI_API_KEY environment variable not found for external API. Add that to your environment and try again (no reload needed if using .env)!';
    }
    
    return null;
  }

  return 'Invalid auth method selected.';
};

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

type Model = string;
type TokenCount = number;

export const DEFAULT_TOKEN_LIMIT = 1_048_576;

// 既知のローカルモデルのコンテキスト長
const LOCAL_MODEL_LIMITS: Record<string, TokenCount> = {
  // Qwen models (256K context)
  'qwen/qwen3-coder-30b': 262_144,
  'qwen3-coder-30b': 262_144,
  'qwen3-coder-30b-a3b': 262_144,
  'qwen3-coder-30b-a3b-instruct': 262_144,
  
  // GPT-OSS models (32K context)
  'openai/gpt-oss-20b': 32_768,
  'gpt-oss-20b': 32_768,
  
  // Other common local models
  'llama-3-8b': 8_192,
  'llama-3-70b': 8_192,
  'codellama-34b': 16_384,
  'mistral-7b': 32_768,
  'mixtral-8x7b': 32_768,
};

export function tokenLimit(model: Model): TokenCount {
  // まずローカルモデルをチェック
  const localLimit = LOCAL_MODEL_LIMITS[model.toLowerCase()];
  if (localLimit) {
    return localLimit;
  }

  // Add other models as they become relevant or if specified by config
  // Pulled from https://ai.google.dev/gemini-api/docs/models
  switch (model) {
    case 'gemini-1.5-pro':
      return 2_097_152;
    case 'gemini-1.5-flash':
    case 'gemini-2.5-pro-preview-05-06':
    case 'gemini-2.5-pro-preview-06-05':
    case 'gemini-2.5-pro':
    case 'gemini-2.5-flash-preview-05-20':
    case 'gemini-2.5-flash':
    case 'gemini-2.0-flash':
      return 1_048_576;
    case 'gemini-2.0-flash-preview-image-generation':
      return 32_000;
    default:
      return DEFAULT_TOKEN_LIMIT;
  }
}

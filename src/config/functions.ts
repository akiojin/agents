import { SecurityConfig } from '../functions/security.js';

/**
 * 内部関数の設定
 */
export interface FunctionConfig {
  filesystem: {
    enabled: boolean;
    security: SecurityConfig;
  };
}

/**
 * デフォルト内部関数設定
 */
export const DEFAULT_FUNCTION_CONFIG: FunctionConfig = {
  filesystem: {
    enabled: true,
    security: {
      allowedPaths: [process.cwd()],
      allowCurrentDirectoryChange: true,
      restrictToStartupDirectory: true
    }
  }
};

/**
 * 環境変数から設定を生成
 */
export function createFunctionConfigFromEnv(): FunctionConfig {
  const config = { ...DEFAULT_FUNCTION_CONFIG };

  // 環境変数での設定オーバーライド
  if (process.env.AGENTS_FILESYSTEM_ENABLED !== undefined) {
    config.filesystem.enabled = process.env.AGENTS_FILESYSTEM_ENABLED === 'true';
  }

  if (process.env.AGENTS_FILESYSTEM_ALLOWED_PATHS) {
    const paths = process.env.AGENTS_FILESYSTEM_ALLOWED_PATHS.split(',').map(p => p.trim());
    config.filesystem.security.allowedPaths = paths;
  }

  if (process.env.AGENTS_FILESYSTEM_ALLOW_CD !== undefined) {
    config.filesystem.security.allowCurrentDirectoryChange = process.env.AGENTS_FILESYSTEM_ALLOW_CD === 'true';
  }

  if (process.env.AGENTS_FILESYSTEM_RESTRICT_STARTUP !== undefined) {
    config.filesystem.security.restrictToStartupDirectory = process.env.AGENTS_FILESYSTEM_RESTRICT_STARTUP === 'true';
  }

  return config;
}

/**
 * 設定の検証
 */
export function validateFunctionConfig(config: FunctionConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // ファイルシステム設定の検証
  if (config.filesystem.enabled) {
    if (!config.filesystem.security.allowedPaths || config.filesystem.security.allowedPaths.length === 0) {
      errors.push('Filesystem is enabled but no allowed paths are configured');
    }

    for (const path of config.filesystem.security.allowedPaths) {
      if (!path || typeof path !== 'string') {
        errors.push(`Invalid allowed path: ${path}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
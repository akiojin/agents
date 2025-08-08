import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';
import { z } from 'zod';
import type { Config } from './types.js';
import { DEFAULT_CONFIG, ENV_MAPPING } from './types.js';
import { logger } from '../utils/logger.js';
import { MCPLoader } from './mcp-loader.js';

/**
 * Configスキーマの定義
 */
const ConfigSchema = z.object({
  llm: z.object({
    provider: z.enum(['openai', 'anthropic', 'local-gptoss', 'local-lmstudio']),
    apiKey: z.string().optional(),
    model: z.string().optional(),
    timeout: z.number().positive().default(60000),
    maxRetries: z.number().min(0).default(3),
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().positive().optional(),
  }),
  mcp: z.object({
    servers: z
      .array(
        z.object({
          name: z.string(),
          command: z.string(),
          args: z.array(z.string()).optional(),
          env: z.record(z.string()).optional(),
        }),
      )
      .default([]),
    timeout: z.number().positive().default(30000), // 2minutes for MCP operations
    enabled: z.boolean().default(true),
    maxRetries: z.number().min(0).default(2),
  }),
  app: z.object({
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    logDir: z.string().default('./logs'),
    maxParallel: z.number().positive().default(5),
    silent: z.boolean().default(false),
    timeout: z.number().positive().default(300000),
  }),
  paths: z.object({
    cache: z.string().default('.agents-cache'),
    history: z.string().default('.agents-history'),
    config: z.string().default('settings.json'),
  }),
  localEndpoint: z.string().url().optional(),
});

/**
 * 統一されたConfigローダー
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config | null = null;
  private configPath: string;

  private constructor() {
    // .agents/settings.jsonのみ対応
    this.configPath = join(process.cwd(), '.agents', 'settings.json');
  }

  /**
   * シングルトンインスタンスのGet
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * ConfigのLoad
   */
  public async load(customPath?: string): Promise<Config> {
    if (customPath) {
      this.configPath = customPath;
    }

    // キャッシュされたConfigを返す
    if (this.config) {
      return this.config;
    }

    try {
      // 1. Configファイルが存在しない場合はデフォルトで作成
      if (!existsSync(this.configPath)) {
        logger.info(`Settings file not found: ${this.configPath}. Creating with default values.`);
        await this.createDefaultConfigFile();
      }

      // 2. デフォルトConfigからStarted
      let config = this.deepClone(DEFAULT_CONFIG);

      // 3. Configファイルからロード（必ず存在する）
      const fileConfig = await this.loadFromFile();
      config = this.deepMerge(config, fileConfig);

      // 4. 環境変数のLoad
      const envConfig = this.loadFromEnv();
      config = this.deepMerge(config, envConfig);

      // 5. .mcp.jsonからMCPサーバー設定をLoad
      const mcpServers = await MCPLoader.loadMCPConfig();
      if (mcpServers.length > 0) {
        logger.info(`Loaded ${mcpServers.length} MCP servers from .mcp.json`);
        config.mcp.servers = [...config.mcp.servers, ...mcpServers];
        // .mcp.jsonが存在する場合はMCPを自動的に有効化
        if (config.mcp.enabled === false) {
          config.mcp.enabled = true;
          logger.info('MCP enabled automatically due to .mcp.json presence');
        }
      }

      // 6. ConfigのValidation
      this.config = ConfigSchema.parse(config);

      logger.debug('Configをロード完了:', this.config);
      return this.config;
    } catch (error) {
      logger.error('ConfigのLoadに失敗:', error);
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * デフォルト設定でConfigファイルを作成
   */
  private async createDefaultConfigFile(): Promise<void> {
    // ディレクトリが存在しない場合は作成
    const configDir = join(process.cwd(), '.agents');
    if (!existsSync(configDir)) {
      await import('fs/promises').then(fs => fs.mkdir(configDir, { recursive: true }));
      logger.info(`Created config directory: ${configDir}`);
    }

    // デフォルト設定をファイルに保存
    const content = JSON.stringify(DEFAULT_CONFIG, null, 2);
    await writeFile(this.configPath, content, 'utf-8');
    logger.info(`Created default settings file: ${this.configPath}`);
  }

  /**
   * ConfigのSave
   */
  public async save(config: Partial<Config>): Promise<void> {
    const mergedConfig = this.deepMerge(this.deepClone(DEFAULT_CONFIG), config);

    const validated = ConfigSchema.parse(mergedConfig);

    // ファイル拡張子に応じて保存形式を変更
    let content: string;
    if (this.configPath.endsWith('.json')) {
      content = JSON.stringify(validated, null, 2);
    } else {
      content = yaml.stringify(validated, {
        indent: 2,
        lineWidth: 80,
      });
    }

    await writeFile(this.configPath, content, 'utf-8');
    this.config = validated;

    logger.info('ConfigをSavedone:', this.configPath);
  }

  /**
   * Configファイルの存在Check
   */
  public async exists(): Promise<boolean> {
    return existsSync(this.configPath);
  }

  /**
   * 現在のConfigをGet
   */
  public getConfig(): Config {
    if (!this.config) {
      throw new Error('Configが読み込まれていnot。load()を最初に呼び出してplease。');
    }
    return this.config;
  }

  /**
   * Configのリロード
   */
  public async reload(): Promise<Config> {
    this.config = null;
    return await this.load();
  }

  /**
   * ConfigファイルからのLoad
   */
  private async loadFromFile(): Promise<Partial<Config>> {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      
      // ファイル拡張子に応じてパース方法を変更
      if (this.configPath.endsWith('.json')) {
        return JSON.parse(content) as Partial<Config>;
      } else {
        return yaml.parse(content) as Partial<Config>;
      }
    } catch (error) {
      logger.warn('ConfigファイルのLoadにFaileddone:', error);
      return {};
    }
  }

  /**
   * 環境変数からのLoad
   */
  private loadFromEnv(): Partial<Config> {
    const config: Record<string, unknown> = {};

    for (const [envKey, configPath] of Object.entries(ENV_MAPPING)) {
      const envValue = process.env[envKey];
      if (envValue !== undefined) {
        this.setNestedValue(config, configPath, this.parseEnvValue(envValue));
      }
    }

    return config as Partial<Config>;
  }

  /**
   * 環境変数値のパース
   */
  private parseEnvValue(value: string): string | number | boolean {
    // 数値のConvert
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }

    // ブール値のConvert
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    return value;
  }

  /**
   * ネストされたオブジェクトへの値のConfig
   */
  private setNestedValue(obj: Record<string, unknown>, path: string, value: string | number | boolean): void {
    const keys = path.split('.');
    let current: Record<string, unknown> = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key] as Record<string, unknown>;
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * ディープクローン
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * ディープマージ
   */
  private deepMerge<T>(target: T, source: Partial<T>): T {
    const result = { ...target };

    for (const key in source) {
      const sourceValue = source[key];
      const targetValue = result[key];
      
      if (sourceValue !== null && typeof sourceValue === 'object' && !Array.isArray(sourceValue)) {
        (result as Record<string, unknown>)[key] = this.deepMerge(
          targetValue || {}, 
          sourceValue
        );
      } else {
        (result as Record<string, unknown>)[key] = sourceValue;
      }
    }

    return result;
  }
}

/**
 * グローバルConfigインスタンス
 */
export const config = ConfigManager.getInstance();

/**
 * Configを読み込む便利関数（後方互換性のため）
 */
export async function loadConfig(customPath?: string): Promise<Config> {
  return await config.load(customPath);
}

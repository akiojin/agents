import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';
import { z } from 'zod';
import type { Config } from './types.js';
import { DEFAULT_CONFIG, ENV_MAPPING } from './types.js';
import { logger } from '../utils/logger.js';

/**
 * 設定スキーマの定義
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
    timeout: z.number().positive().default(30000),
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
    config: z.string().default('.agents.yaml'),
  }),
  localEndpoint: z.string().url().optional(),
});

/**
 * 統一された設定ローダー
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Config | null = null;
  private configPath: string;

  private constructor() {
    this.configPath = join(process.cwd(), '.agents.yaml');
  }

  /**
   * シングルトンインスタンスの取得
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 設定の読み込み
   */
  public async load(customPath?: string): Promise<Config> {
    if (customPath) {
      this.configPath = customPath;
    }

    // キャッシュされた設定を返す
    if (this.config) {
      return this.config;
    }

    try {
      // 1. デフォルト設定から開始
      let config = this.deepClone(DEFAULT_CONFIG);

      // 2. 設定ファイルの読み込み
      if (existsSync(this.configPath)) {
        const fileConfig = await this.loadFromFile();
        config = this.deepMerge(config, fileConfig);
      }

      // 3. 環境変数の読み込み
      const envConfig = this.loadFromEnv();
      config = this.deepMerge(config, envConfig);

      // 4. 設定の検証
      this.config = ConfigSchema.parse(config);

      logger.debug('設定を読み込みました:', this.config);
      return this.config;
    } catch (error) {
      logger.error('設定の読み込みに失敗しました:', error);
      this.config = DEFAULT_CONFIG;
      return this.config;
    }
  }

  /**
   * 設定の保存
   */
  public async save(config: Partial<Config>): Promise<void> {
    const mergedConfig = this.deepMerge(this.deepClone(DEFAULT_CONFIG), config);

    const validated = ConfigSchema.parse(mergedConfig);

    const yamlContent = yaml.stringify(validated, {
      indent: 2,
      lineWidth: 80,
    });

    await writeFile(this.configPath, yamlContent, 'utf-8');
    this.config = validated;

    logger.info('設定を保存しました:', this.configPath);
  }

  /**
   * 設定ファイルの存在確認
   */
  public async exists(): Promise<boolean> {
    return existsSync(this.configPath);
  }

  /**
   * 現在の設定を取得
   */
  public getConfig(): Config {
    if (!this.config) {
      throw new Error('設定が読み込まれていません。load()を最初に呼び出してください。');
    }
    return this.config;
  }

  /**
   * 設定のリロード
   */
  public async reload(): Promise<Config> {
    this.config = null;
    return await this.load();
  }

  /**
   * 設定ファイルからの読み込み
   */
  private async loadFromFile(): Promise<Partial<Config>> {
    try {
      const content = await readFile(this.configPath, 'utf-8');
      return yaml.parse(content) as Partial<Config>;
    } catch (error) {
      logger.warn('設定ファイルの読み込みに失敗しました:', error);
      return {};
    }
  }

  /**
   * 環境変数からの読み込み
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
    // 数値の変換
    if (/^\d+$/.test(value)) {
      return parseInt(value, 10);
    }

    // ブール値の変換
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;

    return value;
  }

  /**
   * ネストされたオブジェクトへの値の設定
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
 * グローバル設定インスタンス
 */
export const config = ConfigManager.getInstance();

/**
 * 設定を読み込む便利関数（後方互換性のため）
 */
export async function loadConfig(customPath?: string): Promise<Config> {
  return await config.load(customPath);
}

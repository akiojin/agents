import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import yaml from 'yaml';
import { z } from 'zod';
import type { Config } from '../config/types.js';

// 設定スキーマの定義
const ConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'local-gptoss', 'local-lmstudio']),
  apiKey: z.string().optional(),
  localEndpoint: z.string().url().optional(),
  model: z.string().optional(),
  useMCP: z.boolean().default(true),
  maxParallel: z.number().min(1).max(10).default(5),
  timeout: z.number().min(10).max(3600).default(300),
  mcpServers: z
    .array(
      z.object({
        name: z.string(),
        command: z.string(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
      }),
    )
    .optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  cachePath: z.string().default('.agents-cache'),
  historyPath: z.string().default('.agents-history'),
});

const DEFAULT_CONFIG_FILENAME = '.agents.yaml';

class ConfigLoader {
  private config: Config | null = null;
  private configPath: string;

  constructor() {
    this.configPath = join(process.cwd(), DEFAULT_CONFIG_FILENAME);
  }

  async load(customPath?: string): Promise<Config> {
    if (customPath) {
      this.configPath = customPath;
    }

    // キャッシュされた設定を返す
    if (this.config) {
      return this.config;
    }

    // 設定ファイルが存在しない場合はデフォルト設定を返す
    if (!existsSync(this.configPath)) {
      return this.getDefaultConfig();
    }

    try {
      const content = await readFile(this.configPath, 'utf-8');
      const parsed = yaml.parse(content);
      this.config = ConfigSchema.parse(parsed);
      return this.config;
    } catch (error) {
      console.error('設定ファイルの読み込みに失敗しました:', error);
      return this.getDefaultConfig();
    }
  }

  async save(config: Partial<Config>): Promise<void> {
    const mergedConfig = { ...this.getDefaultConfig(), ...config };
    const validated = ConfigSchema.parse(mergedConfig);

    const yamlContent = yaml.stringify(validated, {
      indent: 2,
      lineWidth: 80,
    });

    await writeFile(this.configPath, yamlContent, 'utf-8');
    this.config = validated;
  }

  async exists(): Promise<boolean> {
    return existsSync(this.configPath);
  }

  getDefaultConfig(): Config {
    return {
      provider: 'openai',
      useMCP: true,
      maxParallel: 5,
      timeout: 300,
      logLevel: 'info',
      cachePath: '.agents-cache',
      historyPath: '.agents-history',
      mcpServers: [
        {
          name: 'filesystem',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem'],
        },
      ],
    };
  }

  // 環境変数から設定を読み込む
  loadFromEnv(): Partial<Config> {
    const config: Partial<Config> = {};

    if (process.env.AGENTS_PROVIDER) {
      config.provider = process.env.AGENTS_PROVIDER as Config['provider'];
    }

    if (process.env.AGENTS_API_KEY) {
      config.apiKey = process.env.AGENTS_API_KEY;
    }

    if (process.env.AGENTS_LOCAL_ENDPOINT) {
      config.localEndpoint = process.env.AGENTS_LOCAL_ENDPOINT;
    }

    if (process.env.AGENTS_MODEL) {
      config.model = process.env.AGENTS_MODEL;
    }

    if (process.env.AGENTS_USE_MCP !== undefined) {
      config.useMCP = process.env.AGENTS_USE_MCP === 'true';
    }

    if (process.env.AGENTS_MAX_PARALLEL) {
      config.maxParallel = parseInt(process.env.AGENTS_MAX_PARALLEL, 10);
    }

    if (process.env.AGENTS_TIMEOUT) {
      config.timeout = parseInt(process.env.AGENTS_TIMEOUT, 10);
    }

    if (process.env.AGENTS_LOG_LEVEL) {
      config.logLevel = process.env.AGENTS_LOG_LEVEL as Config['logLevel'];
    }

    return config;
  }

  // 設定をマージ
  merge(...configs: Partial<Config>[]): Config {
    const defaultConfig = this.getDefaultConfig();
    const envConfig = this.loadFromEnv();
    const merged = Object.assign({}, defaultConfig, ...configs, envConfig);
    return ConfigSchema.parse(merged);
  }
}

// シングルトンインスタンスをエクスポート
export const loadConfig = new ConfigLoader();

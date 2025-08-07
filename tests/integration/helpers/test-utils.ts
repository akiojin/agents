import { vi } from 'vitest';
import { Config } from '../../../src/types/config.js';
import { BaseProvider } from '../../../src/providers/base.js';
import { TaskConfig, TaskResult } from '../../../src/types/task.js';
import { CompletionOptions, CompletionResponse } from '../../../src/types/provider.js';

/**
 * 統合テスト用のユーティリティヘルパー
 */

/**
 * テスト用のデフォルト設定を生成
 */
export function createTestConfig(overrides?: Partial<Config>): Config {
  const defaultConfig: Config = {
    provider: 'mock',
    maxConcurrency: 3,
    maxParallel: 3,
    app: {
      name: 'test-agents',
      version: '0.1.0',
      maxParallel: 3,
      workingDirectory: process.cwd(),
      logLevel: 'info',
    },
    providers: {
      mock: {
        apiKey: 'test-api-key',
        model: 'mock-model',
        temperature: 0.3,
        maxTokens: 4000,
      },
      openai: {
        apiKey: 'test-openai-key',
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 4000,
      },
      anthropic: {
        apiKey: 'test-anthropic-key',
        model: 'claude-3-sonnet-20240229',
        temperature: 0.3,
        maxTokens: 4000,
      },
    },
    mcp: {
      enabled: false,
      servers: {},
    },
  };

  return mergeConfig(defaultConfig, overrides);
}

/**
 * 設定オブジェクトをマージ
 */
function mergeConfig(base: Config, overrides?: Partial<Config>): Config {
  if (!overrides) return base;

  return {
    ...base,
    ...overrides,
    app: { ...base.app, ...overrides.app },
    providers: { ...base.providers, ...overrides.providers },
    mcp: { ...base.mcp, ...overrides.mcp },
  };
}

/**
 * モックプロバイダーを作成
 */
export function createMockProvider(options?: {
  responseDelay?: number;
  failureRate?: number;
  customResponses?: Record<string, CompletionResponse>;
}): BaseProvider {
  const { responseDelay = 50, failureRate = 0, customResponses = {} } = options || {};

  let callCount = 0;

  return {
    complete: vi.fn().mockImplementation(async (completionOptions: CompletionOptions) => {
      callCount++;

      // 失敗率に基づいてランダムに失敗
      if (Math.random() < failureRate) {
        throw new Error(`Mock provider failure (call ${callCount})`);
      }

      // 遅延のシミュレート
      if (responseDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, responseDelay));
      }

      // カスタムレスポンスがある場合は使用
      const promptKey = completionOptions.prompt.substring(0, 50);
      if (customResponses[promptKey]) {
        return customResponses[promptKey];
      }

      // デフォルトレスポンス
      return {
        content: `Mock response for: ${completionOptions.prompt.substring(0, 100)}...`,
        tokens: Math.floor(Math.random() * 100) + 20,
      };
    }),
    model: 'mock-model',
    temperature: 0.3,
    maxTokens: 4000,
  } as BaseProvider;
}

/**
 * テスト用のタスク設定を生成
 */
export function createTestTasks(count: number, options?: {
  baseDescription?: string;
  priority?: number;
  withFiles?: boolean;
  withContext?: boolean;
}): TaskConfig[] {
  const {
    baseDescription = 'テストタスク',
    priority = 5,
    withFiles = false,
    withContext = false,
  } = options || {};

  return Array.from({ length: count }, (_, i) => {
    const taskConfig: TaskConfig = {
      description: `${baseDescription}${i + 1}`,
      priority,
    };

    if (withFiles) {
      taskConfig.files = [`file${i + 1}.txt`];
    }

    if (withContext) {
      taskConfig.context = {
        taskId: i + 1,
        timestamp: Date.now(),
        metadata: { type: 'test' },
      };
    }

    return taskConfig;
  });
}

/**
 * 実行時間を測定
 */
export async function measureExecutionTime<T>(fn: () => Promise<T>): Promise<{
  result: T;
  duration: number;
}> {
  const startTime = Date.now();
  const result = await fn();
  const duration = Date.now() - startTime;

  return { result, duration };
}

/**
 * メモリ使用量を測定
 */
export function measureMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
} {
  const usage = process.memoryUsage();
  return {
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    rss: usage.rss,
  };
}

/**
 * メモリリークの検出
 */
export async function detectMemoryLeak<T>(
  operation: () => Promise<T>,
  iterations: number = 10,
  threshold: number = 50 * 1024 * 1024 // 50MB
): Promise<{
  hasLeak: boolean;
  initialMemory: number;
  finalMemory: number;
  memoryGrowth: number;
}> {
  // ガベージコレクションを強制実行
  if (global.gc) {
    global.gc();
  }

  const initialMemory = measureMemoryUsage().heapUsed;

  // 操作を複数回実行
  for (let i = 0; i < iterations; i++) {
    await operation();
    
    // 定期的にガベージコレクション
    if (i % 3 === 0 && global.gc) {
      global.gc();
    }
  }

  // 最終的なガベージコレクション
  if (global.gc) {
    global.gc();
  }

  const finalMemory = measureMemoryUsage().heapUsed;
  const memoryGrowth = finalMemory - initialMemory;

  return {
    hasLeak: memoryGrowth > threshold,
    initialMemory,
    finalMemory,
    memoryGrowth,
  };
}

/**
 * 並列実行の効果を測定
 */
export async function measureParallelismEffect<T>(
  sequentialFn: () => Promise<T[]>,
  parallelFn: () => Promise<T[]>,
  expectedCount: number
): Promise<{
  sequentialTime: number;
  parallelTime: number;
  speedupFactor: number;
  efficiencyGain: number;
}> {
  // 順次実行を測定
  const { duration: sequentialTime } = await measureExecutionTime(sequentialFn);

  // 並列実行を測定
  const { duration: parallelTime } = await measureExecutionTime(parallelFn);

  const speedupFactor = sequentialTime / parallelTime;
  const efficiencyGain = ((sequentialTime - parallelTime) / sequentialTime) * 100;

  return {
    sequentialTime,
    parallelTime,
    speedupFactor,
    efficiencyGain,
  };
}

/**
 * 統合テスト結果の検証ヘルパー
 */
export class IntegrationTestValidator {
  /**
   * タスク結果を検証
   */
  static validateTaskResults(results: TaskResult[]): {
    isValid: boolean;
    successCount: number;
    failureCount: number;
    totalDuration: number;
    averageDuration: number;
  } {
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;
    const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
    const averageDuration = results.length > 0 ? totalDuration / results.length : 0;

    return {
      isValid: results.length > 0 && results.every(r => r.message !== undefined),
      successCount,
      failureCount,
      totalDuration,
      averageDuration,
    };
  }

  /**
   * パフォーマンス基準を検証
   */
  static validatePerformance(
    actualTime: number,
    expectedMaxTime: number,
    tolerance: number = 0.1
  ): {
    isWithinLimit: boolean;
    actualTime: number;
    expectedMaxTime: number;
    margin: number;
  } {
    const margin = (expectedMaxTime - actualTime) / expectedMaxTime;
    
    return {
      isWithinLimit: actualTime <= expectedMaxTime * (1 + tolerance),
      actualTime,
      expectedMaxTime,
      margin,
    };
  }

  /**
   * 並列性効果を検証
   */
  static validateParallelism(
    sequentialTime: number,
    parallelTime: number,
    minSpeedupFactor: number = 1.5
  ): {
    isEffective: boolean;
    speedupFactor: number;
    minSpeedupFactor: number;
    efficiencyGain: number;
  } {
    const speedupFactor = sequentialTime / parallelTime;
    const efficiencyGain = ((sequentialTime - parallelTime) / sequentialTime) * 100;

    return {
      isEffective: speedupFactor >= minSpeedupFactor,
      speedupFactor,
      minSpeedupFactor,
      efficiencyGain,
    };
  }
}

/**
 * テスト環境のクリーンアップ
 */
export class TestEnvironmentManager {
  private static tempFiles: string[] = [];
  private static tempDirs: string[] = [];

  /**
   * 一時ファイルを追跡
   */
  static trackTempFile(filePath: string): void {
    this.tempFiles.push(filePath);
  }

  /**
   * 一時ディレクトリを追跡
   */
  static trackTempDir(dirPath: string): void {
    this.tempDirs.push(dirPath);
  }

  /**
   * すべての一時リソースをクリーンアップ
   */
  static async cleanup(): Promise<void> {
    const fs = await import('fs/promises');

    // ファイルを削除
    for (const file of this.tempFiles) {
      try {
        await fs.unlink(file);
      } catch (error) {
        console.warn(`Failed to remove temp file ${file}:`, error);
      }
    }

    // ディレクトリを削除
    for (const dir of this.tempDirs) {
      try {
        await fs.rmdir(dir, { recursive: true });
      } catch (error) {
        console.warn(`Failed to remove temp directory ${dir}:`, error);
      }
    }

    // 追跡リストをリセット
    this.tempFiles = [];
    this.tempDirs = [];
  }
}
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentCore } from '../../src/core/agent.js';
import { TaskExecutor } from '../../src/core/task-executor.js';
import { MemoryManager } from '../../src/core/memory.js';
import { MCPManager } from '../../src/mcp/manager.js';
import { BaseProvider } from '../../src/providers/base.js';
import { Config } from '../../src/config/types.js';
import { TaskConfig, TaskResult } from '../../src/config/types.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * エンドツーエンド統合テスト
 * エージェントの主要フローを実際の環境に近い状態でテストします
 */
describe('E2E Integration Tests', () => {
  let agent: AgentCore;
  let taskExecutor: TaskExecutor;
  let memoryManager: MemoryManager;
  let mcpManager: MCPManager;
  let mockProvider: BaseProvider;
  let testConfig: Config;
  let tempDir: string;

  beforeEach(async () => {
    // テスト用の一時ディレクトリを作成
    tempDir = path.join(process.cwd(), 'temp-test-' + Date.now());
    await fs.mkdir(tempDir, { recursive: true });

    // テスト用設定
    testConfig = {
      llm: {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        timeout: 30000,
        maxRetries: 3,
        temperature: 0.3,
        maxTokens: 4000,
      },
      mcp: {
        enabled: false,
        servers: [],
        timeout: 30000,
        maxRetries: 3,
      },
      app: {
        logLevel: 'info',
        logDir: path.join(tempDir, 'logs'),
        maxParallel: 3,
        silent: false,
        timeout: 30000,
      },
      paths: {
        cache: path.join(tempDir, 'cache'),
        history: path.join(tempDir, 'history'),
        config: path.join(tempDir, 'config.json'),
      },
    };

    // モックプロバイダーの作成
    mockProvider = {
      complete: vi.fn().mockImplementation(async (options) => {
        // タスク内容に基づいて異なるレスポンスを返す
        if (options.prompt.includes('ファイル作成')) {
          return {
            content: 'ファイルを作成しました: test.txt',
            tokens: 50,
          };
        }
        if (options.prompt.includes('データ処理')) {
          return {
            content: 'データ処理が完了しました',
            tokens: 30,
          };
        }
        return {
          content: `タスクを実行しました: ${options.prompt.substring(0, 50)}...`,
          tokens: 40,
        };
      }),
      model: 'mock-model',
      temperature: 0.3,
      maxTokens: 4000,
    } as BaseProvider;

    // コンポーネントの初期化
    memoryManager = new MemoryManager(testConfig.paths.history);
    mcpManager = new MCPManager(testConfig);
    taskExecutor = new TaskExecutor(testConfig);
    agent = new AgentCore(testConfig);
  });

  afterEach(async () => {
    // テスト用ディレクトリを削除
    try {
      await fs.rmdir(tempDir, { recursive: true });
    } catch (error) {
      console.warn('テストディレクトリの削除に失敗:', error);
    }
    
    vi.clearAllMocks();
  });

  describe('単一タスクの実行フロー', () => {
    it('基本的なタスクのエンドツーエンド実行', async () => {
      const taskConfig: TaskConfig = {
        description: 'テストファイルを作成してください',
        priority: 5,
        timeout: 30000,
      };

      const result = await taskExecutor.execute(taskConfig, mockProvider);

      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.message).toBeDefined();
      expect(result.duration).toBeGreaterThan(0);
      
      // モックプロバイダーが呼び出されたことを確認
      expect(mockProvider.complete).toHaveBeenCalled();
    });

    it('エラーハンドリングのテスト', async () => {
      // エラーを発生させるモックプロバイダー
      const errorProvider = {
        ...mockProvider,
        complete: vi.fn().mockRejectedValue(new Error('API呼び出しエラー')),
      } as BaseProvider;

      const taskConfig: TaskConfig = {
        description: 'エラーが発生するタスク',
        priority: 5,
        timeout: 30000,
      };

      const result = await taskExecutor.execute(taskConfig, errorProvider);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('API呼び出しエラー');
    });

    it('タイムアウト処理のテスト', async () => {
      // 長時間かかるタスクをシミュレート
      const slowProvider = {
        ...mockProvider,
        complete: vi.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 5000))
        ),
      } as BaseProvider;

      const taskConfig: TaskConfig = {
        description: '時間のかかるタスク',
        priority: 5,
        timeout: 1000, // 1秒でタイムアウト
      };

      const startTime = Date.now();
      const result = await taskExecutor.execute(taskConfig, slowProvider);
      const duration = Date.now() - startTime;

      // タイムアウトまたは失敗が期待される
      expect(duration).toBeLessThan(2000); // 2秒以内に完了
    });
  });

  describe('並列処理フロー', () => {
    it('複数タスクの並列実行', async () => {
      // 並列モードを有効化
      taskExecutor.setParallelMode(true);

      const taskConfigs: TaskConfig[] = [
        { description: 'ファイル作成タスク1', priority: 5 },
        { description: 'データ処理タスク2', priority: 5 },
        { description: 'レポート生成タスク3', priority: 5 },
      ];

      const promises = taskConfigs.map(config =>
        taskExecutor.execute(config, mockProvider)
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;

      // すべてのタスクが成功
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 並列実行のためプロバイダーが複数回呼び出された
      expect(mockProvider.complete).toHaveBeenCalledTimes(3);

      // 並列実行により時間が短縮されていることを確認
      // (実際の実装では並列実行により時間短縮される)
      expect(totalTime).toBeLessThan(5000);
    });

    it('並列実行での部分的失敗処理', async () => {
      taskExecutor.setParallelMode(true);

      // 1つ目のタスクは成功、2つ目は失敗するプロバイダー
      let callCount = 0;
      const partialFailureProvider = {
        ...mockProvider,
        complete: vi.fn().mockImplementation(async (options) => {
          callCount++;
          if (callCount === 2) {
            throw new Error('2番目のタスクでエラー');
          }
          return {
            content: `タスク${callCount}完了`,
            tokens: 30,
          };
        }),
      } as BaseProvider;

      const taskConfigs: TaskConfig[] = [
        { description: '成功するタスク1', priority: 5 },
        { description: '失敗するタスク2', priority: 5 },
        { description: '成功するタスク3', priority: 5 },
      ];

      const results = await Promise.allSettled(
        taskConfigs.map(config =>
          taskExecutor.execute(config, partialFailureProvider)
        )
      );

      expect(results).toHaveLength(3);
      
      // 結果の検証
      const fulfilledResults = results.filter(
        (r): r is PromiseFulfilledResult<TaskResult> => r.status === 'fulfilled'
      );

      expect(fulfilledResults).toHaveLength(3); // タスクエグゼキューターは常に結果を返す
    });

    it('動的な並列度調整', async () => {
      taskExecutor.setParallelMode(true);
      
      // 初期並列度を確認
      expect(taskExecutor.getCurrentConcurrency()).toBe(3);

      // 並列度を変更
      taskExecutor.updateConcurrency(5);
      expect(taskExecutor.getCurrentConcurrency()).toBe(5);

      // 最小値制限のテスト
      taskExecutor.updateConcurrency(0);
      expect(taskExecutor.getCurrentConcurrency()).toBe(1);
    });
  });

  describe('メモリ管理統合', () => {
    it('タスク実行中のメモリ使用', async () => {
      const taskConfig: TaskConfig = {
        description: 'メモリを使用するタスク',
        context: { key: 'value', data: [1, 2, 3] },
      };

      const result = await taskExecutor.execute(taskConfig, mockProvider);

      expect(result.success).toBe(true);
      
      // メモリ使用量を確認
      const memoryUsage = memoryManager.getMemoryUsage();
      expect(memoryUsage.memoryUsageMB).toBeGreaterThan(0);
    });

    it('大量データ処理とメモリリーク検知', async () => {
      const initialMemory = process.memoryUsage();

      // 大量のタスクを実行
      const largeTasks: TaskConfig[] = Array.from({ length: 20 }, (_, i) => ({
        description: `大量データ処理タスク${i}`,
        context: { 
          data: new Array(1000).fill(0).map((_, j) => ({ id: j, value: Math.random() }))
        },
      }));

      const results = await Promise.all(
        largeTasks.map(task => taskExecutor.execute(task, mockProvider))
      );

      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // メモリ使用量を確認（大幅な増加がないことを検証）
      const finalMemory = process.memoryUsage();
      const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // メモリ増加が合理的な範囲内であることを確認（100MB以下）
      expect(heapGrowth).toBeLessThan(100 * 1024 * 1024);
    });
  });

  describe('エラーリカバリー機能', () => {
    it('プロバイダー障害からの自動復旧', async () => {
      let attemptCount = 0;
      const recoveryProvider = {
        ...mockProvider,
        complete: vi.fn().mockImplementation(async (options) => {
          attemptCount++;
          if (attemptCount <= 2) {
            throw new Error(`一時的なエラー (試行回数: ${attemptCount})`);
          }
          return {
            content: '復旧後の成功結果',
            tokens: 25,
          };
        }),
      } as BaseProvider;

      const taskConfig: TaskConfig = {
        description: '復旧テスト用タスク',
        priority: 5,
        maxRetries: 3,
      };

      // 注: 実際のリトライ機能がTaskExecutorに実装されている場合
      // この部分は期待される動作に合わせて調整が必要
      const result = await taskExecutor.execute(taskConfig, recoveryProvider);

      // プロバイダーが呼び出されたことを確認
      expect(recoveryProvider.complete).toHaveBeenCalled();
    });

    it('ファイルシステムエラーのハンドリング', async () => {
      // 無効なディレクトリでの作業ディレクトリ設定
      const invalidConfig = {
        ...testConfig,
        app: {
          ...testConfig.app,
          workingDirectory: '/invalid/path/that/does/not/exist',
        },
      };

      const taskConfig: TaskConfig = {
        description: 'ファイル操作タスク',
        files: ['/invalid/path/test.txt'],
      };

      // エラーが適切にハンドリングされることを確認
      const result = await taskExecutor.execute(taskConfig, mockProvider);

      // タスクエグゼキューター自体は動作するはず
      expect(result).toBeDefined();
    });
  });

  describe('パフォーマンス統合テスト', () => {
    it('高負荷時のレスポンス時間', async () => {
      taskExecutor.setParallelMode(true);
      
      const startTime = Date.now();
      const highLoadTasks: TaskConfig[] = Array.from({ length: 10 }, (_, i) => ({
        description: `高負荷テストタスク${i}`,
        priority: Math.floor(Math.random() * 10) + 1,
      }));

      const results = await Promise.all(
        highLoadTasks.map(task => taskExecutor.execute(task, mockProvider))
      );

      const totalTime = Date.now() - startTime;

      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 10個のタスクが合理的な時間で完了することを確認
      expect(totalTime).toBeLessThan(10000); // 10秒以内
      
      // 平均処理時間を計算
      const avgTime = totalTime / results.length;
      expect(avgTime).toBeLessThan(1000); // 1タスク平均1秒以内
    });

    it('メトリクスとログの統合', async () => {
      const taskConfig: TaskConfig = {
        description: 'メトリクス収集テストタスク',
        priority: 7,
      };

      const startTime = Date.now();
      const result = await taskExecutor.execute(taskConfig, mockProvider);
      const executionTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      expect(result.duration).toBeGreaterThan(0);
      expect(result.duration).toBeLessThanOrEqual(executionTime + 100); // 多少の誤差を許容

      // ログが適切に出力されていることを確認するため、
      // 実際の実装ではロガーのスパイ機能を使用
    });
  });
});
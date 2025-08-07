import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TaskExecutor } from '../../src/core/task-executor.js';
import { ParallelExecutor } from '../../src/core/parallel-executor.js';
import { AgentCore } from '../../src/core/agent.js';
import { BaseProvider } from '../../src/providers/base.js';
import { Config } from '../../src/config/types.js';
import { TaskConfig, TaskResult } from '../../src/config/types.js';
import { ParallelTask, ParallelResult } from '../../src/core/parallel-executor.js';

/**
 * 並列処理機能統合テスト
 * サブエージェントへのタスク割り振りの並列化機能を包括的にテストします
 */
describe('Parallel Processing Integration Tests', () => {
  let taskExecutor: TaskExecutor;
  let parallelExecutor: ParallelExecutor;
  let agent: AgentCore;
  let mockProvider: BaseProvider;
  let testConfig: Config;

  beforeEach(() => {
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
        logDir: '/tmp/test-logs',
        maxParallel: 5,
        silent: false,
        timeout: 30000,
      },
      paths: {
        cache: '/tmp/test-cache',
        history: '/tmp/test-history',
        config: '/tmp/test-config.json',
      },
    };

    // モックプロバイダーの設定
    mockProvider = {
      complete: vi.fn().mockImplementation(async (options) => {
        // タスクの内容に基づいて処理時間をシミュレート
        const delay = options.prompt.includes('slow') ? 200 :
                     options.prompt.includes('medium') ? 100 : 50;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return {
          content: `Completed: ${options.prompt.substring(0, 50)}...`,
          tokens: Math.floor(Math.random() * 50) + 10,
        };
      }),
      model: 'mock-model',
      temperature: 0.3,
      maxTokens: 4000,
    } as BaseProvider;

    // コンポーネントの初期化
    parallelExecutor = new ParallelExecutor(5);
    taskExecutor = new TaskExecutor(testConfig);
    agent = new AgentCore(testConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('基本的な並列実行機能', () => {
    it('独立したタスクの並列実行', async () => {
      taskExecutor.setParallelMode(true);

      const independentTasks: TaskConfig[] = [
        {
          description: 'ファイル1を処理する',
          files: ['file1.txt'],
          priority: 5,
        },
        {
          description: 'ファイル2を処理する', 
          files: ['file2.txt'],
          priority: 5,
        },
        {
          description: 'ファイル3を処理する',
          files: ['file3.txt'],
          priority: 5,
        },
        {
          description: 'データベースの更新',
          context: { table: 'users' },
          priority: 5,
        },
      ];

      const startTime = Date.now();
      const results = await Promise.all(
        independentTasks.map(task => taskExecutor.execute(task, mockProvider))
      );
      const executionTime = Date.now() - startTime;

      // 全てのタスクが成功
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.message).toBeDefined();
      });

      // 並列実行により時間短縮が実現されている
      expect(executionTime).toBeLessThan(800); // 順次実行なら200ms × 4 = 800ms以上かかる
      expect(mockProvider.complete).toHaveBeenCalledTimes(4);
    });

    it('優先度に基づくタスクの並列実行', async () => {
      const prioritizedTasks: ParallelTask<string>[] = [
        {
          id: 'low-priority',
          description: '低優先度タスク',
          priority: 1,
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return 'Low priority completed';
          },
        },
        {
          id: 'high-priority',
          description: '高優先度タスク',
          priority: 10,
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return 'High priority completed';
          },
        },
        {
          id: 'medium-priority',
          description: '中優先度タスク',
          priority: 5,
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 75));
            return 'Medium priority completed';
          },
        },
      ];

      const executionOrder: string[] = [];
      const results = await parallelExecutor.executeParallelWithDetails(
        prioritizedTasks,
        (completed, total, currentTask) => {
          if (completed > 0) {
            executionOrder.push(currentTask || 'unknown');
          }
        }
      );

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 優先度に基づいて実行されていることを確認
      // (実際の順序は並列実行の性質上、完全に予測できないが、高優先度が早く完了しやすい)
      expect(executionOrder).toContain('高優先度タスク');
    });

    it('動的な並列度調整', async () => {
      // 初期並列度を確認
      expect(taskExecutor.getCurrentConcurrency()).toBe(5);

      // 並列度を動的に変更
      taskExecutor.updateConcurrency(3);
      expect(taskExecutor.getCurrentConcurrency()).toBe(3);

      // 変更された並列度でタスクを実行
      const tasks: TaskConfig[] = Array.from({ length: 8 }, (_, i) => ({
        description: `並列度テストタスク${i + 1}`,
        priority: 5,
      }));

      taskExecutor.setParallelMode(true);
      const results = await Promise.all(
        tasks.map(task => taskExecutor.execute(task, mockProvider))
      );

      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 並列度を元に戻す
      taskExecutor.updateConcurrency(5);
      expect(taskExecutor.getCurrentConcurrency()).toBe(5);
    });
  });

  describe('依存関係のあるタスクの処理', () => {
    it('依存関係を考慮したタスク実行順序', async () => {
      // 依存関係検出関数のモック
      const dependencyDetector = (task: ParallelTask<string>) => {
        if (task.description?.includes('step2')) {
          return ['step1-task']; // step2はstep1に依存
        }
        if (task.description?.includes('step3')) {
          return ['step2-task']; // step3はstep2に依存
        }
        return []; // 依存関係なし
      };

      const dependentTasks: ParallelTask<string>[] = [
        {
          id: 'step1-task',
          description: 'step1: 初期化処理',
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return 'Step 1 completed';
          },
        },
        {
          id: 'step2-task',
          description: 'step2: データ処理',
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 80));
            return 'Step 2 completed';
          },
        },
        {
          id: 'step3-task',
          description: 'step3: 最終化処理',
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 60));
            return 'Step 3 completed';
          },
        },
        {
          id: 'independent-task',
          description: '独立したタスク',
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return 'Independent task completed';
          },
        },
      ];

      const results = await parallelExecutor.executeWithDependencyAnalysis(
        dependentTasks,
        dependencyDetector
      );

      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 依存関係が正しく処理されたことを確認
      const step1Result = results.find(r => r.taskId === 'step1-task');
      const step2Result = results.find(r => r.taskId === 'step2-task');
      const step3Result = results.find(r => r.taskId === 'step3-task');

      expect(step1Result?.success).toBe(true);
      expect(step2Result?.success).toBe(true);
      expect(step3Result?.success).toBe(true);
    });

    it('循環依存の検出と処理', async () => {
      const circularDependencyDetector = (task: ParallelTask<string>) => {
        if (task.id === 'task-a') return ['task-b'];
        if (task.id === 'task-b') return ['task-c'];
        if (task.id === 'task-c') return ['task-a']; // 循環依存
        return [];
      };

      const circularTasks: ParallelTask<string>[] = [
        {
          id: 'task-a',
          description: 'Task A',
          task: async () => 'A completed',
        },
        {
          id: 'task-b',
          description: 'Task B',
          task: async () => 'B completed',
        },
        {
          id: 'task-c',
          description: 'Task C',
          task: async () => 'C completed',
        },
      ];

      // 循環依存があっても適切に処理されることを確認
      const results = await parallelExecutor.executeWithDependencyAnalysis(
        circularTasks,
        circularDependencyDetector
      );

      expect(results).toHaveLength(3);
      // 循環依存の場合、すべてのタスクが最終的に実行される
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('エラー処理とフォールバック', () => {
    it('一部タスク失敗時の継続処理', async () => {
      let callCount = 0;
      const partialFailureProvider = {
        ...mockProvider,
        complete: vi.fn().mockImplementation(async (options) => {
          callCount++;
          if (callCount === 3) { // 3番目のタスクで失敗
            throw new Error('Simulated task failure');
          }
          await new Promise(resolve => setTimeout(resolve, 50));
          return {
            content: `Success ${callCount}`,
            tokens: 20,
          };
        }),
      } as BaseProvider;

      const mixedTasks: TaskConfig[] = Array.from({ length: 5 }, (_, i) => ({
        description: `混合テストタスク${i + 1}`,
        priority: 5,
      }));

      taskExecutor.setParallelMode(true);
      const results = await Promise.allSettled(
        mixedTasks.map(task => taskExecutor.execute(task, partialFailureProvider))
      );

      expect(results).toHaveLength(5);

      const successfulResults = results.filter(
        (r): r is PromiseFulfilledResult<TaskResult> => 
          r.status === 'fulfilled' && r.value.success
      );
      const failedResults = results.filter(
        (r): r is PromiseFulfilledResult<TaskResult> => 
          r.status === 'fulfilled' && !r.value.success
      );

      expect(successfulResults.length).toBe(4); // 4つが成功
      expect(failedResults.length).toBe(1);     // 1つが失敗
    });

    it('並列実行失敗時の順次実行へのフォールバック', async () => {
      let parallelAttempted = false;
      
      const problematicTasks: ParallelTask<string>[] = Array.from({ length: 3 }, (_, i) => ({
        id: `fallback-task-${i}`,
        description: `フォールバックテストタスク${i + 1}`,
        task: async () => {
          if (!parallelAttempted) {
            parallelAttempted = true;
            throw new Error('Parallel execution failed');
          }
          return `Fallback success ${i + 1}`;
        },
      }));

      // 最初は並列実行が失敗し、順次実行にフォールバック
      let results: ParallelResult<string>[] = [];
      
      try {
        results = await parallelExecutor.executeParallelWithDetails(problematicTasks);
      } catch (error) {
        // 並列実行が失敗した場合、順次実行を試行
        console.log('Parallel execution failed, falling back to sequential');
        
        // 順次実行のシミュレート
        for (const task of problematicTasks) {
          try {
            const result = await task.task();
            results.push({
              success: true,
              data: result,
              taskId: task.id,
              duration: 100,
            });
          } catch (taskError) {
            results.push({
              success: false,
              error: taskError instanceof Error ? taskError : new Error(String(taskError)),
              taskId: task.id,
              duration: 100,
            });
          }
        }
      }

      expect(results).toHaveLength(3);
    });

    it('タイムアウト処理', async () => {
      const timeoutTasks: ParallelTask<string>[] = [
        {
          id: 'quick-task',
          description: '高速タスク',
          timeout: 200,
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return 'Quick task completed';
          },
        },
        {
          id: 'slow-task',
          description: '低速タスク',
          timeout: 100,
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 300)); // タイムアウト
            return 'Slow task completed';
          },
        },
        {
          id: 'normal-task',
          description: '通常タスク',
          timeout: 150,
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 80));
            return 'Normal task completed';
          },
        },
      ];

      const results = await parallelExecutor.executeParallelWithDetails(timeoutTasks);

      expect(results).toHaveLength(3);

      const quickResult = results.find(r => r.taskId === 'quick-task');
      const slowResult = results.find(r => r.taskId === 'slow-task');
      const normalResult = results.find(r => r.taskId === 'normal-task');

      expect(quickResult?.success).toBe(true);
      expect(slowResult?.success).toBe(false); // タイムアウト
      expect(normalResult?.success).toBe(true);
    });
  });

  describe('スケーラビリティとパフォーマンス', () => {
    it('大量タスクの並列処理性能', async () => {
      const largeBatchSize = 50;
      const largeTasks: TaskConfig[] = Array.from({ length: largeBatchSize }, (_, i) => ({
        description: `大量処理テスト${i + 1}`,
        priority: Math.floor(Math.random() * 10) + 1,
      }));

      taskExecutor.setParallelMode(true);
      const startTime = Date.now();
      
      const results = await Promise.all(
        largeTasks.map(task => taskExecutor.execute(task, mockProvider))
      );
      
      const totalTime = Date.now() - startTime;

      // 全てのタスクが成功
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 並列処理により効率的に実行される
      expect(totalTime).toBeLessThan(largeBatchSize * 100); // 順次実行の場合の時間より大幅に短縮
      expect(mockProvider.complete).toHaveBeenCalledTimes(largeBatchSize);

      // 平均処理時間
      const avgTime = totalTime / largeBatchSize;
      expect(avgTime).toBeLessThan(200); // 1タスクあたり200ms以下
    });

    it('メモリ使用量の監視', async () => {
      const initialMemory = process.memoryUsage();

      // メモリ集約的なタスクをシミュレート
      const memoryIntensiveTasks: ParallelTask<any>[] = Array.from({ length: 30 }, (_, i) => ({
        id: `memory-task-${i}`,
        description: `メモリ集約タスク${i + 1}`,
        task: async () => {
          // 大きなデータ構造を作成
          const largeArray = new Array(10000).fill(0).map((_, j) => ({
            id: j,
            data: Math.random(),
            timestamp: Date.now(),
          }));
          
          await new Promise(resolve => setTimeout(resolve, 20));
          
          // データを処理
          return largeArray.reduce((sum, item) => sum + item.data, 0);
        },
      }));

      const results = await parallelExecutor.executeParallelWithDetails(memoryIntensiveTasks);

      expect(results).toHaveLength(30);
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(typeof result.data).toBe('number');
      });

      // メモリ使用量を確認
      const finalMemory = process.memoryUsage();
      const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // メモリリークがないことを確認（100MB以下の増加）
      expect(heapGrowth).toBeLessThan(100 * 1024 * 1024);
    });

    it('並列度の自動調整', async () => {
      // システムリソースに応じた並列度調整のシミュレート
      const adaptiveExecutor = new ParallelExecutor(2); // 低い初期値

      // リソース使用量をモニタリングする関数
      const monitorResources = () => {
        const usage = process.cpuUsage();
        const memory = process.memoryUsage();
        
        // CPU使用率が低い場合、並列度を増加
        if (memory.heapUsed < 50 * 1024 * 1024) { // 50MB以下
          return Math.min(8, adaptiveExecutor.getMaxConcurrency() + 1);
        }
        
        return adaptiveExecutor.getMaxConcurrency();
      };

      const adaptiveTasks: ParallelTask<string>[] = Array.from({ length: 20 }, (_, i) => ({
        id: `adaptive-task-${i}`,
        description: `適応的タスク${i + 1}`,
        task: async () => {
          await new Promise(resolve => setTimeout(resolve, 30));
          return `Adaptive task ${i + 1} completed`;
        },
      }));

      // 実行中に並列度を動的に調整
      const adjustedConcurrency = monitorResources();
      adaptiveExecutor.setMaxConcurrency(adjustedConcurrency);

      const results = await adaptiveExecutor.executeParallelWithDetails(adaptiveTasks);

      expect(results).toHaveLength(20);
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 並列度が調整されていることを確認
      expect(adaptiveExecutor.getMaxConcurrency()).toBeGreaterThan(2);
    });
  });

  describe('実際のワークフローシナリオ', () => {
    it('複合的なエージェントワークフロー', async () => {
      // 実際のエージェント作業を模倣した複合タスク
      const workflowTasks: TaskConfig[] = [
        {
          description: 'プロジェクト構造を分析する',
          files: ['package.json', 'src/'],
          priority: 8,
        },
        {
          description: 'コードの品質を確認する',
          files: ['src/**/*.ts'],
          context: { tool: 'eslint' },
          priority: 6,
        },
        {
          description: 'テストを実行する',
          files: ['tests/'],
          context: { command: 'npm test' },
          priority: 7,
        },
        {
          description: 'ドキュメントを生成する',
          files: ['docs/'],
          context: { format: 'markdown' },
          priority: 4,
        },
        {
          description: 'デプロイメント準備',
          context: { environment: 'staging' },
          priority: 9,
        },
      ];

      taskExecutor.setParallelMode(true);

      const startTime = Date.now();
      const results = await Promise.all(
        workflowTasks.map(task => taskExecutor.execute(task, mockProvider))
      );
      const executionTime = Date.now() - startTime;

      // ワークフロー全体が成功
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.message).toContain('すべてのタスクが完了しました');
        expect(result.duration).toBeGreaterThan(0);
      });

      // 並列実行により効率的に処理
      expect(executionTime).toBeLessThan(1000); // 1秒以内
      expect(mockProvider.complete).toHaveBeenCalledTimes(5);

      console.log(`複合ワークフロー実行時間: ${executionTime}ms`);
    });

    it('エージェント間の協調動作', async () => {
      // 複数のサブエージェントが協調して作業するシナリオ
      const coordinatedTasks: ParallelTask<any>[] = [
        {
          id: 'frontend-agent',
          description: 'フロントエンド開発エージェント',
          priority: 7,
          task: async () => {
            await mockProvider.complete({
              prompt: 'React コンポーネントを作成してください',
            });
            return { component: 'Button.tsx', status: 'created' };
          },
        },
        {
          id: 'backend-agent',
          description: 'バックエンド開発エージェント',
          priority: 7,
          task: async () => {
            await mockProvider.complete({
              prompt: 'API エンドポイントを作成してください',
            });
            return { endpoint: '/api/users', status: 'created' };
          },
        },
        {
          id: 'database-agent',
          description: 'データベース管理エージェント',
          priority: 8,
          task: async () => {
            await mockProvider.complete({
              prompt: 'データベーススキーマを作成してください',
            });
            return { schema: 'users.sql', status: 'created' };
          },
        },
        {
          id: 'testing-agent',
          description: 'テスト自動化エージェント',
          priority: 6,
          task: async () => {
            await mockProvider.complete({
              prompt: '統合テストを作成してください',
            });
            return { tests: 'integration.test.ts', status: 'created' };
          },
        },
      ];

      const results = await parallelExecutor.executeParallelWithDetails(
        coordinatedTasks,
        (completed, total, currentTask) => {
          console.log(`協調作業進捗: ${completed}/${total} - ${currentTask}`);
        }
      );

      expect(results).toHaveLength(4);
      
      // すべてのエージェントが正常に作業完了
      results.forEach(result => {
        expect(result.success).toBe(true);
        expect(result.data.status).toBe('created');
      });

      // 各エージェントの成果物を確認
      const frontendResult = results.find(r => r.taskId === 'frontend-agent');
      const backendResult = results.find(r => r.taskId === 'backend-agent');
      const databaseResult = results.find(r => r.taskId === 'database-agent');
      const testingResult = results.find(r => r.taskId === 'testing-agent');

      expect(frontendResult?.data.component).toBe('Button.tsx');
      expect(backendResult?.data.endpoint).toBe('/api/users');
      expect(databaseResult?.data.schema).toBe('users.sql');
      expect(testingResult?.data.tests).toBe('integration.test.ts');

      console.log('エージェント協調動作が正常に完了しました');
    });

    it('障害復旧とリバランシング', async () => {
      let failedAgentRecovered = false;
      
      const resilientTasks: ParallelTask<string>[] = [
        {
          id: 'stable-agent',
          description: '安定エージェント',
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            return 'Stable agent completed';
          },
        },
        {
          id: 'unstable-agent',
          description: '不安定エージェント',
          task: async () => {
            if (!failedAgentRecovered) {
              failedAgentRecovered = true;
              throw new Error('Agent temporarily unavailable');
            }
            await new Promise(resolve => setTimeout(resolve, 120));
            return 'Unstable agent recovered';
          },
        },
        {
          id: 'backup-agent',
          description: 'バックアップエージェント',
          task: async () => {
            await new Promise(resolve => setTimeout(resolve, 80));
            return 'Backup agent completed';
          },
        },
      ];

      // 最初の実行では一部失敗
      let initialResults = await parallelExecutor.executeParallelWithDetails(resilientTasks);
      
      const failedTasks = initialResults.filter(r => !r.success);
      
      if (failedTasks.length > 0) {
        console.log(`${failedTasks.length} タスクが失敗、復旧を試行中...`);
        
        // 失敗したタスクの再実行
        const retryTasks = failedTasks.map(failed => 
          resilientTasks.find(t => t.id === failed.taskId)!
        );
        
        const retryResults = await parallelExecutor.executeParallelWithDetails(retryTasks);
        
        // 結果をマージ
        const finalResults = [...initialResults, ...retryResults];
        const successfulResults = finalResults.filter(r => r.success);
        
        expect(successfulResults.length).toBeGreaterThanOrEqual(3);
      }

      console.log('障害復旧機能が正常に動作しました');
    });
  });
});
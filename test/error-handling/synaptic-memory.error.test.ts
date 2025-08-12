import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SynapticMemoryNetwork } from '../../packages/memory/src/synaptic/synapticNetwork';
import { SqliteMemoryClient } from '../../packages/memory/src/sqlite/sqliteClient';
import { MemoryAPI } from '../../packages/memory/src/api/memoryApi';

// エラーハンドリング用のモッククライアント
class FlakySqliteClient extends SqliteMemoryClient {
  private failureCount = 0;
  private maxFailures = 0;

  constructor(config: any, maxFailures = 0) {
    super(config);
    this.maxFailures = maxFailures;
  }

  async store(memory: any): Promise<void> {
    if (this.failureCount < this.maxFailures) {
      this.failureCount++;
      throw new Error(`模擬ネットワークエラー (失敗回数: ${this.failureCount})`);
    }
    return super.store(memory);
  }

  async search(query: string, limit = 10): Promise<any[]> {
    if (this.failureCount < this.maxFailures && query === 'trigger-error') {
      this.failureCount++;
      throw new Error(`検索エラーが発生しました (失敗回数: ${this.failureCount})`);
    }
    return super.search(query, limit);
  }

  resetFailures(): void {
    this.failureCount = 0;
  }
}

// ネットワークエラーシミュレータ
class NetworkErrorSimulator {
  private originalFetch = global.fetch;
  private errorProbability = 0;
  private errorCount = 0;

  constructor(errorProbability = 0) {
    this.errorProbability = errorProbability;
  }

  enable(): void {
    global.fetch = vi.fn().mockImplementation((url, options) => {
      if (Math.random() < this.errorProbability) {
        this.errorCount++;
        return Promise.reject(new Error(`ネットワークエラー: 接続に失敗しました (エラー回数: ${this.errorCount})`));
      }
      return this.originalFetch(url, options);
    });
  }

  disable(): void {
    global.fetch = this.originalFetch;
    vi.restoreAllMocks();
  }

  getErrorCount(): number {
    return this.errorCount;
  }

  reset(): void {
    this.errorCount = 0;
  }
}

describe('Synaptic Memory Error Handling Tests', () => {
  let synapticNetwork: SynapticMemoryNetwork;
  let memoryApi: MemoryAPI;
  let networkSimulator: NetworkErrorSimulator;

  const testMemory = {
    id: 'error-test-memory',
    content: 'エラーハンドリングテスト用のメモリ',
    embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
    metadata: {
      type: 'user_input' as const,
      timestamp: Date.now(),
      sessionId: 'error-test-session'
    }
  };

  beforeEach(() => {
    networkSimulator = new NetworkErrorSimulator();
  });

  afterEach(async () => {
    networkSimulator.disable();
    if (synapticNetwork) {
      await synapticNetwork.cleanup();
    }
    if (memoryApi) {
      await memoryApi.cleanup();
    }
  });

  describe('データベース接続エラー', () => {
    it('SqliteDB接続エラーが適切にハンドリングされること', async () => {
      const invalidClient = new SqliteMemoryClient({
        sqlitePath: '/invalid/path/database.db'
      });

      synapticNetwork = new SynapticMemoryNetwork(invalidClient);

      // 接続エラーが発生することを期待
      await expect(synapticNetwork.store(testMemory))
        .rejects.toThrow();

      // エラー後もシステムが安定していることを確認
      const diagnostics = await synapticNetwork.getDiagnostics();
      expect(diagnostics).toBeDefined();
      expect(diagnostics.healthScore).toBeGreaterThanOrEqual(0);
    });

    it('部分的な接続障害からの回復テスト', async () => {
      const flakyClient = new FlakySqliteClient({
        sqlitePath: ':memory:',
        collectionName: 'error-test-collection'
      }, 2); // 最初の2回は失敗

      synapticNetwork = new SynapticMemoryNetwork(flakyClient);

      // 最初の2回は失敗することを確認
      await expect(synapticNetwork.store(testMemory))
        .rejects.toThrow('模擬ネットワークエラー');

      await expect(synapticNetwork.store(testMemory))
        .rejects.toThrow('模擬ネットワークエラー');

      // 3回目は成功することを確認（実際のストレージは使わないのでモック）
      const mockStore = vi.fn().mockResolvedValue(undefined);
      (synapticNetwork as any).memoryClient.store = mockStore;
      
      await expect(synapticNetwork.store(testMemory))
        .resolves.not.toThrow();
    });
  });

  describe('無効なデータエラー', () => {
    beforeEach(() => {
      const mockClient = {
        store: vi.fn().mockResolvedValue(undefined),
        search: vi.fn().mockResolvedValue([]),
        getAll: vi.fn().mockResolvedValue([]),
        ensureCollection: vi.fn().mockResolvedValue(undefined)
      };
      synapticNetwork = new SynapticMemoryNetwork(mockClient as any);
    });

    it('空のコンテンツでエラーハンドリング', async () => {
      const invalidMemory = {
        ...testMemory,
        content: '' // 空のコンテンツ
      };

      await expect(synapticNetwork.store(invalidMemory))
        .rejects.toThrow();

      // システムが正常な状態を維持していることを確認
      const validMemory = { ...testMemory, id: 'valid-after-error' };
      await expect(synapticNetwork.store(validMemory))
        .resolves.not.toThrow();
    });

    it('無効な埋め込みベクトルでエラーハンドリング', async () => {
      const invalidMemory = {
        ...testMemory,
        embedding: [] as number[] // 空の埋め込み
      };

      await expect(synapticNetwork.store(invalidMemory))
        .rejects.toThrow();
    });

    it('不正な型のメタデータでエラーハンドリング', async () => {
      const invalidMemory = {
        ...testMemory,
        metadata: {
          type: 'invalid_type' as any, // 不正な型
          timestamp: 'invalid_timestamp' as any, // 不正なタイムスタンプ
        }
      };

      await expect(synapticNetwork.store(invalidMemory))
        .rejects.toThrow();
    });

    it('nullまたはundefinedでエラーハンドリング', async () => {
      await expect(synapticNetwork.store(null as any))
        .rejects.toThrow();

      await expect(synapticNetwork.store(undefined as any))
        .rejects.toThrow();
    });
  });

  describe('検索エラー', () => {
    beforeEach(() => {
      const mockClient = new FlakySqliteClient({
        sqlitePath: ':memory:'
      });
      synapticNetwork = new SynapticMemoryNetwork(mockClient);
    });

    it('検索クエリエラーが適切にハンドリングされること', async () => {
      await expect(synapticNetwork.search('trigger-error'))
        .rejects.toThrow('検索エラーが発生しました');

      // エラー後も他の検索は正常に動作することを確認
      const mockSearch = vi.fn().mockResolvedValue([]);
      (synapticNetwork as any).memoryClient.search = mockSearch;
      
      const results = await synapticNetwork.search('normal query');
      expect(results).toEqual([]);
    });

    it('空の検索結果が適切に処理されること', async () => {
      const mockClient = {
        search: vi.fn().mockResolvedValue([]),
        ensureCollection: vi.fn().mockResolvedValue(undefined)
      };
      synapticNetwork = new SynapticMemoryNetwork(mockClient as any);

      const results = await synapticNetwork.search('nonexistent');
      expect(results).toEqual([]);
      expect(results).toHaveLength(0);
    });

    it('検索タイムアウトエラー', async () => {
      const timeoutClient = {
        search: vi.fn().mockImplementation(() => 
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('タイムアウトしました')), 100)
          )
        ),
        ensureCollection: vi.fn().mockResolvedValue(undefined)
      };
      synapticNetwork = new SynapticMemoryNetwork(timeoutClient as any);

      await expect(synapticNetwork.search('timeout query'))
        .rejects.toThrow('タイムアウトしました');
    });
  });

  describe('メモリ活性化エラー', () => {
    beforeEach(() => {
      const mockClient = {
        search: vi.fn(),
        ensureCollection: vi.fn().mockResolvedValue(undefined)
      };
      synapticNetwork = new SynapticMemoryNetwork(mockClient as any);
    });

    it('存在しないメモリIDで活性化エラー', async () => {
      const mockSearch = vi.fn().mockResolvedValue([]);
      (synapticNetwork as any).memoryClient.search = mockSearch;

      await expect(synapticNetwork.activate('nonexistent-id'))
        .rejects.toThrow();
    });

    it('活性化処理中のエラー', async () => {
      const mockSearch = vi.fn()
        .mockResolvedValueOnce([testMemory]) // メモリ取得は成功
        .mockRejectedValueOnce(new Error('関連メモリ取得エラー')); // 関連メモリ取得で失敗

      (synapticNetwork as any).memoryClient.search = mockSearch;

      await expect(synapticNetwork.activate('error-test-memory'))
        .rejects.toThrow();
    });
  });

  describe('API層エラーハンドリング', () => {
    beforeEach(() => {
      memoryApi = new MemoryAPI({
        sqlitePath: ':memory:',
        enableEventProcessing: false,
        maxEventQueueSize: 100,
        eventProcessingInterval: 1000
      });
    });

    it('初期化エラーが適切にハンドリングされること', async () => {
      const faultyApi = new MemoryAPI({
        sqlitePath: '/invalid/path/database.db',
        enableEventProcessing: false,
        maxEventQueueSize: 100,
        eventProcessingInterval: 1000
      });

      await expect(faultyApi.initialize())
        .rejects.toThrow();
    });

    it('イベント処理エラーの回復', async () => {
      await memoryApi.initialize();

      // 無効なイベントを追加
      const invalidEvent = {
        type: 'invalid_type' as any,
        content: null,
        metadata: undefined
      };

      expect(() => {
        memoryApi.recordEvent(invalidEvent);
      }).not.toThrow(); // イベント追加自体はエラーを投げない

      // イベント処理でエラーが発生するがシステムは継続
      await memoryApi.processEventQueue();

      // 正常なイベントは処理できることを確認
      const validEvent = {
        type: 'user_input' as const,
        content: '正常なイベント',
        metadata: { timestamp: Date.now() }
      };

      expect(() => {
        memoryApi.recordEvent(validEvent);
      }).not.toThrow();
    });

    it('統計取得エラー', async () => {
      // memorySystemを破壊してエラー状況をシミュレート
      (memoryApi as any).memorySystem = null;

      expect(() => {
        const stats = memoryApi.getStatistics();
        expect(stats).toBeDefined();
        expect(stats.config).toBeDefined();
      }).not.toThrow(); // 統計取得は部分的に失敗しても結果を返す
    });
  });

  describe('並行処理エラー', () => {
    beforeEach(() => {
      const mockClient = {
        store: vi.fn(),
        search: vi.fn().mockResolvedValue([]),
        ensureCollection: vi.fn().mockResolvedValue(undefined)
      };
      synapticNetwork = new SynapticMemoryNetwork(mockClient as any);
    });

    it('並行保存処理でのエラー分離', async () => {
      let callCount = 0;
      const mockStore = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error('2番目の保存でエラー'));
        }
        return Promise.resolve();
      });

      (synapticNetwork as any).memoryClient.store = mockStore;

      const memories = [
        { ...testMemory, id: 'concurrent-1' },
        { ...testMemory, id: 'concurrent-2' }, // これがエラーになる
        { ...testMemory, id: 'concurrent-3' }
      ];

      const results = await Promise.allSettled(
        memories.map(memory => synapticNetwork.store(memory))
      );

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      // エラーが発生したものの詳細を確認
      const rejectedResult = results[1] as PromiseRejectedResult;
      expect(rejectedResult.reason.message).toContain('2番目の保存でエラー');
    });

    it('並行検索処理でのエラー分離', async () => {
      let searchCount = 0;
      const mockSearch = vi.fn().mockImplementation((query) => {
        searchCount++;
        if (query === 'error-query') {
          return Promise.reject(new Error('検索エラー'));
        }
        return Promise.resolve([]);
      });

      (synapticNetwork as any).memoryClient.search = mockSearch;

      const queries = ['normal-query-1', 'error-query', 'normal-query-2'];
      const results = await Promise.allSettled(
        queries.map(query => synapticNetwork.search(query))
      );

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');
    });
  });

  describe('リソース枯渇エラー', () => {
    it('メモリ不足シミュレーション', async () => {
      const mockClient = {
        store: vi.fn().mockRejectedValue(new Error('メモリ不足')),
        ensureCollection: vi.fn().mockResolvedValue(undefined)
      };
      synapticNetwork = new SynapticMemoryNetwork(mockClient as any);

      await expect(synapticNetwork.store(testMemory))
        .rejects.toThrow('メモリ不足');

      // システムが回復可能な状態にあることを確認
      const diagnostics = await synapticNetwork.getDiagnostics();
      expect(diagnostics).toBeDefined();
    });

    it('接続プール枯渇シミュレーション', async () => {
      networkSimulator = new NetworkErrorSimulator(0.7); // 70%の確率でエラー
      networkSimulator.enable();

      const mockClient = new SqliteMemoryClient({
        sqlitePath: ':memory:'
      });
      synapticNetwork = new SynapticMemoryNetwork(mockClient);

      // 複数の操作を並行実行してコネクションプールを枯渇させる
      const operations = Array(10).fill(0).map((_, i) => 
        synapticNetwork.store({ ...testMemory, id: `pool-test-${i}` })
      );

      const results = await Promise.allSettled(operations);
      
      // 一部は成功、一部は失敗することを期待
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;

      expect(successCount + failureCount).toBe(10);
      expect(failureCount).toBeGreaterThan(0); // 何らかのエラーが発生することを期待

      console.log(`接続プール枯渇テスト結果: 成功 ${successCount}件, 失敗 ${failureCount}件`);
    });
  });

  describe('回復処理テスト', () => {
    it('エラー後の自動回復機能', async () => {
      const flakyClient = new FlakySqliteClient({
        sqlitePath: ':memory:'
      }, 3); // 3回失敗後に成功

      synapticNetwork = new SynapticMemoryNetwork(flakyClient);

      // 失敗回数をカウント
      let errorCount = 0;

      // リトライ機能をシミュレート
      for (let i = 0; i < 5; i++) {
        try {
          const mockStore = vi.fn().mockImplementation(() => {
            if (errorCount < 3) {
              errorCount++;
              throw new Error(`一時的エラー ${errorCount}`);
            }
            return Promise.resolve();
          });

          (synapticNetwork as any).memoryClient.store = mockStore;
          await synapticNetwork.store(testMemory);
          
          // 成功したらループを抜ける
          break;
        } catch (error) {
          console.log(`リトライ ${i + 1}: ${(error as Error).message}`);
          
          // 最後のリトライでも失敗した場合はテスト失敗
          if (i === 4) {
            throw error;
          }
          
          // 短時間待機してからリトライ
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      expect(errorCount).toBe(3);
    });

    it('サーキットブレーカーパターン', async () => {
      let consecutiveFailures = 0;
      const maxFailures = 3;
      let circuitOpen = false;

      const circuitBreakerStore = async (memory: any) => {
        if (circuitOpen) {
          throw new Error('サーキット オープン: サービス利用不可');
        }

        try {
          if (consecutiveFailures >= maxFailures) {
            circuitOpen = true;
            throw new Error('サーキットブレーカー発動');
          }

          // 失敗をシミュレート
          if (consecutiveFailures < 3) {
            consecutiveFailures++;
            throw new Error(`保存失敗 ${consecutiveFailures}`);
          }

          // 成功時は失敗カウンタをリセット
          consecutiveFailures = 0;
          return Promise.resolve();
        } catch (error) {
          throw error;
        }
      };

      const mockClient = {
        store: circuitBreakerStore,
        ensureCollection: vi.fn().mockResolvedValue(undefined)
      };

      synapticNetwork = new SynapticMemoryNetwork(mockClient as any);

      // 最初の3回は失敗することを確認
      for (let i = 0; i < 3; i++) {
        await expect(synapticNetwork.store(testMemory))
          .rejects.toThrow();
      }

      // サーキットブレーカー発動後は即座にエラー
      await expect(synapticNetwork.store(testMemory))
        .rejects.toThrow('サーキット オープン');

      // サーキットをリセット（実際の実装では時間ベースで行う）
      circuitOpen = false;
      consecutiveFailures = 0;

      // リセット後は正常に動作
      await expect(synapticNetwork.store(testMemory))
        .resolves.not.toThrow();
    });
  });
});
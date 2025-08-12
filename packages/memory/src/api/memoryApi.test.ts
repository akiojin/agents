import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryAPI, MemoryAPIConfig } from './memoryApi';
import { SynapticMemoryNetwork } from '../synaptic/synapticNetwork';
import { SqliteMemoryClient } from '../sqlite/SqliteMemoryClient';

// モック設定
vi.mock('../synaptic/synapticNetwork', () => ({
  SynapticMemoryNetwork: vi.fn()
}));
vi.mock('../chroma/chromaClient', () => ({
  SqliteMemoryClient: vi.fn()
}));

const MockSynapticMemoryNetwork = SynapticMemoryNetwork as unknown as vi.MockedClass<typeof SynapticMemoryNetwork>;
const MockSqliteMemoryClient = SqliteMemoryClient as unknown as vi.MockedClass<typeof SqliteMemoryClient>;

describe('MemoryAPI', () => {
  let memoryApi: MemoryAPI;
  let mockMemorySystem: vi.Mocked<SynapticMemoryNetwork>;
  let mockConfig: MemoryAPIConfig;

  beforeEach(() => {
    // モックインスタンスをリセット
    vi.clearAllMocks();

    mockConfig = {
      chromaUrl: 'http://localhost:8000',
      enableEventProcessing: true,
      maxEventQueueSize: 1000,
      eventProcessingInterval: 100
    };

    // モックメモリシステムの作成
    mockMemorySystem = {
      memories: [],
      store: vi.fn(),
      search: vi.fn(),
      activate: vi.fn(),
      getConnectionStrength: vi.fn(),
      strengthenConnection: vi.fn(),
      getSynapses: vi.fn(),
      getDiagnostics: vi.fn(),
      importMemories: vi.fn(),
      exportMemories: vi.fn(),
      cleanup: vi.fn()
    } as unknown as vi.Mocked<SynapticMemoryNetwork>;

    MockSynapticMemoryNetwork.mockImplementation(() => mockMemorySystem);

    memoryApi = new MemoryAPI(mockConfig);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('初期化', () => {
    it('正常に初期化されること', async () => {
      await memoryApi.initialize();
      expect(MockSynapticMemoryNetwork).toHaveBeenCalledWith(expect.any(MockSqliteMemoryClient));
    });

    it('設定が正しく保存されること', () => {
      expect(memoryApi.config).toEqual(mockConfig);
    });
  });

  describe('メモリ検索 - GET /api/v1/memories', () => {
    beforeEach(async () => {
      await memoryApi.initialize();
    });

    it('クエリなしで全メモリを取得', async () => {
      const mockMemories = [
        { id: '1', content: 'テストメモリ1', embedding: [0.1, 0.2], metadata: { type: 'user_input' } },
        { id: '2', content: 'テストメモリ2', embedding: [0.3, 0.4], metadata: { type: 'success' } }
      ];
      mockMemorySystem.search.mockResolvedValue(mockMemories);

      const result = await memoryApi.search();
      
      expect(mockMemorySystem.search).toHaveBeenCalledWith('', 50);
      expect(result).toEqual(mockMemories);
    });

    it('クエリありで検索', async () => {
      const query = 'テスト検索';
      const mockMemories = [
        { id: '1', content: 'テストメモリ', embedding: [0.1, 0.2], metadata: { type: 'user_input' } }
      ];
      mockMemorySystem.search.mockResolvedValue(mockMemories);

      const result = await memoryApi.search(query, 10);
      
      expect(mockMemorySystem.search).toHaveBeenCalledWith(query, 10);
      expect(result).toEqual(mockMemories);
    });

    it('検索エラーをハンドリング', async () => {
      const error = new Error('検索エラー');
      mockMemorySystem.search.mockRejectedValue(error);

      await expect(memoryApi.search('query')).rejects.toThrow('検索エラー');
    });
  });

  describe('メモリ作成 - POST /api/v1/memories', () => {
    beforeEach(async () => {
      await memoryApi.initialize();
    });

    it('ユーザー入力を記録', async () => {
      const input = 'テストユーザー入力';
      const context = { sessionId: 'session1', timestamp: Date.now() };
      
      mockMemorySystem.store.mockResolvedValue();

      await memoryApi.recordUserInput(input, context);

      expect(mockMemorySystem.store).toHaveBeenCalledWith(
        expect.objectContaining({
          content: input,
          metadata: expect.objectContaining({
            type: 'user_input',
            sessionId: context.sessionId
          })
        })
      );
    });

    it('成功イベントを記録', async () => {
      const event = { action: 'file_created', details: 'test.ts' };
      const context = { sessionId: 'session1' };

      mockMemorySystem.store.mockResolvedValue();

      await memoryApi.recordSuccess(event, context);

      expect(mockMemorySystem.store).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining(event.action),
          metadata: expect.objectContaining({
            type: 'success',
            sessionId: context.sessionId
          })
        })
      );
    });

    it('エラー解決を記録', async () => {
      const error = 'TypeScriptエラー';
      const solution = '型注釈を追加';
      const context = { sessionId: 'session1' };

      mockMemorySystem.store.mockResolvedValue();

      await memoryApi.recordErrorResolution(error, solution, context);

      expect(mockMemorySystem.store).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining(error),
          metadata: expect.objectContaining({
            type: 'error_resolution',
            sessionId: context.sessionId
          })
        })
      );
    });
  });

  describe('シナプス接続 - GET /api/v1/synapses', () => {
    beforeEach(async () => {
      await memoryApi.initialize();
    });

    it('シナプス情報を取得', async () => {
      const mockSynapses = [
        { from: '1', to: '2', strength: 0.8, type: 'semantic' },
        { from: '2', to: '3', strength: 0.6, type: 'temporal' }
      ];
      mockMemorySystem.getSynapses.mockResolvedValue(mockSynapses);

      const result = await memoryApi.memorySystem?.getSynapses();

      expect(mockMemorySystem.getSynapses).toHaveBeenCalled();
      expect(result).toEqual(mockSynapses);
    });
  });

  describe('活性化実行 - POST /api/v1/activation/activate', () => {
    beforeEach(async () => {
      await memoryApi.initialize();
    });

    it('メモリを活性化', async () => {
      const memoryId = 'memory1';
      const mockActivatedMemories = [
        { id: 'memory1', content: 'アクティブメモリ', embedding: [0.5, 0.6], metadata: { activated: true } }
      ];
      mockMemorySystem.activate.mockResolvedValue(mockActivatedMemories);

      const result = await memoryApi.memorySystem?.activate(memoryId);

      expect(mockMemorySystem.activate).toHaveBeenCalledWith(memoryId);
      expect(result).toEqual(mockActivatedMemories);
    });

    it('活性化エラーをハンドリング', async () => {
      const memoryId = 'invalid';
      const error = new Error('メモリが見つかりません');
      mockMemorySystem.activate.mockRejectedValue(error);

      await expect(memoryApi.memorySystem?.activate(memoryId)).rejects.toThrow('メモリが見つかりません');
    });
  });

  describe('診断実行 - GET /api/v1/diagnostics/health', () => {
    beforeEach(async () => {
      await memoryApi.initialize();
    });

    it('診断情報を取得', async () => {
      const mockDiagnostics = {
        totalMemories: 100,
        activeSynapses: 50,
        avgConnectionStrength: 0.7,
        healthScore: 0.85,
        issues: []
      };
      mockMemorySystem.getDiagnostics.mockResolvedValue(mockDiagnostics);

      const result = await memoryApi.memorySystem?.getDiagnostics();

      expect(mockMemorySystem.getDiagnostics).toHaveBeenCalled();
      expect(result).toEqual(mockDiagnostics);
    });
  });

  describe('統計情報 - GET /api/v1/config', () => {
    it('統計情報を取得', async () => {
      const stats = memoryApi.getStatistics();

      expect(stats).toEqual({
        config: mockConfig,
        isProcessing: expect.any(Boolean),
        eventQueueSize: 0
      });
    });
  });

  describe('イベント処理', () => {
    beforeEach(async () => {
      await memoryApi.initialize();
    });

    it('イベントキューに追加', async () => {
      const event = {
        type: 'user_input' as const,
        content: 'テストイベント',
        metadata: { timestamp: Date.now() }
      };

      memoryApi.recordEvent(event);

      expect(memoryApi.eventQueue).toHaveLength(1);
    });

    it('イベント処理が実行される', async () => {
      const event = {
        type: 'user_input' as const,
        content: 'テストイベント',
        metadata: { timestamp: Date.now() }
      };

      mockMemorySystem.store.mockResolvedValue();

      memoryApi.recordEvent(event);
      await memoryApi.processEventQueue();

      expect(mockMemorySystem.store).toHaveBeenCalled();
      expect(memoryApi.eventQueue).toHaveLength(0);
    });
  });

  describe('エラーハンドリング', () => {
    it('エラーログを記録', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('テストエラー');

      memoryApi.handleError('test-operation', error);

      expect(consoleSpy).toHaveBeenCalledWith(
        'MemoryAPI Error in test-operation:',
        error
      );

      consoleSpy.mockRestore();
    });
  });

  describe('クリーンアップ', () => {
    it('リソースをクリーンアップ', async () => {
      await memoryApi.initialize();
      mockMemorySystem.cleanup.mockResolvedValue();

      await memoryApi.cleanup();

      expect(mockMemorySystem.cleanup).toHaveBeenCalled();
    });
  });
});
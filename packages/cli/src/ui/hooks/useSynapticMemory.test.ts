import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSynapticMemory } from './useSynapticMemory';

// モック設定
const mockMemoryApiInstance = {
  initialize: vi.fn(),
  search: vi.fn(),
  recordUserInput: vi.fn(),
  getStatistics: vi.fn(),
  cleanup: vi.fn(),
  memorySystem: {
    activate: vi.fn(),
    getSynapses: vi.fn(),
    getDiagnostics: vi.fn()
  }
};

// メモリAPIのモック
vi.mock('../../../../memory/src/api/memoryApi', () => ({
  memoryAPIInstance: mockMemoryApiInstance
}));

describe('useSynapticMemory', () => {
  const mockMemories = [
    {
      id: '1',
      content: 'テストメモリ1',
      embedding: [0.1, 0.2, 0.3],
      metadata: {
        type: 'user_input' as const,
        timestamp: Date.now(),
        sessionId: 'session1'
      }
    },
    {
      id: '2',
      content: 'テストメモリ2', 
      embedding: [0.4, 0.5, 0.6],
      metadata: {
        type: 'success' as const,
        timestamp: Date.now(),
        sessionId: 'session1'
      }
    }
  ];

  const mockSynapses = [
    {
      from: '1',
      to: '2',
      strength: 0.8,
      type: 'semantic' as const
    },
    {
      from: '2', 
      to: '3',
      strength: 0.6,
      type: 'temporal' as const
    }
  ];

  const mockNetworkHealth = {
    totalMemories: 150,
    activeSynapses: 75,
    avgConnectionStrength: 0.72,
    healthScore: 0.85,
    issues: ['接続強度が低いメモリが見つかりました'],
    suggestions: ['定期的な活性化を実行してください']
  };

  const mockConfig = {
    chromaUrl: 'http://localhost:8000',
    enableEventProcessing: true,
    maxEventQueueSize: 1000,
    eventProcessingInterval: 100
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // デフォルトのモック実装
    mockMemoryApiInstance.initialize.mockResolvedValue(undefined);
    mockMemoryApiInstance.search.mockResolvedValue(mockMemories);
    mockMemoryApiInstance.getStatistics.mockReturnValue({
      config: mockConfig,
      isProcessing: false,
      eventQueueSize: 0
    });
    
    if (mockMemoryApiInstance.memorySystem) {
      mockMemoryApiInstance.memorySystem.getSynapses.mockResolvedValue(mockSynapses);
      mockMemoryApiInstance.memorySystem.getDiagnostics.mockResolvedValue(mockNetworkHealth);
      mockMemoryApiInstance.memorySystem.activate.mockResolvedValue([mockMemories[0]]);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('初期状態が正しく設定されること', () => {
    const { result } = renderHook(() => useSynapticMemory());

    expect(result.current.memories).toEqual([]);
    expect(result.current.synapses).toEqual([]);
    expect(result.current.networkHealth).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.config).toBeNull();
  });

  it('初期化後にデータが読み込まれること', async () => {
    const { result } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(mockMemoryApiInstance.initialize).toHaveBeenCalled();
    expect(result.current.memories).toEqual(mockMemories);
    expect(result.current.synapses).toEqual(mockSynapses);
    expect(result.current.networkHealth).toEqual(mockNetworkHealth);
    expect(result.current.config).toEqual(mockConfig);
  });

  it('searchMemoriesが正しく動作すること', async () => {
    const { result } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const searchQuery = 'テスト検索';
    const searchResults = [mockMemories[0]];
    mockMemoryApiInstance.search.mockResolvedValue(searchResults);

    await act(async () => {
      await result.current.searchMemories(searchQuery);
    });

    expect(mockMemoryApiInstance.search).toHaveBeenCalledWith(searchQuery, 50);
    expect(result.current.memories).toEqual(searchResults);
  });

  it('activateMemoryが正しく動作すること', async () => {
    const { result } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const memoryId = 'memory1';
    const activatedMemories = [mockMemories[0]];
    
    if (mockMemoryApiInstance.memorySystem) {
      mockMemoryApiInstance.memorySystem.activate.mockResolvedValue(activatedMemories);
    }

    let activationResult;
    await act(async () => {
      activationResult = await result.current.activateMemory(memoryId);
    });

    expect(mockMemoryApiInstance.memorySystem?.activate).toHaveBeenCalledWith(memoryId);
    expect(activationResult).toEqual(activatedMemories);
  });

  it('refreshDataが正しく動作すること', async () => {
    const { result } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 最初の呼び出しをクリア
    vi.clearAllMocks();

    mockMemoryApiInstance.search.mockResolvedValue(mockMemories);
    if (mockMemoryApiInstance.memorySystem) {
      mockMemoryApiInstance.memorySystem.getSynapses.mockResolvedValue(mockSynapses);
      mockMemoryApiInstance.memorySystem.getDiagnostics.mockResolvedValue(mockNetworkHealth);
    }

    await act(async () => {
      await result.current.refreshData();
    });

    expect(mockMemoryApiInstance.search).toHaveBeenCalledWith('', 50);
    expect(mockMemoryApiInstance.memorySystem?.getSynapses).toHaveBeenCalled();
    expect(mockMemoryApiInstance.memorySystem?.getDiagnostics).toHaveBeenCalled();
  });

  it('初期化エラーが正しくハンドリングされること', async () => {
    const errorMessage = '初期化に失敗しました';
    mockMemoryApiInstance.initialize.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(`初期化エラー: ${errorMessage}`);
    expect(result.current.memories).toEqual([]);
    expect(result.current.synapses).toEqual([]);
    expect(result.current.networkHealth).toBeNull();
  });

  it('検索エラーが正しくハンドリングされること', async () => {
    const { result } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const errorMessage = '検索に失敗しました';
    mockMemoryApiInstance.search.mockRejectedValue(new Error(errorMessage));

    await act(async () => {
      await result.current.searchMemories('error query');
    });

    expect(result.current.error).toBe(`検索エラー: ${errorMessage}`);
  });

  it('活性化エラーが正しくハンドリングされること', async () => {
    const { result } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const errorMessage = '活性化に失敗しました';
    if (mockMemoryApiInstance.memorySystem) {
      mockMemoryApiInstance.memorySystem.activate.mockRejectedValue(new Error(errorMessage));
    }

    let thrownError;
    await act(async () => {
      try {
        await result.current.activateMemory('invalid-id');
      } catch (error) {
        thrownError = error;
      }
    });

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toBe(errorMessage);
  });

  it('データ更新エラーが正しくハンドリングされること', async () => {
    const { result } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const errorMessage = 'データ更新に失敗しました';
    mockMemoryApiInstance.search.mockRejectedValue(new Error(errorMessage));

    await act(async () => {
      await result.current.refreshData();
    });

    expect(result.current.error).toBe(`データ読み込みエラー: ${errorMessage}`);
  });

  it('クリーンアップが正しく実行されること', async () => {
    const { result, unmount } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    unmount();

    expect(mockMemoryApiInstance.cleanup).toHaveBeenCalled();
  });

  it('複数回の検索が正しく動作すること', async () => {
    const { result } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 最初の検索
    const firstResults = [mockMemories[0]];
    mockMemoryApiInstance.search.mockResolvedValue(firstResults);

    await act(async () => {
      await result.current.searchMemories('first query');
    });

    expect(result.current.memories).toEqual(firstResults);

    // 2回目の検索
    const secondResults = [mockMemories[1]];
    mockMemoryApiInstance.search.mockResolvedValue(secondResults);

    await act(async () => {
      await result.current.searchMemories('second query');
    });

    expect(result.current.memories).toEqual(secondResults);
    expect(mockMemoryApiInstance.search).toHaveBeenCalledTimes(3); // 初期化 + 2回の検索
  });

  it('同期的な活性化操作が正しく動作すること', async () => {
    const { result } = renderHook(() => useSynapticMemory());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const activatedMemories = [mockMemories[0], mockMemories[1]];
    if (mockMemoryApiInstance.memorySystem) {
      mockMemoryApiInstance.memorySystem.activate.mockResolvedValue(activatedMemories);
    }

    // 複数の活性化を同時実行
    const promises = [
      result.current.activateMemory('memory1'),
      result.current.activateMemory('memory2')
    ];

    let results;
    await act(async () => {
      results = await Promise.all(promises);
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(activatedMemories);
    expect(results[1]).toEqual(activatedMemories);
  });
});
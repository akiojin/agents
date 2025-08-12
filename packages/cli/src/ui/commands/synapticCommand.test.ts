import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { synapticCommand } from './synapticCommand';

// テスト用のモックコンテキスト
const mockContext = {
  input: '',
  sessionId: 'test-session',
  user: { id: 'test-user', name: 'Test User' },
  terminal: {
    width: 120,
    height: 40,
    clear: vi.fn(),
    write: vi.fn()
  },
  showComponent: vi.fn(),
  hideComponent: vi.fn(),
  outputStream: {
    write: vi.fn()
  }
};

// SynapticMemoryDashboardコンポーネントのモック
vi.mock('../components/SynapticMemoryDashboard', () => ({
  SynapticMemoryDashboard: vi.fn(({ onClose }) => {
    // テスト用の簡単なコンポーネント
    return {
      type: 'SynapticMemoryDashboard',
      props: { onClose }
    };
  })
}));

describe('synapticCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('引数なしでダッシュボードを表示すること', async () => {
    const result = await synapticCommand('', mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toBe('Synaptic Memory Dashboard を開いています...');
    expect(mockContext.showComponent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SynapticMemoryDashboard'
      })
    );
  });

  it('helpコマンドでヘルプメッセージを表示すること', async () => {
    const result = await synapticCommand('help', mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Synaptic Memory システムのコマンド:');
    expect(result.message).toContain('/synaptic - ダッシュボードを開く');
    expect(result.message).toContain('/synaptic help - このヘルプを表示');
  });

  it('--helpフラグでヘルプメッセージを表示すること', async () => {
    const result = await synapticCommand('--help', mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Synaptic Memory システムのコマンド:');
  });

  it('-hフラグでヘルプメッセージを表示すること', async () => {
    const result = await synapticCommand('-h', mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Synaptic Memory システムのコマンド:');
  });

  it('statusコマンドでシステム状態を表示すること', async () => {
    // memoryApiInstanceのモック
    const mockMemoryApi = {
      getStatistics: vi.fn().mockReturnValue({
        config: {
          sqlitePath: ':memory:',
          enableEventProcessing: true,
          maxEventQueueSize: 1000,
          eventProcessingInterval: 100
        },
        isProcessing: false,
        eventQueueSize: 5
      }),
      memorySystem: {
        getDiagnostics: vi.fn().mockResolvedValue({
          totalMemories: 150,
          activeSynapses: 75,
          avgConnectionStrength: 0.72,
          healthScore: 0.85,
          issues: [],
          suggestions: []
        })
      }
    };

    // memoryApiInstanceのモックを適用
    vi.doMock('../../../memory/src/api/memoryApi', () => ({
      memoryAPIInstance: mockMemoryApi
    }));

    const result = await synapticCommand('status', mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('Synaptic Memory システム状態:');
    expect(result.message).toContain('総メモリ数: 150');
    expect(result.message).toContain('アクティブシナプス: 75');
    expect(result.message).toContain('平均接続強度: 0.72');
    expect(result.message).toContain('健康スコア: 85%');
  });

  it('searchコマンドでメモリ検索を実行すること', async () => {
    const mockMemories = [
      {
        id: '1',
        content: 'テストメモリ1',
        embedding: [0.1, 0.2, 0.3],
        metadata: { type: 'user_input', timestamp: Date.now() }
      },
      {
        id: '2',
        content: 'テストメモリ2', 
        embedding: [0.4, 0.5, 0.6],
        metadata: { type: 'success', timestamp: Date.now() }
      }
    ];

    const mockMemoryApi = {
      search: vi.fn().mockResolvedValue(mockMemories)
    };

    vi.doMock('../../../memory/src/api/memoryApi', () => ({
      memoryAPIInstance: mockMemoryApi
    }));

    const result = await synapticCommand('search "テスト"', mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('検索結果 (2件):');
    expect(result.message).toContain('テストメモリ1');
    expect(result.message).toContain('テストメモリ2');
    expect(mockMemoryApi.search).toHaveBeenCalledWith('テスト', 10);
  });

  it('検索クエリなしでsearchコマンドを実行した場合エラーになること', async () => {
    const result = await synapticCommand('search', mockContext);

    expect(result.success).toBe(false);
    expect(result.message).toBe('検索クエリを指定してください: /synaptic search "クエリ"');
  });

  it('activateコマンドでメモリ活性化を実行すること', async () => {
    const mockActivatedMemories = [
      {
        id: 'memory1',
        content: 'アクティブメモリ',
        embedding: [0.5, 0.6, 0.7],
        metadata: { activated: true }
      }
    ];

    const mockMemoryApi = {
      memorySystem: {
        activate: vi.fn().mockResolvedValue(mockActivatedMemories)
      }
    };

    vi.doMock('../../../memory/src/api/memoryApi', () => ({
      memoryAPIInstance: mockMemoryApi
    }));

    const result = await synapticCommand('activate memory1', mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('メモリ "memory1" を活性化しました');
    expect(result.message).toContain('活性化されたメモリ: 1件');
    expect(mockMemoryApi.memorySystem.activate).toHaveBeenCalledWith('memory1');
  });

  it('メモリIDなしでactivateコマンドを実行した場合エラーになること', async () => {
    const result = await synapticCommand('activate', mockContext);

    expect(result.success).toBe(false);
    expect(result.message).toBe('メモリIDを指定してください: /synaptic activate <memory-id>');
  });

  it('存在しないサブコマンドでエラーになること', async () => {
    const result = await synapticCommand('unknown-command', mockContext);

    expect(result.success).toBe(false);
    expect(result.message).toBe('不明なコマンド: unknown-command. ヘルプを見るには /synaptic help を実行してください。');
  });

  it('ダッシュボード表示エラーをハンドリングすること', async () => {
    mockContext.showComponent.mockRejectedValue(new Error('コンポーネント表示エラー'));

    const result = await synapticCommand('', mockContext);

    expect(result.success).toBe(false);
    expect(result.message).toBe('ダッシュボードの表示でエラーが発生しました: コンポーネント表示エラー');
  });

  it('status取得エラーをハンドリングすること', async () => {
    const mockMemoryApi = {
      getStatistics: vi.fn().mockImplementation(() => {
        throw new Error('統計取得エラー');
      })
    };

    vi.doMock('../../../memory/src/api/memoryApi', () => ({
      memoryAPIInstance: mockMemoryApi
    }));

    const result = await synapticCommand('status', mockContext);

    expect(result.success).toBe(false);
    expect(result.message).toBe('ステータス取得でエラーが発生しました: 統計取得エラー');
  });

  it('検索エラーをハンドリングすること', async () => {
    const mockMemoryApi = {
      search: vi.fn().mockRejectedValue(new Error('検索エラー'))
    };

    vi.doMock('../../../memory/src/api/memoryApi', () => ({
      memoryAPIInstance: mockMemoryApi
    }));

    const result = await synapticCommand('search "エラーテスト"', mockContext);

    expect(result.success).toBe(false);
    expect(result.message).toBe('検索でエラーが発生しました: 検索エラー');
  });

  it('活性化エラーをハンドリングすること', async () => {
    const mockMemoryApi = {
      memorySystem: {
        activate: vi.fn().mockRejectedValue(new Error('活性化エラー'))
      }
    };

    vi.doMock('../../../memory/src/api/memoryApi', () => ({
      memoryAPIInstance: mockMemoryApi
    }));

    const result = await synapticCommand('activate invalid-id', mockContext);

    expect(result.success).toBe(false);
    expect(result.message).toBe('活性化でエラーが発生しました: 活性化エラー');
  });

  it('検索結果が空の場合の処理', async () => {
    const mockMemoryApi = {
      search: vi.fn().mockResolvedValue([])
    };

    vi.doMock('../../../memory/src/api/memoryApi', () => ({
      memoryAPIInstance: mockMemoryApi
    }));

    const result = await synapticCommand('search "存在しないクエリ"', mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toBe('検索結果が見つかりませんでした。');
  });

  it('活性化結果が空の場合の処理', async () => {
    const mockMemoryApi = {
      memorySystem: {
        activate: vi.fn().mockResolvedValue([])
      }
    };

    vi.doMock('../../../memory/src/api/memoryApi', () => ({
      memoryAPIInstance: mockMemoryApi
    }));

    const result = await synapticCommand('activate nonexistent', mockContext);

    expect(result.success).toBe(true);
    expect(result.message).toContain('メモリ "nonexistent" を活性化しました');
    expect(result.message).toContain('活性化されたメモリ: 0件');
  });

  it('複雑な検索クエリを正しく解析すること', async () => {
    const mockMemoryApi = {
      search: vi.fn().mockResolvedValue([])
    };

    vi.doMock('../../../memory/src/api/memoryApi', () => ({
      memoryAPIInstance: mockMemoryApi
    }));

    // クォートで囲まれたクエリ
    await synapticCommand('search "複雑な検索クエリ"', mockContext);
    expect(mockMemoryApi.search).toHaveBeenCalledWith('複雑な検索クエリ', 10);

    // シングルクォートで囲まれたクエリ
    await synapticCommand("search 'シングルクォート'", mockContext);
    expect(mockMemoryApi.search).toHaveBeenCalledWith('シングルクォート', 10);
  });
});
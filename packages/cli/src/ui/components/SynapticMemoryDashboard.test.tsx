import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { SynapticMemoryDashboard } from './SynapticMemoryDashboard';

// テスト用のモックデータ
const mockMemories = [
  {
    id: '1',
    content: 'テストメモリ1',
    embedding: [0.1, 0.2, 0.3],
    metadata: {
      type: 'user_input',
      timestamp: Date.now(),
      sessionId: 'session1'
    }
  },
  {
    id: '2', 
    content: 'テストメモリ2',
    embedding: [0.4, 0.5, 0.6],
    metadata: {
      type: 'success',
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

const mockProps = {
  terminalWidth: 120,
  terminalHeight: 40,
  onClose: vi.fn()
};

describe('SynapticMemoryDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // useSynapticMemoryフックのモック
    vi.doMock('../hooks/useSynapticMemory', () => ({
      useSynapticMemory: () => ({
        memories: mockMemories,
        synapses: mockSynapses,
        networkHealth: mockNetworkHealth,
        isLoading: false,
        error: null,
        searchMemories: vi.fn(),
        activateMemory: vi.fn(),
        refreshData: vi.fn(),
        config: {
          chromaUrl: 'http://localhost:8000',
          enableEventProcessing: true,
          maxEventQueueSize: 1000,
          eventProcessingInterval: 100
        }
      })
    }));
  });

  it('正常にレンダリングされること', async () => {
    render(<SynapticMemoryDashboard {...mockProps} />);
    
    // ダッシュボードのタイトルが表示されることを確認
    expect(screen.getByText('Synaptic Memory Dashboard')).toBeInTheDocument();
    
    // タブが表示されることを確認
    expect(screen.getByText('Memories')).toBeInTheDocument();
    expect(screen.getByText('Synapses')).toBeInTheDocument();
    expect(screen.getByText('Health')).toBeInTheDocument();
    expect(screen.getByText('Config')).toBeInTheDocument();
  });

  it('Memoriesタブでメモリ一覧が表示されること', async () => {
    render(<SynapticMemoryDashboard {...mockProps} />);
    
    // デフォルトでMemoriesタブが選択されている
    expect(screen.getByText('Total: 2')).toBeInTheDocument();
    
    // メモリの内容が表示されることを確認
    expect(screen.getByText('テストメモリ1')).toBeInTheDocument();
    expect(screen.getByText('テストメモリ2')).toBeInTheDocument();
  });

  it('Synapsesタブでシナプス接続が表示されること', async () => {
    render(<SynapticMemoryDashboard {...mockProps} />);
    
    // Synapsesタブをクリック
    fireEvent.click(screen.getByText('Synapses'));
    
    await waitFor(() => {
      expect(screen.getByText('Total: 2')).toBeInTheDocument();
      expect(screen.getByText(/1 → 2.*0.80.*semantic/)).toBeInTheDocument();
      expect(screen.getByText(/2 → 3.*0.60.*temporal/)).toBeInTheDocument();
    });
  });

  it('Healthタブでネットワーク健康状態が表示されること', async () => {
    render(<SynapticMemoryDashboard {...mockProps} />);
    
    // Healthタブをクリック
    fireEvent.click(screen.getByText('Health'));
    
    await waitFor(() => {
      expect(screen.getByText('Health Score: 85%')).toBeInTheDocument();
      expect(screen.getByText('Total Memories: 150')).toBeInTheDocument();
      expect(screen.getByText('Active Synapses: 75')).toBeInTheDocument();
      expect(screen.getByText('Avg Connection: 0.72')).toBeInTheDocument();
    });
  });

  it('Healthタブで問題と提案が表示されること', async () => {
    render(<SynapticMemoryDashboard {...mockProps} />);
    
    // Healthタブをクリック
    fireEvent.click(screen.getByText('Health'));
    
    await waitFor(() => {
      expect(screen.getByText('Issues:')).toBeInTheDocument();
      expect(screen.getByText('接続強度が低いメモリが見つかりました')).toBeInTheDocument();
      expect(screen.getByText('Suggestions:')).toBeInTheDocument();
      expect(screen.getByText('定期的な活性化を実行してください')).toBeInTheDocument();
    });
  });

  it('Configタブで設定が表示されること', async () => {
    render(<SynapticMemoryDashboard {...mockProps} />);
    
    // Configタブをクリック
    fireEvent.click(screen.getByText('Config'));
    
    await waitFor(() => {
      expect(screen.getByText('chromaUrl: http://localhost:8000')).toBeInTheDocument();
      expect(screen.getByText('enableEventProcessing: true')).toBeInTheDocument();
      expect(screen.getByText('maxEventQueueSize: 1000')).toBeInTheDocument();
      expect(screen.getByText('eventProcessingInterval: 100')).toBeInTheDocument();
    });
  });

  it('Escキーでダッシュボードが閉じられること', async () => {
    render(<SynapticMemoryDashboard {...mockProps} />);
    
    // Escキーを押下
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });
    
    await waitFor(() => {
      expect(mockProps.onClose).toHaveBeenCalled();
    });
  });

  it('qキーでダッシュボードが閉じられること', async () => {
    render(<SynapticMemoryDashboard {...mockProps} />);
    
    // qキーを押下
    fireEvent.keyDown(document, { key: 'q', code: 'KeyQ' });
    
    await waitFor(() => {
      expect(mockProps.onClose).toHaveBeenCalled();
    });
  });

  it('ターミナルサイズに応じてレイアウトが調整されること', async () => {
    const smallTerminalProps = {
      ...mockProps,
      terminalWidth: 60,
      terminalHeight: 20
    };

    render(<SynapticMemoryDashboard {...smallTerminalProps} />);
    
    // 小さなターミナルでも正常に表示されることを確認
    expect(screen.getByText('Synaptic Memory Dashboard')).toBeInTheDocument();
  });

  it('エラー状態が正しく表示されること', async () => {
    // エラー状態のモック
    vi.doMock('../hooks/useSynapticMemory', () => ({
      useSynapticMemory: () => ({
        memories: [],
        synapses: [],
        networkHealth: null,
        isLoading: false,
        error: 'ネットワークエラーが発生しました',
        searchMemories: vi.fn(),
        activateMemory: vi.fn(),
        refreshData: vi.fn(),
        config: null
      })
    }));

    const { rerender } = render(<SynapticMemoryDashboard {...mockProps} />);
    rerender(<SynapticMemoryDashboard {...mockProps} />);
    
    await waitFor(() => {
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
      expect(screen.getByText('ネットワークエラーが発生しました')).toBeInTheDocument();
    });
  });

  it('ローディング状態が正しく表示されること', async () => {
    // ローディング状態のモック  
    vi.doMock('../hooks/useSynapticMemory', () => ({
      useSynapticMemory: () => ({
        memories: [],
        synapses: [],
        networkHealth: null,
        isLoading: true,
        error: null,
        searchMemories: vi.fn(),
        activateMemory: vi.fn(),
        refreshData: vi.fn(),
        config: null
      })
    }));

    const { rerender } = render(<SynapticMemoryDashboard {...mockProps} />);
    rerender(<SynapticMemoryDashboard {...mockProps} />);
    
    await waitFor(() => {
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });
  });

  it('タブ間の切り替えが正しく動作すること', async () => {
    render(<SynapticMemoryDashboard {...mockProps} />);
    
    // 初期状態はMemoriesタブ
    expect(screen.getByText('テストメモリ1')).toBeInTheDocument();
    
    // Synapsesタブに切り替え
    fireEvent.click(screen.getByText('Synapses'));
    await waitFor(() => {
      expect(screen.getByText(/1 → 2/)).toBeInTheDocument();
    });
    
    // Healthタブに切り替え
    fireEvent.click(screen.getByText('Health'));
    await waitFor(() => {
      expect(screen.getByText('Health Score: 85%')).toBeInTheDocument();
    });
    
    // Configタブに切り替え
    fireEvent.click(screen.getByText('Config'));
    await waitFor(() => {
      expect(screen.getByText(/chromaUrl:/)).toBeInTheDocument();
    });
    
    // Memoriesタブに戻る
    fireEvent.click(screen.getByText('Memories'));
    await waitFor(() => {
      expect(screen.getByText('テストメモリ1')).toBeInTheDocument();
    });
  });
});
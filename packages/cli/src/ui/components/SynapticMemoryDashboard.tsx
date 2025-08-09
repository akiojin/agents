/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../colors.js';
import { MaxSizedBox } from './shared/MaxSizedBox.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

interface Memory {
  id: string;
  content: string;
  metadata: {
    created: Date;
    last_accessed: Date;
    access_count: number;
    success_rate: number;
    tags: string[];
  };
}

interface SynapticConnection {
  from: string;
  to: string;
  strength: number;
  coActivationCount: number;
  type: 'hebbian' | 'competitive' | 'contextual';
}

interface NetworkHealth {
  overall_health: 'excellent' | 'good' | 'moderate' | 'poor';
  health_score: number;
  issues: string[];
  suggestions: string[];
}

interface SynapticMemoryDashboardProps {
  // プロップなし - 内部でuseTerminalSizeを使用
}

export const SynapticMemoryDashboard: React.FC<SynapticMemoryDashboardProps> = () => {
  const { columns: terminalWidth, rows: terminalHeight } = useTerminalSize();
  const [activeTab, setActiveTab] = useState<'memories' | 'synapses' | 'health' | 'config'>('memories');
  const [memories, setMemories] = useState<Memory[]>([]);
  const [synapses, setSynapses] = useState<SynapticConnection[]>([]);
  const [networkHealth, setNetworkHealth] = useState<NetworkHealth | null>(null);
  const [selectedMemoryIndex, setSelectedMemoryIndex] = useState(0);
  const [loading, setLoading] = useState(false);

  useInput((input, key) => {
    if (key.tab) {
      const tabs = ['memories', 'synapses', 'health', 'config'] as const;
      const currentIndex = tabs.indexOf(activeTab);
      const nextIndex = (currentIndex + 1) % tabs.length;
      setActiveTab(tabs[nextIndex]);
    } else if (key.upArrow && activeTab === 'memories') {
      setSelectedMemoryIndex(Math.max(0, selectedMemoryIndex - 1));
    } else if (key.downArrow && activeTab === 'memories') {
      setSelectedMemoryIndex(Math.min(memories.length - 1, selectedMemoryIndex + 1));
    }
  });

  // モックデータの初期化
  useEffect(() => {
    const mockMemories: Memory[] = [
      {
        id: 'mem-001',
        content: 'GPT-5プロンプトガイドの分析結果',
        metadata: {
          created: new Date('2025-01-09'),
          last_accessed: new Date(),
          access_count: 15,
          success_rate: 0.92,
          tags: ['gpt5', 'prompting', 'analysis']
        }
      },
      {
        id: 'mem-002', 
        content: 'シナプス記憶システムのPhase 2実装完了',
        metadata: {
          created: new Date('2025-01-08'),
          last_accessed: new Date(),
          access_count: 8,
          success_rate: 0.88,
          tags: ['synaptic', 'implementation', 'phase2']
        }
      },
      {
        id: 'mem-003',
        content: 'RESTful API設計とエンドポイント定義',
        metadata: {
          created: new Date('2025-01-09'),
          last_accessed: new Date(),
          access_count: 12,
          success_rate: 0.85,
          tags: ['api', 'design', 'backend']
        }
      }
    ];

    const mockSynapses: SynapticConnection[] = [
      {
        from: 'mem-001',
        to: 'mem-002',
        strength: 0.78,
        coActivationCount: 5,
        type: 'hebbian'
      },
      {
        from: 'mem-002',
        to: 'mem-003',
        strength: 0.65,
        coActivationCount: 3,
        type: 'contextual'
      },
      {
        from: 'mem-001',
        to: 'mem-003',
        strength: 0.42,
        coActivationCount: 2,
        type: 'competitive'
      }
    ];

    const mockHealth: NetworkHealth = {
      overall_health: 'good',
      health_score: 0.82,
      issues: ['一部のシナプス結合が弱い', 'パターン学習効率が低下'],
      suggestions: ['記憶の活性化頻度を増やす', 'メンテナンスを実行する']
    };

    setMemories(mockMemories);
    setSynapses(mockSynapses);
    setNetworkHealth(mockHealth);
  }, []);

  const renderTabBar = () => {
    const tabs = [
      { key: 'memories', label: '記憶一覧' },
      { key: 'synapses', label: 'シナプス結合' },
      { key: 'health', label: 'ネットワーク診断' },
      { key: 'config', label: '設定' }
    ];

    return (
      <Box marginBottom={1}>
        {tabs.map((tab, index) => (
          <Box key={tab.key} marginRight={2}>
            <Text 
              color={activeTab === tab.key ? Colors.AccentGreen : Colors.Gray}
              bold={activeTab === tab.key}
            >
              [{index + 1}] {tab.label}
            </Text>
          </Box>
        ))}
      </Box>
    );
  };

  const renderMemoriesTab = () => {
    if (memories.length === 0) {
      return (
        <Box justifyContent="center" alignItems="center" flexGrow={1}>
          <Text color={Colors.Gray}>記憶がありません</Text>
        </Box>
      );
    }

    const availableHeight = terminalHeight - 8; // タブバーと余白を除く

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text color={Colors.AccentCyan}>記憶一覧 ({memories.length}件)</Text>
        </Box>
        
        <MaxSizedBox maxHeight={availableHeight} maxWidth={terminalWidth - 4}>
          {memories.map((memory, index) => (
            <Box key={memory.id}>
              <Text 
                color={index === selectedMemoryIndex ? Colors.AccentYellow : Colors.Foreground}
                bold={index === selectedMemoryIndex}
              >
                {index === selectedMemoryIndex ? '► ' : '  '}
                [{memory.id.slice(0, 8)}] {memory.content.slice(0, 50)}
                {memory.content.length > 50 ? '...' : ''}
              </Text>
            </Box>
          ))}
        </MaxSizedBox>

        {memories[selectedMemoryIndex] && (
          <Box marginTop={1} borderStyle="single" borderColor={Colors.Gray} padding={1}>
            <Box flexDirection="column">
              <Text color={Colors.AccentCyan}>詳細:</Text>
              <Text>ID: {memories[selectedMemoryIndex].id}</Text>
              <Text>アクセス数: {memories[selectedMemoryIndex].metadata.access_count}</Text>
              <Text>成功率: {(memories[selectedMemoryIndex].metadata.success_rate * 100).toFixed(1)}%</Text>
              <Text>タグ: {memories[selectedMemoryIndex].metadata.tags.join(', ')}</Text>
            </Box>
          </Box>
        )}
      </Box>
    );
  };

  const renderSynapsesTab = () => {
    if (synapses.length === 0) {
      return (
        <Box justifyContent="center" alignItems="center" flexGrow={1}>
          <Text color={Colors.Gray}>シナプス結合がありません</Text>
        </Box>
      );
    }

    const availableHeight = terminalHeight - 4;

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text color={Colors.AccentCyan}>シナプス結合 ({synapses.length}件)</Text>
        </Box>
        
        <MaxSizedBox maxHeight={availableHeight} maxWidth={terminalWidth - 4}>
          {synapses.map((synapse, index) => {
            const strengthBar = '█'.repeat(Math.ceil(synapse.strength * 10));
            const strengthColor = synapse.strength > 0.7 ? Colors.AccentGreen :
                                synapse.strength > 0.4 ? Colors.AccentYellow : Colors.AccentRed;
            
            return (
              <Box key={`${synapse.from}-${synapse.to}`}>
                <Text>
                  {synapse.from.slice(0, 8)} → {synapse.to.slice(0, 8)} 
                  <Text color={strengthColor}> [{strengthBar.padEnd(10)}] </Text>
                  {(synapse.strength * 100).toFixed(1)}% ({synapse.type})
                </Text>
              </Box>
            );
          })}
        </MaxSizedBox>
      </Box>
    );
  };

  const renderHealthTab = () => {
    if (!networkHealth) {
      return (
        <Box justifyContent="center" alignItems="center" flexGrow={1}>
          <Text color={Colors.Gray}>診断データを読み込み中...</Text>
        </Box>
      );
    }

    const healthColor = {
      excellent: Colors.AccentGreen,
      good: Colors.AccentCyan,
      moderate: Colors.AccentYellow,
      poor: Colors.AccentRed
    }[networkHealth.overall_health];

    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text color={Colors.AccentCyan}>ネットワーク診断結果</Text>
        </Box>

        <Box marginBottom={2}>
          <Text>
            総合健康度: <Text color={healthColor} bold>{networkHealth.overall_health.toUpperCase()}</Text>
            {' '}({(networkHealth.health_score * 100).toFixed(1)}%)
          </Text>
        </Box>

        {networkHealth.issues.length > 0 && (
          <Box flexDirection="column" marginBottom={2}>
            <Text color={Colors.AccentRed}>問題:</Text>
            {networkHealth.issues.map((issue, index) => (
              <Text key={index}> • {issue}</Text>
            ))}
          </Box>
        )}

        {networkHealth.suggestions.length > 0 && (
          <Box flexDirection="column">
            <Text color={Colors.AccentGreen}>推奨事項:</Text>
            {networkHealth.suggestions.map((suggestion, index) => (
              <Text key={index}> • {suggestion}</Text>
            ))}
          </Box>
        )}
      </Box>
    );
  };

  const renderConfigTab = () => {
    return (
      <Box flexDirection="column" flexGrow={1}>
        <Box marginBottom={1}>
          <Text color={Colors.AccentCyan}>ネットワーク設定</Text>
        </Box>

        <Box flexDirection="column">
          <Text>LTP閾値: 0.7</Text>
          <Text>LTD閾値: 0.2</Text>
          <Text>ホメオスタシス目標: 0.5</Text>
          <Text>最大伝播深度: 3</Text>
          <Text>パターン学習: 有効</Text>
        </Box>

        <Box marginTop={2}>
          <Text color={Colors.Gray}>[設定変更機能は今後実装予定]</Text>
        </Box>
      </Box>
    );
  };

  const renderCurrentTab = () => {
    switch (activeTab) {
      case 'memories': return renderMemoriesTab();
      case 'synapses': return renderSynapsesTab();
      case 'health': return renderHealthTab();
      case 'config': return renderConfigTab();
      default: return null;
    }
  };

  return (
    <Box flexDirection="column" width={terminalWidth} height={terminalHeight} padding={1}>
      <Box marginBottom={1}>
        <Text color={Colors.AccentPurple} bold>シナプス記憶システム ダッシュボード</Text>
      </Box>
      
      {renderTabBar()}
      
      <Box flexGrow={1} overflow="hidden">
        {renderCurrentTab()}
      </Box>

      <Box marginTop={1} borderStyle="single" borderColor={Colors.Gray} padding={1}>
        <Text color={Colors.Gray}>
          Tab: タブ切替 | ↑↓: 記憶選択 | q: 終了
        </Text>
      </Box>
    </Box>
  );
};
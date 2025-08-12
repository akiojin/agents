/**
 * シナプス記憶ネットワークの基本テスト
 */

import { SynapticMemoryNetwork, SynapticNetworkConfig } from './synapticNetwork.js';
import { SqliteMemoryClient, Memory } from '../sqlite/SqliteMemoryClient.js';

// モッククライアント
class MockSqliteClient extends SqliteMemoryClient {
  private mockMemories: Memory[] = [];
  
  constructor() {
    super({ chromaUrl: 'http://localhost:8000' });
  }
  
  async store(memory: Memory): Promise<void> {
    this.mockMemories.push(memory);
  }
  
  async search(query: string, limit = 10): Promise<Memory[]> {
    return this.mockMemories.slice(0, limit);
  }
  
  async getAll(): Promise<Memory[]> {
    return this.mockMemories;
  }
  
  async update(memory: Memory): Promise<void> {
    const index = this.mockMemories.findIndex(m => m.id === memory.id);
    if (index >= 0) {
      this.mockMemories[index] = memory;
    }
  }
}

describe('SynapticMemoryNetwork', () => {
  let network: SynapticMemoryNetwork;
  let mockClient: MockChromaClient;
  
  beforeEach(() => {
    mockClient = new MockChromaClient();
    network = new SynapticMemoryNetwork(mockClient);
  });

  describe('基本機能', () => {
    test('初期化が正常に動作する', async () => {
      await network.initialize();
      expect(network).toBeDefined();
    });

    test('記憶の追加が正常に動作する', async () => {
      const memory: Memory = {
        id: 'test-1',
        content: 'テストメモリ',
        metadata: {
          type: 'test',
          created: new Date(),
          access_count: 0,
          success_rate: 1.0,
          last_accessed: new Date()
        }
      };
      
      await network.addMemory(memory);
      expect(mockClient['mockMemories']).toHaveLength(1);
    });

    test('記憶の活性化が正常に動作する', async () => {
      const memory: Memory = {
        id: 'test-1',
        content: 'テストメモリ',
        metadata: {
          type: 'test',
          created: new Date(),
          access_count: 0,
          success_rate: 1.0,
          last_accessed: new Date()
        }
      };
      
      await network.addMemory(memory);
      await network.activate('test-1');
      
      // アクセス数が増加していることを確認
      const updatedMemory = mockClient['mockMemories'][0];
      expect(updatedMemory.metadata.access_count).toBe(1);
    });
  });

  describe('アクセスパターン学習', () => {
    test('アクセス履歴が記録される', () => {
      network.recordMemoryAccess('memory-1', ['context-1']);
      network.recordMemoryAccess('memory-2', ['context-1']);
      
      const stats = network.getLearningStatistics();
      expect(stats.accessHistorySize).toBe(2);
    });

    test('パターンが学習される', () => {
      network.recordMemoryAccess('memory-1', ['context-1']);
      network.recordMemoryAccess('memory-2', ['context-1']);
      network.recordMemoryAccess('memory-3', ['context-1']);
      
      const stats = network.getLearningStatistics();
      expect(stats.totalPatterns).toBeGreaterThan(0);
    });

    test('予測的記憶取得が動作する', async () => {
      // テストデータをセットアップ
      const memory1: Memory = {
        id: 'memory-1',
        content: 'メモリ1',
        metadata: { type: 'test', created: new Date(), access_count: 1, success_rate: 1.0, last_accessed: new Date() }
      };
      const memory2: Memory = {
        id: 'memory-2', 
        content: 'メモリ2',
        metadata: { type: 'test', created: new Date(), access_count: 1, success_rate: 1.0, last_accessed: new Date() }
      };
      
      await network.addMemory(memory1);
      await network.addMemory(memory2);
      
      // パターンを学習
      network.recordMemoryAccess('memory-1', ['context-1']);
      network.recordMemoryAccess('memory-2', ['context-1']);
      
      // 予測を実行
      const predictions = await network.predictNextMemories(['context-1'], 3);
      expect(predictions).toBeDefined();
      expect(Array.isArray(predictions)).toBe(true);
    });
  });

  describe('設定のカスタマイズ', () => {
    test('設定の更新が正常に動作する', () => {
      const config: SynapticNetworkConfig = {
        ltpThreshold: 0.8,
        ltdThreshold: 0.15,
        homeostaticTarget: 0.4
      };
      
      network.updateConfiguration(config);
      
      const currentConfig = network.getCurrentConfiguration();
      expect(currentConfig.ltpThreshold).toBe(0.8);
      expect(currentConfig.ltdThreshold).toBe(0.15);
      expect(currentConfig.homeostaticTarget).toBe(0.4);
    });

    test('プリセット設定が正常に適用される', () => {
      network.applyPresetConfiguration('aggressive');
      
      const config = network.getCurrentConfiguration();
      expect(config.ltpThreshold).toBe(0.6);
      expect(config.competitiveStrength).toBe(0.4);
    });

    test('設定値の範囲チェックが動作する', () => {
      const config: SynapticNetworkConfig = {
        ltpThreshold: 1.5, // 範囲外の値
        ltdThreshold: -0.1, // 範囲外の値
      };
      
      network.updateConfiguration(config);
      
      const currentConfig = network.getCurrentConfiguration();
      expect(currentConfig.ltpThreshold).toBe(1.0); // 上限でクランプ
      expect(currentConfig.ltdThreshold).toBe(0.0); // 下限でクランプ
    });
  });

  describe('ネットワーク診断', () => {
    test('健康状態の診断が実行される', () => {
      const diagnosis = network.diagnoseNetworkHealth();
      
      expect(diagnosis.overallHealth).toBeDefined();
      expect(['excellent', 'good', 'moderate', 'poor']).toContain(diagnosis.overallHealth);
      expect(Array.isArray(diagnosis.issues)).toBe(true);
      expect(Array.isArray(diagnosis.suggestions)).toBe(true);
      expect(diagnosis.metrics).toBeDefined();
    });
  });

  describe('時間減衰', () => {
    test('時間減衰が実行される', async () => {
      await network.decay();
      // エラーが発生しないことを確認
      expect(true).toBe(true);
    });

    test('記憶整理が実行される', async () => {
      await network.performMemoryMaintenance();
      // エラーが発生しないことを確認
      expect(true).toBe(true);
    });
  });

  describe('高度な機能', () => {
    test('シナプス可塑性が実行される', async () => {
      await network.performSynapticPlasticity();
      // エラーが発生しないことを確認
      expect(true).toBe(true);
    });

    test('ホメオスタシスが実行される', async () => {
      await network.maintainHomeostasis();
      // エラーが発生しないことを確認
      expect(true).toBe(true);
    });

    test('競合学習が実行される', async () => {
      await network.performCompetitiveLearning(['memory-1', 'memory-2']);
      // エラーが発生しないことを確認
      expect(true).toBe(true);
    });
  });
});
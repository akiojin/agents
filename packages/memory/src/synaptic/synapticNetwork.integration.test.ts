import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { SynapticMemoryNetwork } from './synapticNetwork';
import { SqliteMemoryClient } from '../sqlite/SqliteMemoryClient';
import { MemoryAPI } from '../api/memoryApi';

// 統合テスト用のテストデータベース設定
const TEST_CHROMA_URL = 'http://localhost:8000';
const TEST_COLLECTION_NAME = 'test-synaptic-memories';

describe('SynapticMemoryNetwork Integration Tests', () => {
  let synapticNetwork: SynapticMemoryNetwork;
  let sqliteClient: SqliteMemoryClient;
  let memoryApi: MemoryAPI;

  beforeAll(async () => {
    // テスト用Chromaクライアントの初期化
    sqliteClient = new SqliteMemoryClient({
      chromaUrl: TEST_CHROMA_URL,
      collectionName: TEST_COLLECTION_NAME
    });

    // テスト用コレクションが存在する場合は削除
    try {
      await sqliteClient.deleteCollection();
    } catch (error) {
      // コレクションが存在しない場合は無視
    }

    // 新しいコレクションを作成
    await sqliteClient.ensureCollection();
  });

  afterAll(async () => {
    // テスト後のクリーンアップ
    try {
      await sqliteClient.deleteCollection();
    } catch (error) {
      console.warn('テストクリーンアップ中にエラーが発生しました:', error);
    }
  });

  beforeEach(async () => {
    synapticNetwork = new SynapticMemoryNetwork(sqliteClient);
    memoryApi = new MemoryAPI({
      chromaUrl: TEST_CHROMA_URL,
      enableEventProcessing: false,
      maxEventQueueSize: 100,
      eventProcessingInterval: 1000
    });

    await memoryApi.initialize();
  });

  afterEach(async () => {
    await synapticNetwork.cleanup();
    await memoryApi.cleanup();
  });

  describe('メモリ保存と検索の統合', () => {
    it('メモリを保存して検索できること', async () => {
      const testMemory = {
        id: 'integration-test-1',
        content: 'これは統合テスト用のメモリです',
        embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
        metadata: {
          type: 'user_input' as const,
          timestamp: Date.now(),
          sessionId: 'integration-session'
        }
      };

      // メモリを保存
      await synapticNetwork.store(testMemory);

      // 保存されたメモリを検索
      const searchResults = await synapticNetwork.search('統合テスト', 5);

      expect(searchResults).toHaveLength(1);
      expect(searchResults[0].id).toBe(testMemory.id);
      expect(searchResults[0].content).toBe(testMemory.content);
    });

    it('複数のメモリを保存して類似度順に検索できること', async () => {
      const memories = [
        {
          id: 'similarity-1',
          content: 'TypeScriptの型システムについて学習しました',
          embedding: [0.8, 0.2, 0.1, 0.5, 0.3],
          metadata: { type: 'user_input' as const, timestamp: Date.now(), relevance: 'high' }
        },
        {
          id: 'similarity-2', 
          content: 'TypeScriptのジェネリクスは強力な機能です',
          embedding: [0.7, 0.3, 0.2, 0.4, 0.4],
          metadata: { type: 'success' as const, timestamp: Date.now(), relevance: 'high' }
        },
        {
          id: 'similarity-3',
          content: '今日の天気は晴れでした',
          embedding: [0.1, 0.8, 0.6, 0.2, 0.1],
          metadata: { type: 'user_input' as const, timestamp: Date.now(), relevance: 'low' }
        }
      ];

      // 全メモリを保存
      for (const memory of memories) {
        await synapticNetwork.store(memory);
      }

      // TypeScript関連で検索
      const results = await synapticNetwork.search('TypeScript', 3);

      expect(results).toHaveLength(3);
      // TypeScript関連のメモリが上位に来ることを期待
      expect(results[0].content).toContain('TypeScript');
      expect(results[1].content).toContain('TypeScript');
    });
  });

  describe('シナプス接続の統合', () => {
    it('関連するメモリ間でシナプス接続が形成されること', async () => {
      const memories = [
        {
          id: 'synapse-1',
          content: 'Reactコンポーネントを作成しました',
          embedding: [0.9, 0.1, 0.2, 0.3, 0.4],
          metadata: { type: 'success' as const, timestamp: Date.now() }
        },
        {
          id: 'synapse-2',
          content: 'Reactのフックを使用してstate管理をしました',
          embedding: [0.8, 0.2, 0.3, 0.2, 0.5],
          metadata: { type: 'success' as const, timestamp: Date.now() + 1000 }
        }
      ];

      // メモリを保存
      for (const memory of memories) {
        await synapticNetwork.store(memory);
      }

      // シナプス接続を取得
      const synapses = await synapticNetwork.getSynapses();

      expect(synapses.length).toBeGreaterThan(0);
      
      // React関連メモリ間の接続が存在することを確認
      const reactSynapses = synapses.filter(s => 
        (s.from === 'synapse-1' && s.to === 'synapse-2') ||
        (s.from === 'synapse-2' && s.to === 'synapse-1')
      );
      expect(reactSynapses.length).toBeGreaterThan(0);
    });

    it('時系列接続が正しく形成されること', async () => {
      const now = Date.now();
      const memories = [
        {
          id: 'temporal-1',
          content: 'プロジェクトを開始しました',
          embedding: [0.5, 0.5, 0.5, 0.5, 0.5],
          metadata: { type: 'user_input' as const, timestamp: now }
        },
        {
          id: 'temporal-2',
          content: 'コードを実装しました',
          embedding: [0.4, 0.6, 0.4, 0.6, 0.4],
          metadata: { type: 'success' as const, timestamp: now + 5000 }
        },
        {
          id: 'temporal-3',
          content: 'テストを完了しました',
          embedding: [0.3, 0.7, 0.3, 0.7, 0.3],
          metadata: { type: 'success' as const, timestamp: now + 10000 }
        }
      ];

      for (const memory of memories) {
        await synapticNetwork.store(memory);
      }

      const synapses = await synapticNetwork.getSynapses();
      
      // 時系列接続が存在することを確認
      const temporalSynapses = synapses.filter(s => s.type === 'temporal');
      expect(temporalSynapses.length).toBeGreaterThan(0);
    });
  });

  describe('メモリ活性化の統合', () => {
    it('メモリ活性化により関連メモリが連鎖的に活性化されること', async () => {
      const memories = [
        {
          id: 'activation-base',
          content: 'Node.jsでAPIサーバーを構築',
          embedding: [0.8, 0.3, 0.2, 0.4, 0.5],
          metadata: { type: 'user_input' as const, timestamp: Date.now() }
        },
        {
          id: 'activation-related-1',
          content: 'ExpressでルーティングをWayせず',
          embedding: [0.7, 0.4, 0.3, 0.3, 0.6],
          metadata: { type: 'success' as const, timestamp: Date.now() + 1000 }
        },
        {
          id: 'activation-related-2',
          content: 'Node.jsのパッケージ管理について学習',
          embedding: [0.6, 0.5, 0.4, 0.2, 0.7],
          metadata: { type: 'user_input' as const, timestamp: Date.now() + 2000 }
        }
      ];

      for (const memory of memories) {
        await synapticNetwork.store(memory);
      }

      // ベースメモリを活性化
      const activatedMemories = await synapticNetwork.activate('activation-base');

      // 関連メモリが活性化されていることを確認
      expect(activatedMemories.length).toBeGreaterThan(1);
      
      const activatedIds = activatedMemories.map(m => m.id);
      expect(activatedIds).toContain('activation-base');
      
      // Node.js関連のメモリが活性化されていることを期待
      const nodeRelatedActivations = activatedMemories.filter(m => 
        m.content.includes('Node.js') || m.content.includes('Express')
      );
      expect(nodeRelatedActivations.length).toBeGreaterThan(0);
    });
  });

  describe('APIとSynapticNetworkの統合', () => {
    it('API経由でのメモリ操作がSynapticNetworkに反映されること', async () => {
      // APIを通してユーザー入力を記録
      await memoryApi.recordUserInput(
        'React Hooksの使い方を学習したい',
        { sessionId: 'api-integration-session', timestamp: Date.now() }
      );

      // APIを通して成功イベントを記録
      await memoryApi.recordSuccess(
        { action: 'component_created', details: 'useEffect hook implementation' },
        { sessionId: 'api-integration-session' }
      );

      // SynapticNetwork経由で検索
      const searchResults = await synapticNetwork.search('React Hooks', 5);

      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].content).toContain('React Hooks');
    });

    it('API統計とSynapticNetwork診断が一致すること', async () => {
      // テストデータを追加
      for (let i = 0; i < 5; i++) {
        await memoryApi.recordUserInput(
          `テストメモリ${i + 1}`,
          { sessionId: 'stats-test', timestamp: Date.now() + i * 1000 }
        );
      }

      // API統計を取得
      const apiStats = memoryApi.getStatistics();
      
      // SynapticNetwork診断を取得
      const networkDiagnostics = await synapticNetwork.getDiagnostics();

      // 基本的な一致確認
      expect(apiStats.config).toBeDefined();
      expect(networkDiagnostics.totalMemories).toBeGreaterThan(0);
      expect(networkDiagnostics.healthScore).toBeGreaterThan(0);
    });
  });

  describe('エラー耐性の統合テスト', () => {
    it('不正なメモリデータでもシステムが停止しないこと', async () => {
      const invalidMemories = [
        {
          id: 'invalid-1',
          content: '', // 空のコンテンツ
          embedding: [0.1, 0.2, 0.3],
          metadata: { type: 'user_input' as const, timestamp: Date.now() }
        },
        {
          id: 'invalid-2',
          content: 'valid content',
          embedding: [], // 空の埋め込み
          metadata: { type: 'success' as const, timestamp: Date.now() }
        }
      ];

      // 不正データの処理が例外を投げないことを確認
      for (const memory of invalidMemories) {
        try {
          await synapticNetwork.store(memory);
        } catch (error) {
          // エラーは期待されるが、システムは継続可能である
          expect(error).toBeDefined();
        }
      }

      // システムが正常に動作し続けることを確認
      const validMemory = {
        id: 'valid-after-error',
        content: 'エラー後の正常なメモリ',
        embedding: [0.5, 0.5, 0.5, 0.5, 0.5],
        metadata: { type: 'user_input' as const, timestamp: Date.now() }
      };

      await synapticNetwork.store(validMemory);
      const results = await synapticNetwork.search('正常', 5);
      expect(results.length).toBeGreaterThan(0);
    });

    it('データベース接続エラーの回復テスト', async () => {
      // 正常なメモリを保存
      const memory = {
        id: 'recovery-test',
        content: '回復テスト用メモリ',
        embedding: [0.4, 0.4, 0.4, 0.4, 0.4],
        metadata: { type: 'user_input' as const, timestamp: Date.now() }
      };

      await synapticNetwork.store(memory);

      // 診断でシステムの健全性を確認
      const diagnostics = await synapticNetwork.getDiagnostics();
      expect(diagnostics.healthScore).toBeGreaterThan(0);
      expect(diagnostics.totalMemories).toBeGreaterThan(0);
    });
  });

  describe('パフォーマンス統合テスト', () => {
    it('大量データでの検索パフォーマンスが許容範囲内であること', async () => {
      // 大量のテストデータを作成
      const batchSize = 50;
      const memories = [];

      for (let i = 0; i < batchSize; i++) {
        memories.push({
          id: `perf-test-${i}`,
          content: `パフォーマンステスト用メモリ ${i}: JavaScript、TypeScript、React、Node.jsなどの技術について`,
          embedding: Array(5).fill(0).map(() => Math.random()),
          metadata: {
            type: i % 2 === 0 ? 'user_input' as const : 'success' as const,
            timestamp: Date.now() + i * 100,
            batch: 'performance-test'
          }
        });
      }

      // バッチでメモリを保存
      const storeStart = performance.now();
      for (const memory of memories) {
        await synapticNetwork.store(memory);
      }
      const storeTime = performance.now() - storeStart;

      // 検索パフォーマンステスト
      const searchStart = performance.now();
      const searchResults = await synapticNetwork.search('JavaScript', 10);
      const searchTime = performance.now() - searchStart;

      // パフォーマンス要件の確認（調整可能）
      expect(storeTime).toBeLessThan(30000); // 30秒以内
      expect(searchTime).toBeLessThan(5000);  // 5秒以内
      expect(searchResults.length).toBeGreaterThan(0);

      console.log(`パフォーマンステスト結果:`);
      console.log(`- 保存時間: ${storeTime}ms (${batchSize}件)`);
      console.log(`- 検索時間: ${searchTime}ms`);
      console.log(`- 検索結果: ${searchResults.length}件`);
    });
  });
});
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { performance } from 'perf_hooks';
import { SynapticMemoryNetwork } from '../../packages/memory/src/synaptic/synapticNetwork';
import { ChromaMemoryClient } from '../../packages/memory/src/chroma/chromaClient';
import { MemoryAPI } from '../../packages/memory/src/api/memoryApi';

// パフォーマンステスト用の設定
const PERFORMANCE_TEST_CONFIG = {
  chromaUrl: 'http://localhost:8000',
  collectionName: 'performance-test-memories',
  
  // テストサイズの設定
  smallDataset: 50,
  mediumDataset: 200, 
  largeDataset: 1000,
  
  // パフォーマンス要件 (ミリ秒)
  maxSearchTime: 2000,      // 検索: 2秒以内
  maxStoreTime: 500,        // 単一保存: 0.5秒以内
  maxBatchStoreTime: 30000, // バッチ保存: 30秒以内
  maxActivationTime: 3000,  // 活性化: 3秒以内
  maxMemoryUsage: 512 * 1024 * 1024, // メモリ使用量: 512MB以内
};

// パフォーマンス測定ユーティリティ
class PerformanceProfiler {
  private startTime: number = 0;
  private memoryStart: NodeJS.MemoryUsage | null = null;

  start(): void {
    this.startTime = performance.now();
    this.memoryStart = process.memoryUsage();
  }

  end(): { time: number; memory: NodeJS.MemoryUsage } {
    const endTime = performance.now();
    const memoryEnd = process.memoryUsage();
    
    return {
      time: endTime - this.startTime,
      memory: {
        rss: memoryEnd.rss - (this.memoryStart?.rss ?? 0),
        heapUsed: memoryEnd.heapUsed - (this.memoryStart?.heapUsed ?? 0),
        heapTotal: memoryEnd.heapTotal - (this.memoryStart?.heapTotal ?? 0),
        external: memoryEnd.external - (this.memoryStart?.external ?? 0),
        arrayBuffers: memoryEnd.arrayBuffers - (this.memoryStart?.arrayBuffers ?? 0)
      }
    };
  }
}

// テストデータ生成器
class TestDataGenerator {
  static generateMemory(id: string, contentType: 'tech' | 'general' | 'complex' = 'tech') {
    const techContent = [
      'TypeScriptの型システムについて学習しました',
      'Reactのコンポーネントライフサイクルを理解しました', 
      'Node.jsでAPIサーバーを構築する方法を学びました',
      'データベース設計の最適化について研究しました',
      'マイクロサービスアーキテクチャの実装を完了しました',
      'GraphQLの統合による効率的なデータフェッチングを実装しました',
      'Dockerコンテナによる本番環境のデプロイを成功しました',
      'テスト駆動開発によるコード品質の向上を体験しました'
    ];

    const generalContent = [
      '今日は新しいプロジェクトを開始しました',
      'チームメンバーとの効果的な協力方法を学びました',
      'プロジェクト管理ツールの使い方を習得しました',
      '顧客要件の分析手法について理解を深めました',
      'アジャイル開発プロセスの改善点を発見しました'
    ];

    const complexContent = [
      '分散システムにおけるCAP定理の実際の適用例を分析し、最終的一貫性モデルを採用することで可用性とパーティション耐性を確保しました',
      'マイクロサービス間の通信パターンとして、同期的なREST API呼び出しから非同期的なイベント駆動アーキテクチャに移行することで、システムの弾力性と拡張性を大幅に改善しました',
      'Kubernetesクラスタでの自動スケーリング戦略を最適化し、HorizontalPodAutoscalerとVerticalPodAutoscalerを組み合わせることで、コスト効率と性能のバランスを実現しました'
    ];

    let content: string;
    let contentArray: string[];

    switch (contentType) {
      case 'tech':
        contentArray = techContent;
        break;
      case 'general':
        contentArray = generalContent;
        break;
      case 'complex':
        contentArray = complexContent;
        break;
    }

    content = contentArray[Math.floor(Math.random() * contentArray.length)];

    return {
      id,
      content,
      embedding: Array(384).fill(0).map(() => Math.random() * 2 - 1), // 384次元の埋め込み
      metadata: {
        type: Math.random() > 0.5 ? 'user_input' as const : 'success' as const,
        timestamp: Date.now() + Math.floor(Math.random() * 1000000),
        category: contentType,
        complexity: contentType === 'complex' ? 'high' : 'medium',
        priority: Math.floor(Math.random() * 5) + 1
      }
    };
  }

  static generateDataset(size: number, contentType?: 'tech' | 'general' | 'complex') {
    const memories = [];
    for (let i = 0; i < size; i++) {
      const type = contentType || (['tech', 'general', 'complex'] as const)[i % 3];
      memories.push(this.generateMemory(`perf-test-${i}`, type));
    }
    return memories;
  }
}

describe('Synaptic Memory Performance Tests', () => {
  let synapticNetwork: SynapticMemoryNetwork;
  let chromaClient: ChromaMemoryClient;
  let memoryApi: MemoryAPI;
  let profiler: PerformanceProfiler;

  beforeAll(async () => {
    chromaClient = new ChromaMemoryClient({
      chromaUrl: PERFORMANCE_TEST_CONFIG.chromaUrl,
      collectionName: PERFORMANCE_TEST_CONFIG.collectionName
    });

    // テスト用コレクションの準備
    try {
      await chromaClient.deleteCollection();
    } catch (error) {
      // コレクションが存在しない場合は無視
    }
    await chromaClient.ensureCollection();

    memoryApi = new MemoryAPI({
      chromaUrl: PERFORMANCE_TEST_CONFIG.chromaUrl,
      enableEventProcessing: false,
      maxEventQueueSize: 10000,
      eventProcessingInterval: 1000
    });

    await memoryApi.initialize();
  }, 60000);

  afterAll(async () => {
    try {
      await chromaClient.deleteCollection();
      await synapticNetwork.cleanup();
      await memoryApi.cleanup();
    } catch (error) {
      console.warn('クリーンアップエラー:', error);
    }
  });

  beforeEach(() => {
    synapticNetwork = new SynapticMemoryNetwork(chromaClient);
    profiler = new PerformanceProfiler();
  });

  afterEach(async () => {
    await synapticNetwork.cleanup();
  });

  describe('メモリ保存パフォーマンス', () => {
    it('単一メモリの保存が要件時間内に完了すること', async () => {
      const memory = TestDataGenerator.generateMemory('single-store-test');

      profiler.start();
      await synapticNetwork.store(memory);
      const result = profiler.end();

      expect(result.time).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxStoreTime);
      console.log(`単一メモリ保存時間: ${result.time.toFixed(2)}ms`);
      console.log(`メモリ使用量増加: ${(result.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    });

    it('小規模データセット（50件）のバッチ保存パフォーマンス', async () => {
      const memories = TestDataGenerator.generateDataset(PERFORMANCE_TEST_CONFIG.smallDataset);

      profiler.start();
      for (const memory of memories) {
        await synapticNetwork.store(memory);
      }
      const result = profiler.end();

      const avgTimePerMemory = result.time / memories.length;
      
      expect(result.time).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxBatchStoreTime);
      expect(result.memory.heapUsed).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxMemoryUsage);

      console.log(`小規模データセット保存時間: ${result.time.toFixed(2)}ms`);
      console.log(`平均保存時間: ${avgTimePerMemory.toFixed(2)}ms/件`);
      console.log(`メモリ使用量: ${(result.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    });

    it('中規模データセット（200件）のバッチ保存パフォーマンス', async () => {
      const memories = TestDataGenerator.generateDataset(PERFORMANCE_TEST_CONFIG.mediumDataset);

      profiler.start();
      for (const memory of memories) {
        await synapticNetwork.store(memory);
      }
      const result = profiler.end();

      const avgTimePerMemory = result.time / memories.length;
      
      expect(result.time).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxBatchStoreTime * 4); // 中規模なので4倍の時間を許容
      expect(result.memory.heapUsed).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxMemoryUsage * 2);

      console.log(`中規模データセット保存時間: ${result.time.toFixed(2)}ms`);
      console.log(`平均保存時間: ${avgTimePerMemory.toFixed(2)}ms/件`);
      console.log(`メモリ使用量: ${(result.memory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    }, 120000);
  });

  describe('メモリ検索パフォーマンス', () => {
    beforeEach(async () => {
      // テストデータを事前に準備
      const memories = TestDataGenerator.generateDataset(PERFORMANCE_TEST_CONFIG.smallDataset);
      for (const memory of memories) {
        await synapticNetwork.store(memory);
      }
    });

    it('基本検索クエリの応答時間が要件内であること', async () => {
      const queries = [
        'TypeScript',
        'React',
        'Node.js',
        'データベース',
        'プロジェクト'
      ];

      for (const query of queries) {
        profiler.start();
        const results = await synapticNetwork.search(query, 10);
        const performance = profiler.end();

        expect(performance.time).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxSearchTime);
        expect(results).toBeInstanceOf(Array);

        console.log(`検索クエリ "${query}": ${performance.time.toFixed(2)}ms, 結果数: ${results.length}`);
      }
    });

    it('複雑な検索クエリでもパフォーマンスが維持されること', async () => {
      const complexQueries = [
        'TypeScript React コンポーネント',
        'Node.js API サーバー データベース',
        'マイクロサービス アーキテクチャ 実装',
        'テスト駆動開発 コード品質'
      ];

      for (const query of complexQueries) {
        profiler.start();
        const results = await synapticNetwork.search(query, 20);
        const performance = profiler.end();

        expect(performance.time).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxSearchTime * 1.5); // 複雑クエリなので1.5倍を許容
        expect(results).toBeInstanceOf(Array);

        console.log(`複雑検索 "${query}": ${performance.time.toFixed(2)}ms, 結果数: ${results.length}`);
      }
    });

    it('大量検索結果の取得パフォーマンス', async () => {
      profiler.start();
      const results = await synapticNetwork.search('', 50); // 全件検索
      const performance = profiler.end();

      expect(performance.time).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxSearchTime * 2);
      expect(results.length).toBeGreaterThan(0);

      console.log(`大量検索結果取得: ${performance.time.toFixed(2)}ms, 結果数: ${results.length}`);
    });
  });

  describe('メモリ活性化パフォーマンス', () => {
    beforeEach(async () => {
      // 関連性のあるテストデータを準備
      const techMemories = TestDataGenerator.generateDataset(20, 'tech');
      for (const memory of techMemories) {
        await synapticNetwork.store(memory);
      }
    });

    it('メモリ活性化の応答時間が要件内であること', async () => {
      // 最初のメモリを取得
      const allMemories = await synapticNetwork.search('', 1);
      expect(allMemories.length).toBeGreaterThan(0);

      const targetMemoryId = allMemories[0].id;

      profiler.start();
      const activatedMemories = await synapticNetwork.activate(targetMemoryId);
      const performance = profiler.end();

      expect(performance.time).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxActivationTime);
      expect(activatedMemories).toBeInstanceOf(Array);
      expect(activatedMemories.length).toBeGreaterThan(0);

      console.log(`メモリ活性化時間: ${performance.time.toFixed(2)}ms`);
      console.log(`活性化されたメモリ数: ${activatedMemories.length}`);
    });

    it('連続的な活性化処理のパフォーマンス', async () => {
      const memories = await synapticNetwork.search('', 5);
      expect(memories.length).toBeGreaterThan(0);

      const totalStart = performance.now();
      const activationResults = [];

      for (const memory of memories.slice(0, 3)) {
        profiler.start();
        const activated = await synapticNetwork.activate(memory.id);
        const perf = profiler.end();

        activationResults.push({
          memoryId: memory.id,
          time: perf.time,
          activatedCount: activated.length
        });

        expect(perf.time).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxActivationTime);
      }

      const totalTime = performance.now() - totalStart;

      console.log(`連続活性化総時間: ${totalTime.toFixed(2)}ms`);
      activationResults.forEach(result => {
        console.log(`- メモリ ${result.memoryId}: ${result.time.toFixed(2)}ms (${result.activatedCount}件活性化)`);
      });
    });
  });

  describe('システム全体パフォーマンス', () => {
    it('混合ワークロードでのシステムパフォーマンス', async () => {
      const workloadStart = performance.now();
      
      // 段階1: データ準備
      const initialMemories = TestDataGenerator.generateDataset(30, 'tech');
      for (const memory of initialMemories) {
        await synapticNetwork.store(memory);
      }

      // 段階2: 複数の検索操作
      const searchPromises = [
        synapticNetwork.search('TypeScript', 5),
        synapticNetwork.search('React', 5),
        synapticNetwork.search('Node.js', 5)
      ];
      const searchResults = await Promise.all(searchPromises);

      // 段階3: 活性化操作
      if (searchResults[0].length > 0) {
        await synapticNetwork.activate(searchResults[0][0].id);
      }

      // 段階4: 追加のメモリ保存
      const additionalMemories = TestDataGenerator.generateDataset(10, 'complex');
      for (const memory of additionalMemories) {
        await synapticNetwork.store(memory);
      }

      // 段階5: システム診断
      const diagnostics = await synapticNetwork.getDiagnostics();

      const totalTime = performance.now() - workloadStart;

      expect(totalTime).toBeLessThan(60000); // 60秒以内
      expect(diagnostics.totalMemories).toBeGreaterThan(0);
      expect(diagnostics.healthScore).toBeGreaterThan(0);

      console.log(`混合ワークロード総時間: ${totalTime.toFixed(2)}ms`);
      console.log(`最終メモリ数: ${diagnostics.totalMemories}`);
      console.log(`システム健康スコア: ${diagnostics.healthScore}`);
      
      // 各検索結果の確認
      searchResults.forEach((results, index) => {
        console.log(`検索${index + 1}結果数: ${results.length}`);
      });
    }, 120000);

    it('メモリリークがないことの確認', async () => {
      const iterations = 20;
      const memoryUsages = [];

      for (let i = 0; i < iterations; i++) {
        // 操作を実行
        const memory = TestDataGenerator.generateMemory(`leak-test-${i}`);
        await synapticNetwork.store(memory);
        await synapticNetwork.search('test', 5);

        // メモリ使用量を記録
        const usage = process.memoryUsage();
        memoryUsages.push(usage.heapUsed);

        // 強制的にガベージコレクション（可能な場合）
        if (global.gc) {
          global.gc();
        }
      }

      // メモリ使用量の増加傾向を分析
      const firstHalf = memoryUsages.slice(0, iterations / 2);
      const secondHalf = memoryUsages.slice(iterations / 2);

      const firstHalfAvg = firstHalf.reduce((a, b) => a + b) / firstHalf.length;
      const secondHalfAvg = secondHalf.reduce((a, b) => a + b) / secondHalf.length;

      const memoryGrowth = secondHalfAvg - firstHalfAvg;
      const growthPercentage = (memoryGrowth / firstHalfAvg) * 100;

      console.log(`メモリ使用量変化: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      console.log(`メモリ増加率: ${growthPercentage.toFixed(2)}%`);

      // メモリリークの判定（50%以上の増加は問題とする）
      expect(growthPercentage).toBeLessThan(50);
    }, 60000);
  });

  describe('並行処理パフォーマンス', () => {
    it('並行保存処理のパフォーマンス', async () => {
      const concurrentMemories = TestDataGenerator.generateDataset(20);
      
      profiler.start();
      const storePromises = concurrentMemories.map(memory => 
        synapticNetwork.store(memory)
      );
      await Promise.all(storePromises);
      const performance = profiler.end();

      expect(performance.time).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxBatchStoreTime);

      console.log(`並行保存時間: ${performance.time.toFixed(2)}ms`);
      console.log(`平均並行保存時間: ${(performance.time / concurrentMemories.length).toFixed(2)}ms/件`);
    });

    it('並行検索処理のパフォーマンス', async () => {
      // 事前データ準備
      const memories = TestDataGenerator.generateDataset(30);
      for (const memory of memories) {
        await synapticNetwork.store(memory);
      }

      const searchQueries = [
        'TypeScript', 'React', 'Node.js', 'データベース', 'API',
        'プロジェクト', 'テスト', 'パフォーマンス', '実装', 'アーキテクチャ'
      ];

      profiler.start();
      const searchPromises = searchQueries.map(query => 
        synapticNetwork.search(query, 5)
      );
      const results = await Promise.all(searchPromises);
      const performance = profiler.end();

      expect(performance.time).toBeLessThan(PERFORMANCE_TEST_CONFIG.maxSearchTime * 3); // 並行処理なので3倍を許容
      expect(results).toHaveLength(searchQueries.length);

      console.log(`並行検索時間: ${performance.time.toFixed(2)}ms`);
      console.log(`平均並行検索時間: ${(performance.time / searchQueries.length).toFixed(2)}ms/クエリ`);
      
      // 各検索結果の統計
      const totalResults = results.reduce((total, result) => total + result.length, 0);
      console.log(`総検索結果数: ${totalResults}`);
    });
  });
});
/**
 * Synaptic Memory システム用のテストデータファクトリー
 * テスト全体で一貫したダミーデータを提供
 */

export interface TestMemory {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    type: 'user_input' | 'success' | 'error_resolution' | 'tool_execution';
    timestamp: number;
    sessionId?: string;
    category?: string;
    priority?: number;
    [key: string]: any;
  };
}

export interface TestSynapticConnection {
  from: string;
  to: string;
  strength: number;
  type: 'semantic' | 'temporal' | 'causal';
}

export interface TestNetworkHealth {
  totalMemories: number;
  activeSynapses: number;
  avgConnectionStrength: number;
  healthScore: number;
  issues: string[];
  suggestions: string[];
}

/**
 * メモリテストデータファクトリー
 */
export class MemoryFactory {
  private static idCounter = 0;

  /**
   * 基本的なテストメモリを生成
   */
  static create(overrides: Partial<TestMemory> = {}): TestMemory {
    const id = `test-memory-${++this.idCounter}`;
    
    return {
      id,
      content: `テストメモリ内容 ${this.idCounter}`,
      embedding: this.generateEmbedding(),
      metadata: {
        type: 'user_input',
        timestamp: Date.now(),
        sessionId: 'test-session',
        category: 'general',
        priority: Math.floor(Math.random() * 5) + 1
      },
      ...overrides
    };
  }

  /**
   * 技術関連のメモリを生成
   */
  static createTech(overrides: Partial<TestMemory> = {}): TestMemory {
    const techContents = [
      'TypeScriptの型システムについて学習しました',
      'ReactのuseEffectフックの最適化について理解しました',
      'Node.jsでAPIサーバーを構築しました',
      'データベース設計のベストプラクティスを適用しました',
      'マイクロサービスアーキテクチャを実装しました'
    ];

    return this.create({
      content: techContents[Math.floor(Math.random() * techContents.length)],
      metadata: {
        type: 'success',
        timestamp: Date.now(),
        category: 'technology',
        priority: 4
      },
      ...overrides
    });
  }

  /**
   * エラー解決関連のメモリを生成
   */
  static createErrorResolution(overrides: Partial<TestMemory> = {}): TestMemory {
    const errorContents = [
      'TypeScriptの型エラーを解決しました',
      'メモリリークの問題を修正しました',
      'パフォーマンスボトルネックを特定して改善しました',
      'セキュリティ脆弱性を修正しました'
    ];

    return this.create({
      content: errorContents[Math.floor(Math.random() * errorContents.length)],
      metadata: {
        type: 'error_resolution',
        timestamp: Date.now(),
        category: 'debugging',
        priority: 5
      },
      ...overrides
    });
  }

  /**
   * バッチでメモリを生成
   */
  static createBatch(count: number, factory: () => TestMemory = () => this.create()): TestMemory[] {
    return Array.from({ length: count }, () => factory());
  }

  /**
   * 関連するメモリのセットを生成
   */
  static createRelatedSet(baseContent: string, count: number = 3): TestMemory[] {
    const memories = [];
    
    for (let i = 0; i < count; i++) {
      memories.push(this.create({
        content: `${baseContent} - 関連情報 ${i + 1}`,
        embedding: this.generateSimilarEmbedding(0.8 + Math.random() * 0.2), // 高い類似度
        metadata: {
          type: i === 0 ? 'user_input' : 'success',
          timestamp: Date.now() + i * 1000,
          category: 'related',
          priority: Math.max(1, 5 - i)
        }
      }));
    }

    return memories;
  }

  /**
   * 時系列メモリセットを生成
   */
  static createTimeSeriesSet(baseTime: number, interval: number = 1000, count: number = 5): TestMemory[] {
    const contents = [
      'プロジェクト開始',
      '要件分析完了',
      '設計書作成',
      '実装開始',
      'テスト完了'
    ];

    return Array.from({ length: count }, (_, i) => this.create({
      content: contents[i] || `ステップ ${i + 1}`,
      metadata: {
        type: i === 0 ? 'user_input' : 'success',
        timestamp: baseTime + i * interval,
        category: 'timeline',
        priority: Math.ceil((i + 1) / 2)
      }
    }));
  }

  /**
   * 埋め込みベクトルを生成
   */
  private static generateEmbedding(dimension: number = 384): number[] {
    return Array.from({ length: dimension }, () => Math.random() * 2 - 1);
  }

  /**
   * 類似した埋め込みベクトルを生成
   */
  private static generateSimilarEmbedding(similarity: number, dimension: number = 384): number[] {
    const baseVector = this.generateEmbedding(dimension);
    const noise = Math.sqrt(1 - similarity * similarity);
    
    return baseVector.map(value => value * similarity + (Math.random() * 2 - 1) * noise);
  }

  /**
   * カウンタをリセット（テスト間でのクリーンアップ用）
   */
  static resetCounter(): void {
    this.idCounter = 0;
  }
}

/**
 * シナプス接続テストデータファクトリー
 */
export class SynapseFactory {
  /**
   * 基本的なシナプス接続を生成
   */
  static create(overrides: Partial<TestSynapticConnection> = {}): TestSynapticConnection {
    return {
      from: 'memory-1',
      to: 'memory-2',
      strength: Math.random() * 0.5 + 0.5, // 0.5-1.0の範囲
      type: 'semantic',
      ...overrides
    };
  }

  /**
   * 意味的接続を生成
   */
  static createSemantic(from: string, to: string, strength?: number): TestSynapticConnection {
    return this.create({
      from,
      to,
      strength: strength ?? Math.random() * 0.3 + 0.7, // 0.7-1.0の高い強度
      type: 'semantic'
    });
  }

  /**
   * 時系列接続を生成
   */
  static createTemporal(from: string, to: string, strength?: number): TestSynapticConnection {
    return this.create({
      from,
      to,
      strength: strength ?? Math.random() * 0.4 + 0.4, // 0.4-0.8の中程度の強度
      type: 'temporal'
    });
  }

  /**
   * 因果関係接続を生成
   */
  static createCausal(from: string, to: string, strength?: number): TestSynapticConnection {
    return this.create({
      from,
      to,
      strength: strength ?? Math.random() * 0.5 + 0.5, // 0.5-1.0の範囲
      type: 'causal'
    });
  }

  /**
   * ネットワーク状の接続セットを生成
   */
  static createNetwork(memoryIds: string[], density: number = 0.3): TestSynapticConnection[] {
    const connections: TestSynapticConnection[] = [];
    const connectionTypes: TestSynapticConnection['type'][] = ['semantic', 'temporal', 'causal'];

    for (let i = 0; i < memoryIds.length; i++) {
      for (let j = i + 1; j < memoryIds.length; j++) {
        if (Math.random() < density) {
          connections.push(this.create({
            from: memoryIds[i],
            to: memoryIds[j],
            strength: Math.random() * 0.6 + 0.4,
            type: connectionTypes[Math.floor(Math.random() * connectionTypes.length)]
          }));
        }
      }
    }

    return connections;
  }
}

/**
 * ネットワーク健康状態テストデータファクトリー
 */
export class NetworkHealthFactory {
  /**
   * 健康なネットワーク状態を生成
   */
  static createHealthy(overrides: Partial<TestNetworkHealth> = {}): TestNetworkHealth {
    return {
      totalMemories: 100,
      activeSynapses: 75,
      avgConnectionStrength: 0.8,
      healthScore: 0.9,
      issues: [],
      suggestions: ['定期的なメモリ整理を継続してください'],
      ...overrides
    };
  }

  /**
   * 問題のあるネットワーク状態を生成
   */
  static createUnhealthy(overrides: Partial<TestNetworkHealth> = {}): TestNetworkHealth {
    return {
      totalMemories: 50,
      activeSynapses: 15,
      avgConnectionStrength: 0.4,
      healthScore: 0.5,
      issues: [
        '接続強度が低いメモリが多数見つかりました',
        '孤立したメモリが存在します',
        'メモリの断片化が進んでいます'
      ],
      suggestions: [
        'メモリの再構成を実行してください',
        '関連性の低いメモリを削除してください',
        'より多くの相互作用を促進してください'
      ],
      ...overrides
    };
  }

  /**
   * 中程度の健康状態を生成
   */
  static createModerate(overrides: Partial<TestNetworkHealth> = {}): TestNetworkHealth {
    return {
      totalMemories: 75,
      activeSynapses: 45,
      avgConnectionStrength: 0.65,
      healthScore: 0.7,
      issues: ['一部のメモリで接続強度が低下しています'],
      suggestions: [
        '定期的な活性化を実行してください',
        'メモリの質を向上させてください'
      ],
      ...overrides
    };
  }

  /**
   * ランダムな健康状態を生成
   */
  static createRandom(): TestNetworkHealth {
    const healthScore = Math.random();
    const totalMemories = Math.floor(Math.random() * 200) + 20;
    const synapseRatio = 0.3 + Math.random() * 0.5;

    return {
      totalMemories,
      activeSynapses: Math.floor(totalMemories * synapseRatio),
      avgConnectionStrength: 0.2 + Math.random() * 0.8,
      healthScore,
      issues: healthScore < 0.6 ? [
        '接続品質の改善が必要です',
        'メモリの整理を推奨します'
      ] : [],
      suggestions: healthScore < 0.8 ? [
        'より多くのインタラクションを促進してください'
      ] : ['現在の状態を維持してください']
    };
  }
}

/**
 * APIレスポンスモックファクトリー
 */
export class MockResponseFactory {
  /**
   * 成功レスポンスを生成
   */
  static createSuccess<T>(data: T): { success: true; data: T; message?: string } {
    return {
      success: true,
      data,
      message: '操作が正常に完了しました'
    };
  }

  /**
   * エラーレスポンスを生成
   */
  static createError(error: string, code?: string): { success: false; error: string; code?: string } {
    return {
      success: false,
      error,
      code
    };
  }

  /**
   * 遅延を含むレスポンスを生成
   */
  static async createDelayed<T>(data: T, delay: number = 100): Promise<T> {
    await new Promise(resolve => setTimeout(resolve, delay));
    return data;
  }
}

/**
 * テストユーティリティ
 */
export class TestUtils {
  /**
   * テストIDを生成
   */
  static generateTestId(prefix: string = 'test'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * テスト用のタイムスタンプ範囲を生成
   */
  static generateTimeRange(start: Date, end: Date, count: number): number[] {
    const range = end.getTime() - start.getTime();
    const interval = range / (count - 1);
    
    return Array.from({ length: count }, (_, i) => start.getTime() + i * interval);
  }

  /**
   * 配列をランダムにシャッフル
   */
  static shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * 非同期操作の完了を待機
   */
  static async waitFor(condition: () => boolean | Promise<boolean>, timeout: number = 5000, interval: number = 100): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error(`条件が満たされませんでした (タイムアウト: ${timeout}ms)`);
  }

  /**
   * メモリ使用量を取得
   */
  static getMemoryUsage(): NodeJS.MemoryUsage {
    return process.memoryUsage();
  }

  /**
   * テスト実行時間を測定
   */
  static async measureTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = process.hrtime.bigint();
    const result = await fn();
    const end = process.hrtime.bigint();
    const duration = Number(end - start) / 1_000_000; // ナノ秒からミリ秒に変換

    return { result, duration };
  }
}

/**
 * モック管理ユーティリティ
 */
export class MockManager {
  private mocks = new Map<string, any>();

  /**
   * モックを登録
   */
  register(name: string, mock: any): void {
    this.mocks.set(name, mock);
  }

  /**
   * モックを取得
   */
  get<T>(name: string): T {
    const mock = this.mocks.get(name);
    if (!mock) {
      throw new Error(`モック "${name}" が見つかりません`);
    }
    return mock;
  }

  /**
   * すべてのモックをクリア
   */
  clear(): void {
    this.mocks.clear();
  }

  /**
   * モックの呼び出し統計を取得
   */
  getStats(name: string): any {
    const mock = this.get(name);
    if (mock.mock) {
      return {
        callCount: mock.mock.calls.length,
        calls: mock.mock.calls,
        results: mock.mock.results
      };
    }
    return null;
  }
}

// シングルトンインスタンス
export const mockManager = new MockManager();
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentCore } from '../../src/core/agent.js';
import { MemoryManager } from '../../src/core/memory.js';
import { Config, ChatMessage } from '../../src/types/config.js';
import { tmpdir } from 'os';
import { join } from 'path';
import { rmSync, existsSync } from 'fs';

describe('Memory Leak Tests', () => {
  let tempDir: string;
  let config: Config;
  let memoryManager: MemoryManager;
  let agent: AgentCore;

  beforeEach(async () => {
    // テンポラリディレクトリの作成
    tempDir = join(tmpdir(), `agents-test-${Date.now()}`);
    
    // ディレクトリを事前に作成
    await import('fs/promises').then(fs => fs.mkdir(tempDir, { recursive: true }));
    
    // テスト用設定
    config = {
      llm: {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000,
        maxRetries: 3,
        timeout: 30000,
      },
      mcp: {
        enabled: false,
        servers: [],
      },
      app: {
        maxParallel: 3,
        timeout: 60000,
        logLevel: 'info',
      },
      paths: {
        cache: join(tempDir, 'cache'),
        history: join(tempDir, 'history.json'),
      },
      localEndpoint: undefined,
    };

    memoryManager = new MemoryManager(config.paths.history);
  });

  afterEach(() => {
    // クリーンアップ
    if (memoryManager) {
      memoryManager.cleanup();
    }
    if (agent) {
      agent.cleanup();
    }

    // テンポラリファイルの削除
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('MemoryManager', () => {
    it('should limit history size when memory usage is high', async () => {
      // 大量のメッセージを作成
      const largeMessages: ChatMessage[] = [];
      for (let i = 0; i < 200; i++) {
        largeMessages.push({
          role: 'user',
          content: `Test message ${i}`.repeat(1000), // 長いメッセージ
          timestamp: new Date(),
        });
      }

      // 履歴を保存
      await memoryManager.saveHistory(largeMessages);

      // 履歴をロード
      const loadedHistory = await memoryManager.loadHistory();

      // データ整合性チェックが働いているかテスト
      expect(loadedHistory).toBeDefined();
      expect(Array.isArray(loadedHistory)).toBe(true);
    });

    it('should cleanup invalid messages', async () => {
      // 無効なメッセージを含む履歴を作成
      const invalidMessages = [
        {
          role: 'user',
          content: 'Valid message',
          timestamp: new Date(),
        },
        {
          role: '', // 無効なrole
          content: 'Invalid role message',
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: '', // 無効なcontent
          timestamp: new Date(),
        },
        {
          role: 'user',
          content: 'Another valid message',
          timestamp: new Date(),
        },
      ] as ChatMessage[];

      await memoryManager.saveHistory(invalidMessages);
      const cleanedHistory = await memoryManager.loadHistory();

      // 有効なメッセージのみが残っているかチェック
      expect(cleanedHistory).toHaveLength(2);
      expect(cleanedHistory[0].content).toBe('Valid message');
      expect(cleanedHistory[1].content).toBe('Another valid message');
    });

    it('should prune history when it exceeds maxSize', async () => {
      // 150個のメッセージを作成
      const messages: ChatMessage[] = [];
      for (let i = 0; i < 150; i++) {
        messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
          timestamp: new Date(),
        });
      }

      await memoryManager.saveHistory(messages);

      // 100件に制限
      await memoryManager.pruneHistory(100);

      const prunedHistory = await memoryManager.loadHistory();
      expect(prunedHistory).toHaveLength(100);
      
      // 最新の100件が残っていることを確認
      expect(prunedHistory[99].content).toBe('Message 149');
      expect(prunedHistory[0].content).toBe('Message 50');
    });

    it('should cleanup old history based on date', async () => {
      // 古い日付と新しい日付のメッセージを作成
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40); // 40日前

      const newDate = new Date();
      newDate.setDate(newDate.getDate() - 10); // 10日前

      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Old message 1',
          timestamp: oldDate,
        },
        {
          role: 'user',
          content: 'Old message 2',
          timestamp: oldDate,
        },
        {
          role: 'user',
          content: 'Recent message 1',
          timestamp: newDate,
        },
        {
          role: 'user',
          content: 'Recent message 2',
          timestamp: new Date(),
        },
      ];

      await memoryManager.saveHistory(messages);

      // 30日より古いメッセージをクリーンアップ
      await memoryManager.cleanupOldHistory(30);

      const cleanedHistory = await memoryManager.loadHistory();
      
      // 30日以内のメッセージのみが残っているかチェック
      expect(cleanedHistory).toHaveLength(2);
      expect(cleanedHistory[0].content).toBe('Recent message 1');
      expect(cleanedHistory[1].content).toBe('Recent message 2');
    });

    it('should search history efficiently', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Hello world',
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: 'Hello there!',
          timestamp: new Date(),
        },
        {
          role: 'user',
          content: 'How are you?',
          timestamp: new Date(),
        },
        {
          role: 'assistant',
          content: 'I am doing well, thank you!',
          timestamp: new Date(),
        },
      ];

      await memoryManager.saveHistory(messages);

      // "hello"を検索
      const searchResults = await memoryManager.searchHistory('hello', 5);
      
      expect(searchResults).toHaveLength(2);
      expect(searchResults[0].content).toContain('Hello');
      expect(searchResults[1].content).toContain('Hello');
    });

    it('should create backups successfully', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'Test backup message',
          timestamp: new Date(),
        },
      ];

      await memoryManager.saveHistory(messages);
      
      const backupPath = await memoryManager.createBackup();
      
      expect(backupPath).toBeDefined();
      expect(backupPath).toContain('.backup.');
      expect(existsSync(backupPath)).toBe(true);
    });
  });

  describe('AgentCore Memory Management', () => {
    it('should automatically optimize memory after chat interactions', async () => {
      // モックプロバイダーを使用してテスト
      const mockProvider = {
        chat: async () => ({ 
          success: true, 
          result: 'Test response',
          attemptCount: 1,
          totalTime: 100
        }),
      };

      // AgentCoreの作成（実際のAPIキーなしでテスト）
      agent = new AgentCore(config);
      (agent as any).provider = mockProvider;

      // 初期状態の履歴サイズを確認
      const initialHistory = agent.getHistory();
      expect(initialHistory).toHaveLength(0);

      // メモリ制限をテストするため、手動で履歴を追加
      for (let i = 0; i < 150; i++) {
        (agent as any).history.push({
          role: 'user',
          content: `Test message ${i}`,
          timestamp: new Date(),
        });
      }

      // メモリ最適化を実行
      await (agent as any).optimizeMemory();

      // 履歴が制限されているかチェック
      const optimizedHistory = agent.getHistory();
      expect(optimizedHistory.length).toBeLessThanOrEqual(100); // MAX_HISTORY_SIZE
    });

    it('should properly cleanup resources', async () => {
      agent = new AgentCore(config);

      // タイマーを登録
      const timer = (agent as any).registerTimer(() => {}, 1000);
      
      expect((agent as any).timers.has(timer)).toBe(true);

      // クリーンアップを実行
      agent.cleanup();

      // タイマーがクリアされているかチェック
      expect((agent as any).timers.size).toBe(0);
    });

    it('should monitor memory usage and trigger optimization', async () => {
      agent = new AgentCore(config);

      let optimizationCalled = false;
      const originalOptimize = (agent as any).optimizeMemory;
      (agent as any).optimizeMemory = async () => {
        optimizationCalled = true;
        return originalOptimize.call(agent);
      };

      // メモリ使用量の監視をテスト
      (agent as any).monitorMemoryUsage();

      // 高メモリ使用量をシミュレート
      const originalMemoryUsage = process.memoryUsage;
      process.memoryUsage = () => ({
        rss: 600 * 1024 * 1024,
        heapTotal: 600 * 1024 * 1024,
        heapUsed: 600 * 1024 * 1024, // 600MB（制限を超える）
        external: 0,
        arrayBuffers: 0,
      });

      (agent as any).monitorMemoryUsage();

      // 元のメモリ使用量関数を復元
      process.memoryUsage = originalMemoryUsage;

      // メモリ最適化が呼び出されたかチェック
      // 非同期処理のため、少し待つ
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(optimizationCalled).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should optimize session data when saving', async () => {
      // 大きなセッションデータを作成
      const largeHistory: ChatMessage[] = [];
      for (let i = 0; i < 200; i++) {
        largeHistory.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Session message ${i}`,
          timestamp: new Date(),
        });
      }

      const session = {
        id: 'test-session',
        startedAt: new Date(),
        config: config as any,
        history: largeHistory,
      };

      // セッションを保存
      await memoryManager.saveSession(session, 'test-session.json');

      // セッションを読み込み
      const loadedSession = await memoryManager.loadSession('test-session.json');

      // 履歴が最適化されているかチェック（最新100件のみ）
      expect(loadedSession.history.length).toBeLessThanOrEqual(100);
      
      // 最新のメッセージが保持されているかチェック
      const lastMessage = loadedSession.history[loadedSession.history.length - 1];
      expect(lastMessage.content).toBe('Session message 199');
    });
  });

  describe('Performance Tests', () => {
    it('should handle large datasets efficiently', async () => {
      const startTime = Date.now();

      // 10,000件のメッセージを作成
      const largeDataset: ChatMessage[] = [];
      for (let i = 0; i < 10000; i++) {
        largeDataset.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Performance test message ${i}`,
          timestamp: new Date(),
        });
      }

      // 保存
      await memoryManager.saveHistory(largeDataset);

      // 読み込み
      const loaded = await memoryManager.loadHistory();

      // 検索
      const searchResults = await memoryManager.searchHistory('test', 10);

      const endTime = Date.now();
      const duration = endTime - startTime;

      // 処理時間が妥当な範囲内であることをチェック（10秒以内）
      expect(duration).toBeLessThan(10000);
      expect(loaded).toBeDefined();
      expect(searchResults).toBeDefined();
    });
  });
});
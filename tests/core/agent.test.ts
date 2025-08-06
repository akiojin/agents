import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentCore } from '../../src/core/agent';
import { createProvider } from '../../src/providers/factory';
import { TaskExecutor } from '../../src/core/task-executor';
import { MemoryManager } from '../../src/core/memory';
import type { Config } from '../../src/types/config';

// モックの設定
vi.mock('../../src/providers/factory');
vi.mock('../../src/core/task-executor');
vi.mock('../../src/core/memory');
vi.mock('../../src/utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
  },
  PerformanceLogger: vi.fn().mockImplementation(() => ({
    end: vi.fn(),
  })),
}));

describe('AgentCore', () => {
  let agent: AgentCore;
  let mockConfig: Config;
  let mockProvider: any;
  let mockTaskExecutor: any;
  let mockMemoryManager: any;

  beforeEach(() => {
    mockConfig = {
      provider: 'openai',
      apiKey: 'test-key',
      useMCP: true,
      maxParallel: 5,
      timeout: 300,
      logLevel: 'info',
      cachePath: '.cache',
      historyPath: '.history',
    };

    mockProvider = {
      chat: vi.fn().mockResolvedValue('テスト応答'),
      complete: vi.fn().mockResolvedValue('完了'),
    };

    mockTaskExecutor = {
      execute: vi.fn().mockResolvedValue({
        success: true,
        message: 'タスク完了',
      }),
      setParallelMode: vi.fn(),
    };

    mockMemoryManager = {
      loadHistory: vi.fn().mockResolvedValue([]),
      saveHistory: vi.fn().mockResolvedValue(undefined),
      saveSession: vi.fn().mockResolvedValue(undefined),
      loadSession: vi.fn().mockResolvedValue({
        id: 'test-session',
        startedAt: new Date(),
        config: mockConfig,
        history: [],
      }),
    };

    vi.mocked(createProvider).mockReturnValue(mockProvider);
    vi.mocked(TaskExecutor).mockImplementation(() => mockTaskExecutor);
    vi.mocked(MemoryManager).mockImplementation(() => mockMemoryManager);

    agent = new AgentCore(mockConfig);
  });

  describe('chat', () => {
    it('ユーザー入力に対して応答を返す', async () => {
      const input = 'こんにちは';
      const response = await agent.chat(input);

      expect(response).toBe('テスト応答');
      expect(mockProvider.chat).toHaveBeenCalled();
      expect(mockMemoryManager.saveHistory).toHaveBeenCalled();
    });

    it('履歴にメッセージを追加する', async () => {
      await agent.chat('テストメッセージ');
      const history = agent.getHistory();

      expect(history).toHaveLength(2); // ユーザーとアシスタント
      expect(history[0].role).toBe('user');
      expect(history[0].content).toBe('テストメッセージ');
      expect(history[1].role).toBe('assistant');
    });
  });

  describe('executeTask', () => {
    it('タスクを実行して結果を返す', async () => {
      const taskConfig = {
        description: 'テストタスク',
        files: ['test.ts'],
        parallel: true,
      };

      const result = await agent.executeTask(taskConfig);

      expect(result.success).toBe(true);
      expect(result.message).toBe('タスク完了');
      expect(mockTaskExecutor.execute).toHaveBeenCalledWith(taskConfig, mockProvider);
    });

    it('エラー時にエラー結果を返す', async () => {
      mockTaskExecutor.execute.mockRejectedValue(new Error('実行エラー'));

      const result = await agent.executeTask({
        description: 'エラータスク',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('タスク実行エラー');
    });
  });

  describe('モデル管理', () => {
    it('現在のモデルを取得できる', () => {
      const model = agent.getCurrentModel();
      expect(model).toBe('gpt-4-turbo-preview');
    });

    it('モデルを変更できる', () => {
      agent.setModel('gpt-3.5-turbo');
      expect(agent.getCurrentModel()).toBe('gpt-3.5-turbo');
    });
  });

  describe('モード切り替え', () => {
    it('並列モードを切り替えできる', () => {
      const isParallel = agent.toggleParallelMode();
      expect(isParallel).toBe(true);
      expect(mockTaskExecutor.setParallelMode).toHaveBeenCalledWith(true);

      const isNotParallel = agent.toggleParallelMode();
      expect(isNotParallel).toBe(false);
      expect(mockTaskExecutor.setParallelMode).toHaveBeenCalledWith(false);
    });

    it('詳細モードを切り替えできる', () => {
      const isVerbose = agent.toggleVerboseMode();
      expect(isVerbose).toBe(true);

      const isNotVerbose = agent.toggleVerboseMode();
      expect(isNotVerbose).toBe(false);
    });
  });

  describe('セッション管理', () => {
    it('セッションを保存できる', async () => {
      await agent.saveSession('test-session.json');
      expect(mockMemoryManager.saveSession).toHaveBeenCalled();
    });

    it('セッションを読み込みできる', async () => {
      await agent.loadSession('test-session.json');
      expect(mockMemoryManager.loadSession).toHaveBeenCalledWith('test-session.json');
    });

    it('履歴をクリアできる', () => {
      agent.clearHistory();
      const history = agent.getHistory();
      expect(history).toHaveLength(0);
    });
  });
});

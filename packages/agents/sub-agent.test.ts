import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { SubAgent, SubAgentManager, SubAgentContext } from './sub-agent';
import type { LLMProvider } from '../../src/providers/base';

// Mock provider for testing
const createMockProvider = (response: string = 'Test response') => ({
  chat: mock(async () => response),
  complete: mock(async () => response),
  listModels: mock(async () => ['test-model']),
  validateConnection: mock(async () => true),
  getName: () => 'mock-provider',
  isAvailable: mock(async () => true),
} as unknown as LLMProvider);

describe('SubAgent', () => {
  let subAgent: SubAgent;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    mockProvider = createMockProvider();
    subAgent = new SubAgent('test-agent', 'general-purpose', mockProvider);
  });

  describe('execute', () => {
    it('基本的なタスクを実行できる', async () => {
      const result = await subAgent.execute(
        'Test task description',
        { key: 'value' }
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.agentType).toBe('general-purpose');
      expect(mockProvider.chat).toHaveBeenCalled();
    });

    it('エラーをキャッチして適切に処理する', async () => {
      // エラーを発生させるモックプロバイダー
      const errorProvider = createMockProvider();
      errorProvider.chat = mock(async () => {
        throw new Error('API Error');
      });
      
      const errorAgent = new SubAgent('error-agent', 'general-purpose', errorProvider);
      
      const result = await errorAgent.execute(
        'Test task',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.response).toContain('Error');
    });

    it('コンテキストをタスクに含める', async () => {
      const context = {
        previousResult: 'Previous task output',
        data: { key: 'value' },
      };

      await subAgent.execute('Task with context', context);

      // chatメソッドが呼ばれた際の引数を確認
      expect(mockProvider.chat).toHaveBeenCalled();
      const chatCall = (mockProvider.chat as any).mock.calls[0];
      const messages = chatCall[0];
      
      // コンテキストがメッセージに含まれているか確認
      const userMessage = messages.find((m: any) => m.role === 'user');
      expect(userMessage).toBeDefined();
      expect(userMessage.content).toContain('Task with context');
    });

    it('実行時間を計測する', async () => {
      const result = await subAgent.execute('Quick task', {});

      expect(result.metadata?.duration).toBeDefined();
      expect(typeof result.metadata?.duration).toBe('number');
      expect(result.metadata?.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getAgentInfo', () => {
    it('エージェント情報を返す', () => {
      const info = subAgent.getAgentInfo();

      expect(info.id).toBe('test-agent');
      expect(info.type).toBe('general-purpose');
      expect(info.status).toBe('idle');
    });

    it('タスク実行中はbusy状態になる', async () => {
      // 遅延を持つモックプロバイダー
      const delayProvider = createMockProvider();
      delayProvider.chat = mock(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'Response';
      });
      
      const agent = new SubAgent('busy-agent', 'general-purpose', delayProvider);
      
      // タスクを開始（awaitしない）
      const executePromise = agent.execute('Long task', {});
      
      // すぐにステータスを確認
      await new Promise(resolve => setTimeout(resolve, 10));
      const info = agent.getAgentInfo();
      expect(info.status).toBe('busy');
      
      // タスク完了を待つ
      await executePromise;
      
      // タスク完了後はidleに戻る
      const finalInfo = agent.getAgentInfo();
      expect(finalInfo.status).toBe('idle');
    });
  });
});

describe('SubAgentManager', () => {
  let manager: SubAgentManager;
  let mockProvider: LLMProvider;

  beforeEach(() => {
    mockProvider = createMockProvider();
    manager = new SubAgentManager(mockProvider);
  });

  describe('executeTask', () => {
    it('サブエージェントでタスクを実行できる', async () => {
      const result = await manager.executeTask(
        'general-purpose',
        'Test task',
        { data: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.response).toBeDefined();
      expect(result.metadata?.agentType).toBe('general-purpose');
    });

    it('サポートされていないエージェントタイプでエラーを返す', async () => {
      const result = await manager.executeTask(
        'unsupported-type' as any,
        'Test task',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.response).toContain('not found');
    });

    it('エージェントを再利用する', async () => {
      // 最初のタスク
      const result1 = await manager.executeTask(
        'general-purpose',
        'Task 1',
        {}
      );

      // 2番目のタスク（同じエージェントタイプ）
      const result2 = await manager.executeTask(
        'general-purpose',
        'Task 2',
        {}
      );

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // 同じエージェントIDが使用されているか確認
      expect(result1.metadata?.agentId).toBe(result2.metadata?.agentId);
    });
  });

  describe('getAgentStatus', () => {
    it('エージェントのステータスを取得できる', async () => {
      // エージェントを作成
      await manager.executeTask('general-purpose', 'Task', {});
      
      const agents = manager.getAllAgents();
      expect(agents.length).toBe(1);
      
      const agentId = agents[0].id;
      const status = manager.getAgentStatus(agentId);
      
      expect(status).toBeDefined();
      expect(status?.type).toBe('general-purpose');
      expect(status?.status).toBe('idle');
    });

    it('存在しないエージェントの場合undefinedを返す', () => {
      const status = manager.getAgentStatus('non-existent');
      expect(status).toBeUndefined();
    });
  });

  describe('getAllAgents', () => {
    it('すべてのエージェント情報を取得できる', async () => {
      // 複数のエージェントを作成
      await manager.executeTask('general-purpose', 'Task 1', {});
      
      const agents = manager.getAllAgents();
      
      expect(agents.length).toBeGreaterThan(0);
      expect(agents[0]).toHaveProperty('id');
      expect(agents[0]).toHaveProperty('type');
      expect(agents[0]).toHaveProperty('status');
    });
  });

  describe('clearAgents', () => {
    it('general-purpose以外のエージェントをクリアできる', async () => {
      // エージェントを作成
      await manager.executeTask('general-purpose', 'Task', {});
      
      expect(manager.getAllAgents().length).toBeGreaterThan(0);
      
      // クリア (general-purposeは保持される)
      manager.clearAgents();
      
      // general-purpose エージェントのみが残る
      expect(manager.getAllAgents().length).toBe(1);
      expect(manager.getAllAgents()[0].type).toBe('general-purpose');
    });
  });
});
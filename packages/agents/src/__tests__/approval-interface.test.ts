/**
 * 承認インターフェースのテスト
 */

import { ApprovalInterface, ApprovalChoice } from '../approval-interface';
import { ExecutionPlan, Requirements, WorkflowState } from '../workflow-orchestrator';
import * as readline from 'readline';

// readlineのモック
jest.mock('readline');

describe('ApprovalInterface', () => {
  let approvalInterface: ApprovalInterface;
  let mockReadline: jest.Mocked<readline.Interface>;
  
  // テスト用の実行計画
  const mockPlan: ExecutionPlan = {
    id: 'plan-123',
    requestId: 'req-456',
    requirements: {
      functionalRequirements: ['機能A', '機能B'],
      nonFunctionalRequirements: ['パフォーマンス', 'セキュリティ'],
      constraints: ['制約1'],
      successCriteria: ['基準1', '基準2'],
      estimatedComplexity: 'medium'
    } as Requirements,
    tasks: [
      { id: 'task-1', description: 'タスク1', type: 'frontend' },
      { id: 'task-2', description: 'タスク2', type: 'backend' }
    ],
    executionGroups: [
      {
        canRunInParallel: true,
        tasks: [
          {
            taskId: 'task-1',
            task: { id: 'task-1', description: 'タスク1', type: 'frontend' },
            agent: { name: 'frontend-agent', type: 'frontend', prompt: '' },
            confidence: 0.9
          }
        ]
      }
    ],
    estimatedDuration: 30,
    approvalRequired: true,
    createdAt: new Date()
  };

  beforeEach(() => {
    // readlineのモックをセットアップ
    mockReadline = {
      question: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      write: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn()
    } as any;
    
    (readline.createInterface as jest.Mock).mockReturnValue(mockReadline);
    
    approvalInterface = new ApprovalInterface();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestApproval', () => {
    it('承認選択でApproveを返す', async () => {
      // ユーザー入力をシミュレート
      mockReadline.question.mockImplementationOnce((prompt, callback) => {
        callback('A');
      });

      const result = await approvalInterface.requestApproval(mockPlan);

      expect(result.choice).toBe(ApprovalChoice.APPROVE);
      expect(mockReadline.question).toHaveBeenCalled();
    });

    it('拒否選択でRejectと理由を返す', async () => {
      // 最初の質問で'R'、次に理由を入力
      mockReadline.question
        .mockImplementationOnce((prompt, callback) => callback('R'))
        .mockImplementationOnce((prompt, callback) => callback('要件が不明確'));

      const result = await approvalInterface.requestApproval(mockPlan);

      expect(result.choice).toBe(ApprovalChoice.REJECT);
      expect(result.reason).toBe('要件が不明確');
      expect(mockReadline.question).toHaveBeenCalledTimes(2);
    });

    it('詳細表示後に承認できる', async () => {
      // 最初に'D'で詳細表示、次に'A'で承認
      mockReadline.question
        .mockImplementationOnce((prompt, callback) => callback('D'))
        .mockImplementationOnce((prompt, callback) => callback('A'));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await approvalInterface.requestApproval(mockPlan);

      expect(result.choice).toBe(ApprovalChoice.APPROVE);
      expect(mockReadline.question).toHaveBeenCalledTimes(2);
      
      // 詳細が表示されたことを確認
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('実行計画詳細'));
      
      consoleSpy.mockRestore();
    });

    it('無効な入力後に再度選択を求める', async () => {
      // 最初に無効な入力、次に有効な'A'
      mockReadline.question
        .mockImplementationOnce((prompt, callback) => callback('X'))
        .mockImplementationOnce((prompt, callback) => callback('A'));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      const result = await approvalInterface.requestApproval(mockPlan);

      expect(result.choice).toBe(ApprovalChoice.APPROVE);
      expect(mockReadline.question).toHaveBeenCalledTimes(2);
      
      // 警告メッセージが表示されたことを確認
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('無効な選択'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('displayExecutionSummary', () => {
    it('成功時のサマリーを表示', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      approvalInterface.displayExecutionSummary(
        true,
        '5個成功, 0個失敗',
        30000
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('✅ 実行完了'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('5個成功, 0個失敗'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('30.00秒'));
      
      consoleSpy.mockRestore();
    });

    it('失敗時のサマリーを表示', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      approvalInterface.displayExecutionSummary(
        false,
        '3個成功, 2個失敗',
        15000
      );

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('❌ 実行失敗'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3個成功, 2個失敗'));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('15.00秒'));
      
      consoleSpy.mockRestore();
    });
  });

  describe('close', () => {
    it('readlineインターフェースを閉じる', () => {
      approvalInterface.close();
      expect(mockReadline.close).toHaveBeenCalled();
    });
  });
});
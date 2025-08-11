/**
 * マルチエージェント統合システムの統合テスト
 */

import { WorkflowOrchestrator, UserRequest, WorkflowState } from '../workflow-orchestrator';
import { AgentPromptLoader } from '../agent-prompt-loader';
import { TaskAgentMatcher } from '../task-agent-matcher';
import { SubAgentManager } from '../../sub-agent';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// モジュールのモック
jest.mock('fs');
jest.mock('os');
jest.mock('../../core/src/providers/gemini-adapter-provider');

describe('Multi-Agent Coordination System Integration Tests', () => {
  let orchestrator: WorkflowOrchestrator;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockOs = os as jest.Mocked<typeof os>;

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();
    
    // ホームディレクトリのモック
    mockOs.homedir.mockReturnValue('/home/user');
    
    // ファイルシステムのモック設定
    mockFs.existsSync.mockImplementation((path: any) => {
      const pathStr = path.toString();
      if (pathStr.includes('.git')) return true;
      if (pathStr.includes('presets')) return true;
      return false;
    });
    
    // プリセットファイルのモック
    const mockPresets = [
      'frontend-developer.md',
      'backend-architect.md',
      'test-automator.md',
      'general-purpose.md',
      'unity-developer.md',
      'unreal-developer.md'
    ];
    
    mockFs.readdirSync.mockImplementation((path: any) => {
      const pathStr = path.toString();
      if (pathStr.includes('presets')) {
        return mockPresets;
      }
      return [];
    });
    
    // プリセット内容のモック
    mockFs.readFileSync.mockImplementation((path: any) => {
      const pathStr = path.toString();
      
      if (pathStr.includes('frontend-developer.md')) {
        return `---
name: frontend-developer
description: Build React components and responsive layouts
model: claude-sonnet-4-20250514
---
You are a frontend developer specialist.`;
      }
      
      if (pathStr.includes('backend-architect.md')) {
        return `---
name: backend-architect
description: Design RESTful APIs and database schemas
model: claude-sonnet-4-20250514
---
You are a backend architect specialist.`;
      }
      
      if (pathStr.includes('test-automator.md')) {
        return `---
name: test-automator
description: Create comprehensive test suites
model: claude-sonnet-4-20250514
---
You are a test automation specialist.`;
      }
      
      if (pathStr.includes('unity-developer.md')) {
        return `---
name: unity-developer
description: Unity game development with C# and optimization
model: claude-sonnet-4-20250514
---
You are a Unity development specialist.`;
      }
      
      if (pathStr.includes('unreal-developer.md')) {
        return `---
name: unreal-developer
description: Unreal Engine development with C++ and Blueprint
model: claude-sonnet-4-20250514
---
You are an Unreal Engine specialist.`;
      }
      
      return `---
name: general-purpose
description: General purpose agent
---
You are a general purpose assistant.`;
    });
    
    // シングルトンをリセット
    (WorkflowOrchestrator as any).instance = undefined;
    (AgentPromptLoader as any).instance = undefined;
    (TaskAgentMatcher as any).instance = undefined;
    
    orchestrator = WorkflowOrchestrator.getInstance();
  });

  describe('End-to-End Workflow', () => {
    it('シンプルなユーザーリクエストを処理できる', async () => {
      const request: UserRequest = {
        id: 'req-001',
        description: 'Reactコンポーネントを作成してテストを書いてください',
        timestamp: new Date()
      };

      // 要件分析
      const requirements = await orchestrator.analyzeRequest(request);
      expect(requirements).toBeDefined();
      expect(requirements.functionalRequirements).toContain('新規作成機能の実装');
      expect(requirements.functionalRequirements).toContain('テストの作成と実行');

      // 実行計画作成
      const plan = await orchestrator.createExecutionPlan(request, requirements);
      expect(plan).toBeDefined();
      expect(plan.tasks.length).toBeGreaterThan(0);
      expect(plan.executionGroups.length).toBeGreaterThan(0);
    });

    it('複雑なマルチタスクリクエストを処理できる', async () => {
      const request: UserRequest = {
        id: 'req-002',
        description: 'フロントエンドUIを作成し、バックエンドAPIを設計し、パフォーマンスを最適化し、包括的なテストを作成してください',
        constraints: ['TypeScriptを使用', 'RESTful API設計'],
        priority: 8,
        timestamp: new Date()
      };

      const requirements = await orchestrator.analyzeRequest(request);
      
      // 複数の要件が抽出されることを確認
      expect(requirements.functionalRequirements.length).toBeGreaterThan(2);
      expect(requirements.nonFunctionalRequirements).toContain('パフォーマンス最適化');
      expect(requirements.constraints).toContain('TypeScriptを使用');
    });

    it('ゲーム開発タスクに適切なエージェントを選択する', async () => {
      const request: UserRequest = {
        id: 'req-003',
        description: 'Unity 6.1でVContainerを使用してプレイヤーコントローラーを実装',
        timestamp: new Date()
      };

      const requirements = await orchestrator.analyzeRequest(request);
      const plan = await orchestrator.createExecutionPlan(request, requirements);
      
      // Unity専門エージェントが選択されることを確認
      const hasUnityAgent = plan.executionGroups.some(group =>
        group.tasks.some(task => task.agent.name === 'unity-developer')
      );
      
      expect(hasUnityAgent).toBe(true);
    });
  });

  describe('Agent Prompt Loader', () => {
    it('プリセットを正しく読み込む', () => {
      const loader = AgentPromptLoader.getInstance();
      loader.loadAllPresets();
      
      const presets = loader.getAllPresets();
      expect(presets.size).toBeGreaterThan(0);
      
      const unityPreset = loader.getPreset('unity-developer');
      expect(unityPreset).toBeDefined();
      expect(unityPreset?.description).toContain('Unity');
      expect(unityPreset?.model).toBe('claude-sonnet-4-20250514');
    });

    it('エージェント名のリストを取得できる', () => {
      const loader = AgentPromptLoader.getInstance();
      const names = loader.getPresetNames();
      
      expect(names).toContain('frontend-developer');
      expect(names).toContain('backend-architect');
      expect(names).toContain('unity-developer');
      expect(names).toContain('unreal-developer');
    });
  });

  describe('Task Agent Matcher', () => {
    it('並列実行可能なタスクを適切にグループ化する', () => {
      const matcher = TaskAgentMatcher.getInstance();
      
      const tasks = [
        { id: '1', description: 'Build React component' },
        { id: '2', description: 'Design API endpoints' },
        { id: '3', description: 'Write unit tests', dependencies: ['1', '2'] }
      ];
      
      const groups = matcher.groupTasksForParallelExecution(tasks);
      
      // 最初のグループは並列実行可能
      expect(groups[0].canRunInParallel).toBe(true);
      expect(groups[0].tasks.length).toBe(2);
      
      // テストタスクは依存関係があるため別グループ
      const testGroup = groups.find(g => 
        g.tasks.some(t => t.taskId === '3')
      );
      expect(testGroup).toBeDefined();
      expect(testGroup?.dependencies?.length).toBeGreaterThan(0);
    });

    it('ゲーム開発タスクに適切なエージェントをマッチングする', () => {
      const matcher = TaskAgentMatcher.getInstance();
      
      const unityTask = {
        id: 'unity-1',
        description: 'Implement player controller in Unity with VContainer'
      };
      
      const unrealTask = {
        id: 'unreal-1',
        description: 'Create Blueprint for character movement in Unreal Engine 5'
      };
      
      const unityMatch = matcher.matchTask(unityTask);
      const unrealMatch = matcher.matchTask(unrealTask);
      
      expect(unityMatch.agent.name).toBe('unity-developer');
      expect(unrealMatch.agent.name).toBe('unreal-developer');
    });
  });

  describe('Workflow State Management', () => {
    it('状態遷移が正しく動作する', async () => {
      expect(orchestrator.getState()).toBe(WorkflowState.IDLE);
      
      const request: UserRequest = {
        id: 'req-004',
        description: 'Simple task',
        timestamp: new Date()
      };
      
      // 分析フェーズ
      await orchestrator.analyzeRequest(request);
      
      // 計画フェーズ
      const requirements = await orchestrator.analyzeRequest(request);
      await orchestrator.createExecutionPlan(request, requirements);
      
      // 状態を確認（複雑度によって承認待ちまたはアイドル）
      const state = orchestrator.getState();
      expect([WorkflowState.AWAITING_APPROVAL, WorkflowState.PLANNING]).toContain(state);
    });

    it('ワークフローをキャンセルできる', () => {
      orchestrator.cancelWorkflow();
      // キャンセルは実行中のみ有効
      expect(orchestrator.getState()).toBe(WorkflowState.IDLE);
    });

    it('リセットで初期状態に戻る', async () => {
      const request: UserRequest = {
        id: 'req-005',
        description: 'Task to be reset',
        timestamp: new Date()
      };
      
      await orchestrator.analyzeRequest(request);
      const requirements = await orchestrator.analyzeRequest(request);
      await orchestrator.createExecutionPlan(request, requirements);
      
      orchestrator.reset();
      
      expect(orchestrator.getState()).toBe(WorkflowState.IDLE);
      expect(orchestrator.getActivePlans()).toHaveLength(0);
    });
  });

  describe('Execution Plan Management', () => {
    it('複数の計画を管理できる', async () => {
      const request1: UserRequest = {
        id: 'req-006',
        description: 'First task',
        timestamp: new Date()
      };
      
      const request2: UserRequest = {
        id: 'req-007',
        description: 'Second task',
        timestamp: new Date()
      };
      
      const requirements1 = await orchestrator.analyzeRequest(request1);
      const plan1 = await orchestrator.createExecutionPlan(request1, requirements1);
      
      const requirements2 = await orchestrator.analyzeRequest(request2);
      const plan2 = await orchestrator.createExecutionPlan(request2, requirements2);
      
      const activePlans = orchestrator.getActivePlans();
      expect(activePlans.length).toBe(2);
      expect(activePlans.some(p => p.id === plan1.id)).toBe(true);
      expect(activePlans.some(p => p.id === plan2.id)).toBe(true);
    });

    it('計画の承認プロセスが動作する', async () => {
      const request: UserRequest = {
        id: 'req-008',
        description: 'Complex task requiring approval with many requirements and constraints',
        priority: 10,
        timestamp: new Date()
      };
      
      const requirements = await orchestrator.analyzeRequest(request);
      requirements.estimatedComplexity = 'high'; // 強制的に高複雑度に設定
      
      const plan = await orchestrator.createExecutionPlan(request, requirements);
      
      expect(plan.approvalRequired).toBe(true);
      
      const approved = orchestrator.approvePlan(plan.id);
      expect(approved).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('存在しない計画の実行を拒否する', async () => {
      await expect(orchestrator.executePlan('non-existent-plan'))
        .rejects
        .toThrow('Plan not found');
    });

    it('無効な計画承認を処理する', () => {
      const result = orchestrator.approvePlan('non-existent-plan');
      expect(result).toBe(false);
    });
  });
});
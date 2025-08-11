/**
 * TaskAgentMatcher のユニットテスト
 */

import { TaskAgentMatcher, Task, TaskAgentMatch, ParallelExecutionGroup } from '../task-agent-matcher';
import { AgentPromptLoader, AgentPreset } from '../agent-prompt-loader';

// AgentPromptLoaderをモック
jest.mock('../agent-prompt-loader');

describe('TaskAgentMatcher', () => {
  let matcher: TaskAgentMatcher;
  const mockAgentLoader = AgentPromptLoader as jest.MockedClass<typeof AgentPromptLoader>;

  // テスト用のエージェントプリセット
  const mockPresets = new Map<string, AgentPreset>([
    ['frontend-developer', {
      name: 'frontend-developer',
      description: 'Build React components and responsive layouts',
      systemPrompt: 'You are a frontend developer'
    }],
    ['backend-architect', {
      name: 'backend-architect',
      description: 'Design RESTful APIs and database schemas',
      systemPrompt: 'You are a backend architect'
    }],
    ['test-automator', {
      name: 'test-automator',
      description: 'Create unit tests and integration tests',
      systemPrompt: 'You are a test automation specialist'
    }],
    ['general-purpose', {
      name: 'general-purpose',
      description: 'General purpose agent for various tasks',
      systemPrompt: 'You are a general assistant'
    }]
  ]);

  beforeEach(() => {
    // モックのリセット
    jest.clearAllMocks();
    
    // AgentPromptLoaderのモック設定
    const mockLoaderInstance = {
      getAllPresets: jest.fn().mockReturnValue(mockPresets),
      getPreset: jest.fn((name: string) => mockPresets.get(name)),
      getPresetNames: jest.fn().mockReturnValue(Array.from(mockPresets.keys())),
      loadAllPresets: jest.fn(),
      getPresetList: jest.fn(),
      recommendAgent: jest.fn(),
      recommendAgentsForTasks: jest.fn(),
      reloadPresets: jest.fn()
    };
    
    mockAgentLoader.getInstance = jest.fn().mockReturnValue(mockLoaderInstance);
    
    // シングルトンをリセット
    (TaskAgentMatcher as any).instance = undefined;
    matcher = TaskAgentMatcher.getInstance();
  });

  describe('getInstance', () => {
    it('シングルトンインスタンスを返す', () => {
      const instance1 = TaskAgentMatcher.getInstance();
      const instance2 = TaskAgentMatcher.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('matchTask', () => {
    it('タスク説明に基づいて適切なエージェントを選択する', () => {
      const task: Task = {
        id: 'task-1',
        description: 'Build a React component for user profile with responsive design'
      };

      const match = matcher.matchTask(task);
      
      expect(match.agent.name).toBe('frontend-developer');
      expect(match.confidence).toBeGreaterThan(0.5);
      expect(match.taskId).toBe('task-1');
    });

    it('API関連のタスクにbackend-architectを選択する', () => {
      const task: Task = {
        id: 'task-2',
        description: 'Design RESTful API endpoints for user management'
      };

      const match = matcher.matchTask(task);
      
      expect(match.agent.name).toBe('backend-architect');
      expect(match.confidence).toBeGreaterThan(0.5);
    });

    it('テスト関連のタスクにtest-automatorを選択する', () => {
      const task: Task = {
        id: 'task-3',
        description: 'Write unit tests for the authentication module',
        type: 'testing'
      };

      const match = matcher.matchTask(task);
      
      expect(match.agent.name).toBe('test-automator');
      expect(match.confidence).toBeGreaterThan(0.5);
    });

    it('マッチしない場合はgeneral-purposeを使用する', () => {
      const task: Task = {
        id: 'task-4',
        description: 'Do something random and unspecific'
      };

      const match = matcher.matchTask(task);
      
      expect(match.agent.name).toBe('general-purpose');
      expect(match.reasoning).toContain('No specific match found');
    });

    it('タスクタイプが指定されている場合は考慮する', () => {
      const task: Task = {
        id: 'task-5',
        description: 'Create something',
        type: 'frontend'
      };

      const match = matcher.matchTask(task);
      
      expect(match.agent.name).toBe('frontend-developer');
    });
  });

  describe('matchTasks', () => {
    it('複数のタスクに対してエージェントをマッチングする', () => {
      const tasks: Task[] = [
        { id: '1', description: 'Build React UI' },
        { id: '2', description: 'Design database schema' },
        { id: '3', description: 'Write unit tests' }
      ];

      const matches = matcher.matchTasks(tasks);
      
      expect(matches).toHaveLength(3);
      expect(matches[0].agent.name).toBe('frontend-developer');
      expect(matches[1].agent.name).toBe('backend-architect');
      expect(matches[2].agent.name).toBe('test-automator');
    });
  });

  describe('prioritizeTasks', () => {
    it('優先度に基づいてタスクをソートする', () => {
      const tasks: Task[] = [
        { id: '1', description: 'Low priority', priority: 1 },
        { id: '2', description: 'High priority', priority: 10 },
        { id: '3', description: 'Medium priority', priority: 5 }
      ];

      const sorted = matcher.prioritizeTasks(tasks);
      
      expect(sorted[0].priority).toBe(10);
      expect(sorted[1].priority).toBe(5);
      expect(sorted[2].priority).toBe(1);
    });

    it('依存関係が少ないタスクを優先する', () => {
      const tasks: Task[] = [
        { id: '1', description: 'Many deps', dependencies: ['a', 'b', 'c'] },
        { id: '2', description: 'No deps' },
        { id: '3', description: 'One dep', dependencies: ['a'] }
      ];

      const sorted = matcher.prioritizeTasks(tasks);
      
      expect(sorted[0].id).toBe('2');
      expect(sorted[1].id).toBe('3');
      expect(sorted[2].id).toBe('1');
    });
  });

  describe('groupTasksForParallelExecution', () => {
    it('依存関係のないタスクを並列グループにまとめる', () => {
      const tasks: Task[] = [
        { id: '1', description: 'Build UI' },
        { id: '2', description: 'Design API' },
        { id: '3', description: 'Write tests' }
      ];

      const groups = matcher.groupTasksForParallelExecution(tasks);
      
      expect(groups).toHaveLength(1);
      expect(groups[0].canRunInParallel).toBe(true);
      expect(groups[0].tasks).toHaveLength(3);
    });

    it('依存関係があるタスクを順次実行グループに分ける', () => {
      const tasks: Task[] = [
        { id: '1', description: 'Setup database' },
        { id: '2', description: 'Create API', dependencies: ['1'] },
        { id: '3', description: 'Build UI', dependencies: ['2'] }
      ];

      const groups = matcher.groupTasksForParallelExecution(tasks);
      
      expect(groups.length).toBeGreaterThanOrEqual(3);
      
      // 最初のグループはタスク1のみ
      expect(groups[0].tasks.some(t => t.taskId === '1')).toBe(true);
      
      // タスク2はタスク1の後
      const task2Group = groups.find(g => g.tasks.some(t => t.taskId === '2'));
      expect(task2Group).toBeDefined();
      
      // タスク3はタスク2の後
      const task3Group = groups.find(g => g.tasks.some(t => t.taskId === '3'));
      expect(task3Group).toBeDefined();
    });

    it('部分的な依存関係を持つタスクを適切にグループ化する', () => {
      const tasks: Task[] = [
        { id: '1', description: 'Task 1' },
        { id: '2', description: 'Task 2' },
        { id: '3', description: 'Task 3', dependencies: ['1'] },
        { id: '4', description: 'Task 4', dependencies: ['2'] },
        { id: '5', description: 'Task 5', dependencies: ['3', '4'] }
      ];

      const groups = matcher.groupTasksForParallelExecution(tasks);
      
      // タスク1と2は並列実行可能
      expect(groups[0].tasks.length).toBe(2);
      expect(groups[0].canRunInParallel).toBe(true);
      
      // タスク5は最後のグループ
      const lastGroup = groups[groups.length - 1];
      expect(lastGroup.tasks.some(t => t.taskId === '5')).toBe(true);
    });

    it('循環依存を検出して処理する', () => {
      const tasks: Task[] = [
        { id: '1', description: 'Task 1', dependencies: ['3'] },
        { id: '2', description: 'Task 2', dependencies: ['1'] },
        { id: '3', description: 'Task 3', dependencies: ['2'] }
      ];

      // 循環依存があっても処理が完了することを確認
      const groups = matcher.groupTasksForParallelExecution(tasks);
      
      expect(groups.length).toBeGreaterThan(0);
      
      // すべてのタスクが処理されることを確認
      const allTaskIds = new Set<string>();
      for (const group of groups) {
        for (const match of group.tasks) {
          allTaskIds.add(match.taskId);
        }
      }
      expect(allTaskIds.size).toBe(3);
    });
  });

  describe('generateExecutionPlan', () => {
    it('実行計画を生成する', () => {
      const tasks: Task[] = [
        { id: '1', description: 'Build React component' },
        { id: '2', description: 'Design API endpoints' },
        { id: '3', description: 'Write tests for component', dependencies: ['1'] },
        { id: '4', description: 'Write tests for API', dependencies: ['2'] }
      ];

      const plan = matcher.generateExecutionPlan(tasks);
      
      expect(plan.groups).toBeDefined();
      expect(plan.groups.length).toBeGreaterThan(0);
      expect(plan.totalAgents).toBeGreaterThan(0);
      expect(plan.agentUtilization).toBeDefined();
      
      // エージェント利用率の確認
      const utilization = plan.agentUtilization;
      expect(utilization.get('frontend-developer')).toBeGreaterThanOrEqual(1);
      expect(utilization.get('backend-architect')).toBeGreaterThanOrEqual(1);
      expect(utilization.get('test-automator')).toBeGreaterThanOrEqual(2);
    });

    it('優先度を考慮した実行計画を生成する', () => {
      const tasks: Task[] = [
        { id: '1', description: 'Low priority task', priority: 1 },
        { id: '2', description: 'High priority task', priority: 10 },
        { id: '3', description: 'Medium priority task', priority: 5 }
      ];

      const plan = matcher.generateExecutionPlan(tasks);
      
      // 高優先度タスクが最初のグループに含まれることを確認
      const firstGroupTaskIds = plan.groups[0].tasks.map(t => t.taskId);
      expect(firstGroupTaskIds).toContain('2');
    });
  });
});
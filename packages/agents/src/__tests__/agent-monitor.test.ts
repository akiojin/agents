/**
 * AgentMonitor テストスイート
 */

import { AgentMonitor, AgentExecutionState, AgentExecutionInfo } from '../agent-monitor';

describe('AgentMonitor', () => {
  let monitor: AgentMonitor;

  beforeEach(() => {
    // 各テストの前に新しいインスタンスを作成
    monitor = AgentMonitor.getInstance({
      updateInterval: 100,
      showDetails: false,
      colorize: false
    });
    monitor.clear();
  });

  afterEach(() => {
    // テスト後にモニターを停止
    monitor.stopMonitoring();
    monitor.reset();
  });

  describe('シングルトン', () => {
    it('同じインスタンスを返す', () => {
      const monitor1 = AgentMonitor.getInstance();
      const monitor2 = AgentMonitor.getInstance();
      expect(monitor1).toBe(monitor2);
    });
  });

  describe('エージェント登録', () => {
    it('エージェントを登録できる', () => {
      const agentInfo: AgentExecutionInfo = {
        agentId: 'test-agent-1',
        agentType: 'test',
        agentName: 'Test Agent',
        taskId: 'task-1',
        taskDescription: 'Test task',
        state: AgentExecutionState.IDLE
      };

      monitor.registerAgent(agentInfo);
      const agent = monitor.getAgent('test-agent-1');
      
      expect(agent).toBeDefined();
      expect(agent?.agentName).toBe('Test Agent');
      expect(agent?.state).toBe(AgentExecutionState.IDLE);
    });

    it('親子関係を設定できる', () => {
      const parentAgent: AgentExecutionInfo = {
        agentId: 'parent-agent',
        agentType: 'orchestrator',
        agentName: 'Parent Agent',
        taskId: 'task-parent',
        taskDescription: 'Parent task',
        state: AgentExecutionState.EXECUTING
      };

      const childAgent: AgentExecutionInfo = {
        agentId: 'child-agent',
        agentType: 'worker',
        agentName: 'Child Agent',
        taskId: 'task-child',
        taskDescription: 'Child task',
        state: AgentExecutionState.IDLE,
        parentAgentId: 'parent-agent'
      };

      monitor.registerAgent(parentAgent);
      monitor.registerAgent(childAgent);

      const parent = monitor.getAgent('parent-agent');
      expect(parent?.childAgentIds).toContain('child-agent');
    });
  });

  describe('状態管理', () => {
    beforeEach(() => {
      const agentInfo: AgentExecutionInfo = {
        agentId: 'state-test-agent',
        agentType: 'test',
        agentName: 'State Test Agent',
        taskId: 'task-1',
        taskDescription: 'State test task',
        state: AgentExecutionState.IDLE
      };
      monitor.registerAgent(agentInfo);
    });

    it('エージェントの状態を更新できる', () => {
      monitor.updateAgentState('state-test-agent', AgentExecutionState.EXECUTING);
      
      const agent = monitor.getAgent('state-test-agent');
      expect(agent?.state).toBe(AgentExecutionState.EXECUTING);
    });

    it('完了時に終了時刻と実行時間を記録する', async () => {
      monitor.updateAgentState('state-test-agent', AgentExecutionState.EXECUTING);
      
      // 少し待機
      await new Promise(resolve => setTimeout(resolve, 100));
      
      monitor.updateAgentState('state-test-agent', AgentExecutionState.COMPLETED);
      
      const agent = monitor.getAgent('state-test-agent');
      expect(agent?.endTime).toBeDefined();
      expect(agent?.duration).toBeGreaterThan(0);
    });

    it('失敗時にエラー情報を記録する', () => {
      monitor.updateAgentState('state-test-agent', AgentExecutionState.FAILED, {
        error: 'Test error message'
      });
      
      const agent = monitor.getAgent('state-test-agent');
      expect(agent?.state).toBe(AgentExecutionState.FAILED);
      expect(agent?.error).toBe('Test error message');
    });
  });

  describe('進捗管理', () => {
    beforeEach(() => {
      const agentInfo: AgentExecutionInfo = {
        agentId: 'progress-agent',
        agentType: 'test',
        agentName: 'Progress Agent',
        taskId: 'task-1',
        taskDescription: 'Progress test',
        state: AgentExecutionState.EXECUTING
      };
      monitor.registerAgent(agentInfo);
    });

    it('進捗を更新できる', () => {
      monitor.updateAgentProgress('progress-agent', 5, 10, 'Processing item 5');
      
      const agent = monitor.getAgent('progress-agent');
      expect(agent?.progress).toBeDefined();
      expect(agent?.progress?.current).toBe(5);
      expect(agent?.progress?.total).toBe(10);
      expect(agent?.progress?.percentage).toBe(50);
      expect(agent?.currentStep).toBe('Processing item 5');
    });

    it('ゼロ除算を処理できる', () => {
      monitor.updateAgentProgress('progress-agent', 0, 0);
      
      const agent = monitor.getAgent('progress-agent');
      expect(agent?.progress?.percentage).toBe(0);
    });
  });

  describe('ツール使用記録', () => {
    beforeEach(() => {
      const agentInfo: AgentExecutionInfo = {
        agentId: 'tool-agent',
        agentType: 'test',
        agentName: 'Tool Agent',
        taskId: 'task-1',
        taskDescription: 'Tool test',
        state: AgentExecutionState.EXECUTING
      };
      monitor.registerAgent(agentInfo);
    });

    it('ツール使用を記録できる', () => {
      monitor.recordToolUsage('tool-agent', 'write_todos');
      monitor.recordToolUsage('tool-agent', 'execute_command');
      
      const agent = monitor.getAgent('tool-agent');
      expect(agent?.toolsUsed).toContain('write_todos');
      expect(agent?.toolsUsed).toContain('execute_command');
    });

    it('重複したツールは記録しない', () => {
      monitor.recordToolUsage('tool-agent', 'write_todos');
      monitor.recordToolUsage('tool-agent', 'write_todos');
      
      const agent = monitor.getAgent('tool-agent');
      expect(agent?.toolsUsed?.filter(t => t === 'write_todos')).toHaveLength(1);
    });
  });

  describe('エージェント削除', () => {
    it('エージェントを削除できる', () => {
      const agentInfo: AgentExecutionInfo = {
        agentId: 'delete-agent',
        agentType: 'test',
        agentName: 'Delete Agent',
        taskId: 'task-1',
        taskDescription: 'Delete test',
        state: AgentExecutionState.IDLE
      };
      
      monitor.registerAgent(agentInfo);
      expect(monitor.getAgent('delete-agent')).toBeDefined();
      
      monitor.removeAgent('delete-agent');
      expect(monitor.getAgent('delete-agent')).toBeUndefined();
    });

    it('子エージェントも削除される', () => {
      // 親エージェントを登録
      monitor.registerAgent({
        agentId: 'parent',
        agentType: 'test',
        agentName: 'Parent',
        taskId: 'task-parent',
        taskDescription: 'Parent task',
        state: AgentExecutionState.IDLE
      });

      // 子エージェントを登録
      monitor.registerAgent({
        agentId: 'child1',
        agentType: 'test',
        agentName: 'Child 1',
        taskId: 'task-child1',
        taskDescription: 'Child task 1',
        state: AgentExecutionState.IDLE,
        parentAgentId: 'parent'
      });

      monitor.registerAgent({
        agentId: 'child2',
        agentType: 'test',
        agentName: 'Child 2',
        taskId: 'task-child2',
        taskDescription: 'Child task 2',
        state: AgentExecutionState.IDLE,
        parentAgentId: 'parent'
      });

      // 親を削除
      monitor.removeAgent('parent');

      // すべて削除されていることを確認
      expect(monitor.getAgent('parent')).toBeUndefined();
      expect(monitor.getAgent('child1')).toBeUndefined();
      expect(monitor.getAgent('child2')).toBeUndefined();
    });
  });

  describe('履歴管理', () => {
    it('完了したエージェントが履歴に追加される', () => {
      const agentInfo: AgentExecutionInfo = {
        agentId: 'history-agent',
        agentType: 'test',
        agentName: 'History Agent',
        taskId: 'task-1',
        taskDescription: 'History test',
        state: AgentExecutionState.EXECUTING
      };
      
      monitor.registerAgent(agentInfo);
      monitor.updateAgentState('history-agent', AgentExecutionState.COMPLETED);
      
      const history = monitor.getExecutionHistory();
      expect(history).toHaveLength(1);
      expect(history[0].agentId).toBe('history-agent');
      expect(history[0].state).toBe(AgentExecutionState.COMPLETED);
    });
  });

  describe('アクティブエージェント', () => {
    it('アクティブなエージェントのみを取得できる', () => {
      // 様々な状態のエージェントを登録
      monitor.registerAgent({
        agentId: 'active-1',
        agentType: 'test',
        agentName: 'Active 1',
        taskId: 'task-1',
        taskDescription: 'Active task 1',
        state: AgentExecutionState.EXECUTING
      });

      monitor.registerAgent({
        agentId: 'active-2',
        agentType: 'test',
        agentName: 'Active 2',
        taskId: 'task-2',
        taskDescription: 'Active task 2',
        state: AgentExecutionState.PLANNING
      });

      monitor.registerAgent({
        agentId: 'completed-1',
        agentType: 'test',
        agentName: 'Completed 1',
        taskId: 'task-3',
        taskDescription: 'Completed task',
        state: AgentExecutionState.COMPLETED
      });

      const activeAgents = monitor.getActiveAgents();
      expect(activeAgents).toHaveLength(2);
      expect(activeAgents.map(a => a.agentId)).toContain('active-1');
      expect(activeAgents.map(a => a.agentId)).toContain('active-2');
      expect(activeAgents.map(a => a.agentId)).not.toContain('completed-1');
    });
  });

  describe('モニタリング制御', () => {
    it('モニタリングを開始・停止できる', (done) => {
      let startEventFired = false;
      let stopEventFired = false;

      monitor.on('monitoring-started', () => {
        startEventFired = true;
      });

      monitor.on('monitoring-stopped', () => {
        stopEventFired = true;
        expect(startEventFired).toBe(true);
        expect(stopEventFired).toBe(true);
        done();
      });

      monitor.startMonitoring();
      setTimeout(() => {
        monitor.stopMonitoring();
      }, 50);
    });
  });

  describe('イベント', () => {
    it('エージェント登録時にイベントが発火する', (done) => {
      monitor.on('agent-registered', (agent: AgentExecutionInfo) => {
        expect(agent.agentId).toBe('event-agent');
        done();
      });

      monitor.registerAgent({
        agentId: 'event-agent',
        agentType: 'test',
        agentName: 'Event Agent',
        taskId: 'task-1',
        taskDescription: 'Event test',
        state: AgentExecutionState.IDLE
      });
    });

    it('状態変更時にイベントが発火する', (done) => {
      monitor.registerAgent({
        agentId: 'state-event-agent',
        agentType: 'test',
        agentName: 'State Event Agent',
        taskId: 'task-1',
        taskDescription: 'State event test',
        state: AgentExecutionState.IDLE
      });

      monitor.on('agent-state-changed', (data: any) => {
        expect(data.agentId).toBe('state-event-agent');
        expect(data.previousState).toBe(AgentExecutionState.IDLE);
        expect(data.newState).toBe(AgentExecutionState.EXECUTING);
        done();
      });

      monitor.updateAgentState('state-event-agent', AgentExecutionState.EXECUTING);
    });
  });
});
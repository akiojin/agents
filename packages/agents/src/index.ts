/**
 * Multi-Agent Coordination System
 * 
 * エクスポート一覧:
 * - AgentPromptLoader: エージェントプリセットの動的読み込み
 * - TaskAgentMatcher: タスクとエージェントのマッチング
 * - WorkflowOrchestrator: ワークフロー全体の統合管理
 * - SubAgent, SubAgentManager: エージェント管理（sub-agent.tsから）
 */

// AgentPromptLoader関連
export {
  AgentPromptLoader,
  AgentPreset,
  loadAgentPresets,
  getAgentPreset,
  recommendAgentForTask
} from './agent-prompt-loader';

// TaskAgentMatcher関連
export {
  TaskAgentMatcher,
  Task,
  TaskAgentMatch,
  ParallelExecutionGroup
} from './task-agent-matcher';

// WorkflowOrchestrator関連  
export {
  WorkflowOrchestrator,
  WorkflowState,
  UserRequest,
  Requirements,
  ExecutionPlan,
  TaskExecutionResult,
  WorkflowExecutionResult
} from './workflow-orchestrator';

// SubAgent関連（既存のsub-agent.tsから）
export {
  SubAgent,
  SubAgentManager,
  SubAgentConfig,
  SubAgentContext,
  SubAgentResult,
  subAgentToolDefinition,
  getSubAgentToolDefinition
} from '../sub-agent';
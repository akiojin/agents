/**
 * WorkflowOrchestrator - マルチエージェントワークフローの統合管理
 * 
 * 機能:
 * - ユーザーリクエストの解析
 * - 要件定義と計画立案
 * - エージェントへのタスク割り振り
 * - 並列実行の管理
 * - 結果の統合とレポート
 */

import { SubAgentManager } from '../sub-agent';
import { TaskAgentMatcher, Task, ParallelExecutionGroup } from './task-agent-matcher';
import { AgentPromptLoader } from './agent-prompt-loader';
import { GeminiAdapterProvider } from '../../core/src/providers/gemini-adapter-provider';

// ワークフローの状態
export enum WorkflowState {
  IDLE = 'idle',
  ANALYZING = 'analyzing',
  PLANNING = 'planning',
  AWAITING_APPROVAL = 'awaiting_approval',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// ユーザーリクエスト
export interface UserRequest {
  id: string;
  description: string;
  context?: Record<string, any>;
  constraints?: string[];
  priority?: number;
  timestamp: Date;
}

// 要件定義
export interface Requirements {
  functionalRequirements: string[];
  nonFunctionalRequirements: string[];
  constraints: string[];
  successCriteria: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

// 実行計画
export interface ExecutionPlan {
  id: string;
  requestId: string;
  requirements: Requirements;
  tasks: Task[];
  executionGroups: ParallelExecutionGroup[];
  estimatedDuration?: number;
  approvalRequired: boolean;
  createdAt: Date;
}

// タスク実行結果
export interface TaskExecutionResult {
  taskId: string;
  agentName: string;
  status: 'success' | 'failure' | 'partial';
  output?: string;
  error?: string;
  duration: number;
  timestamp: Date;
}

// ワークフロー実行結果
export interface WorkflowExecutionResult {
  requestId: string;
  planId: string;
  state: WorkflowState;
  taskResults: TaskExecutionResult[];
  summary: string;
  totalDuration: number;
  completedAt?: Date;
  error?: string;
}

export class WorkflowOrchestrator {
  private static instance: WorkflowOrchestrator;
  private agentManager: SubAgentManager;
  private taskMatcher: TaskAgentMatcher;
  private agentLoader: AgentPromptLoader;
  private provider: GeminiAdapterProvider;
  private currentState: WorkflowState = WorkflowState.IDLE;
  private activePlans: Map<string, ExecutionPlan> = new Map();
  private executionResults: Map<string, WorkflowExecutionResult> = new Map();

  private constructor() {
    this.agentLoader = AgentPromptLoader.getInstance();
    this.taskMatcher = TaskAgentMatcher.getInstance();
    
    // プロバイダーを初期化
    this.provider = new GeminiAdapterProvider(
      process.env.LLM_API_KEY || 'dummy-key',
      process.env.LLM_MODEL || 'local-model',
      process.env.LLM_BASE_URL || 'http://localhost:1234/v1'
    );
    
    // エージェントマネージャーを初期化
    this.agentManager = new SubAgentManager(this.provider);
  }

  // シングルトンインスタンスを取得
  public static getInstance(): WorkflowOrchestrator {
    if (!WorkflowOrchestrator.instance) {
      WorkflowOrchestrator.instance = new WorkflowOrchestrator();
    }
    return WorkflowOrchestrator.instance;
  }

  // 現在の状態を取得
  public getState(): WorkflowState {
    return this.currentState;
  }

  // 状態を変更
  private setState(state: WorkflowState): void {
    console.log(`Workflow state changed: ${this.currentState} -> ${state}`);
    this.currentState = state;
  }

  // ユーザーリクエストを解析
  public async analyzeRequest(request: UserRequest): Promise<Requirements> {
    this.setState(WorkflowState.ANALYZING);
    
    try {
      // LLMを使用してリクエストを解析
      const analysisPrompt = `
Analyze the following user request and extract requirements.

Request: ${request.description}

Context: ${JSON.stringify(request.context || {})}
Constraints: ${(request.constraints || []).join(', ')}

Please provide a structured analysis with:
1. Functional requirements (specific features/actions to implement)
2. Non-functional requirements (performance, security, scalability)
3. Constraints (technical limitations, dependencies)
4. Success criteria (measurable outcomes)
5. Estimated complexity (low/medium/high)

Respond in JSON format:
{
  "functionalRequirements": ["requirement1", "requirement2"],
  "nonFunctionalRequirements": ["requirement1", "requirement2"],
  "constraints": ["constraint1", "constraint2"],
  "successCriteria": ["criteria1", "criteria2"],
  "estimatedComplexity": "low|medium|high"
}`;

      try {
        // LLMに解析を依頼
        const response = await this.provider.generateContent({
          messages: [{
            role: 'user',
            content: analysisPrompt
          }],
          temperature: 0.3,
          maxTokens: 1000
        });

        // レスポンスをパース
        const content = response.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            functionalRequirements: parsed.functionalRequirements || [],
            nonFunctionalRequirements: parsed.nonFunctionalRequirements || [],
            constraints: [...(request.constraints || []), ...(parsed.constraints || [])],
            successCriteria: parsed.successCriteria || [],
            estimatedComplexity: parsed.estimatedComplexity || 'medium'
          };
        }
      } catch (llmError) {
        console.warn('LLM analysis failed, using fallback extraction:', llmError);
      }

      // フォールバック: 簡易的な抽出
      const requirements: Requirements = {
        functionalRequirements: this.extractFunctionalRequirements(request.description),
        nonFunctionalRequirements: this.extractNonFunctionalRequirements(request.description),
        constraints: request.constraints || [],
        successCriteria: this.defineSuccessCriteria(request.description),
        estimatedComplexity: this.estimateComplexity(request.description)
      };

      return requirements;
    } catch (error) {
      this.setState(WorkflowState.FAILED);
      throw error;
    }
  }

  // 機能要件を抽出
  private extractFunctionalRequirements(description: string): string[] {
    const requirements: string[] = [];
    
    // キーワードベースの簡易抽出
    if (description.includes('作成') || description.includes('create')) {
      requirements.push('新規作成機能の実装');
    }
    if (description.includes('更新') || description.includes('update')) {
      requirements.push('更新機能の実装');
    }
    if (description.includes('削除') || description.includes('delete')) {
      requirements.push('削除機能の実装');
    }
    if (description.includes('表示') || description.includes('display')) {
      requirements.push('表示機能の実装');
    }
    if (description.includes('テスト') || description.includes('test')) {
      requirements.push('テストの作成と実行');
    }
    
    return requirements.length > 0 ? requirements : ['指定された機能の実装'];
  }

  // 非機能要件を抽出
  private extractNonFunctionalRequirements(description: string): string[] {
    const requirements: string[] = [];
    
    if (description.includes('パフォーマンス') || description.includes('performance')) {
      requirements.push('パフォーマンス最適化');
    }
    if (description.includes('セキュリティ') || description.includes('security')) {
      requirements.push('セキュリティ要件の実装');
    }
    if (description.includes('スケーラブル') || description.includes('scalable')) {
      requirements.push('スケーラビリティの確保');
    }
    
    return requirements;
  }

  // 成功基準を定義
  private defineSuccessCriteria(description: string): string[] {
    return [
      'すべての機能要件が実装されている',
      'テストが通過している',
      'コードレビューが完了している',
      'ドキュメントが更新されている'
    ];
  }

  // 複雑度を推定
  private estimateComplexity(description: string): 'low' | 'medium' | 'high' {
    const words = description.split(' ').length;
    if (words < 20) return 'low';
    if (words < 50) return 'medium';
    return 'high';
  }

  // 実行計画を作成
  public async createExecutionPlan(
    request: UserRequest,
    requirements: Requirements
  ): Promise<ExecutionPlan> {
    this.setState(WorkflowState.PLANNING);
    
    try {
      // 要件からタスクを生成
      const tasks = this.generateTasksFromRequirements(requirements, request);
      
      // タスクマッチャーを使用して実行グループを作成
      const executionPlan = this.taskMatcher.generateExecutionPlan(tasks);
      
      const plan: ExecutionPlan = {
        id: `plan-${Date.now()}`,
        requestId: request.id,
        requirements,
        tasks,
        executionGroups: executionPlan.groups,
        estimatedDuration: this.estimateDuration(executionPlan.groups),
        approvalRequired: requirements.estimatedComplexity !== 'low',
        createdAt: new Date()
      };
      
      this.activePlans.set(plan.id, plan);
      
      if (plan.approvalRequired) {
        this.setState(WorkflowState.AWAITING_APPROVAL);
      }
      
      return plan;
    } catch (error) {
      this.setState(WorkflowState.FAILED);
      throw error;
    }
  }

  // 要件からタスクを生成
  private generateTasksFromRequirements(
    requirements: Requirements,
    request: UserRequest
  ): Task[] {
    const tasks: Task[] = [];
    let taskCounter = 0;
    
    // 機能要件からタスクを生成
    for (const req of requirements.functionalRequirements) {
      tasks.push({
        id: `task-${++taskCounter}`,
        description: req,
        type: this.inferTaskType(req),
        priority: request.priority
      });
    }
    
    // 非機能要件からタスクを生成
    for (const req of requirements.nonFunctionalRequirements) {
      tasks.push({
        id: `task-${++taskCounter}`,
        description: req,
        type: 'optimization',
        dependencies: tasks.slice(0, -1).map(t => t.id), // 機能実装後に実行
        priority: (request.priority || 5) - 1
      });
    }
    
    // テストタスクを追加
    if (!tasks.some(t => t.type === 'testing')) {
      tasks.push({
        id: `task-${++taskCounter}`,
        description: 'テストの作成と実行',
        type: 'testing',
        dependencies: tasks.filter(t => t.type !== 'optimization').map(t => t.id),
        priority: (request.priority || 5) - 2
      });
    }
    
    return tasks;
  }

  // タスクタイプを推論
  private inferTaskType(description: string): string {
    const lower = description.toLowerCase();
    
    if (lower.includes('ui') || lower.includes('フロントエンド') || lower.includes('画面')) {
      return 'frontend';
    }
    if (lower.includes('api') || lower.includes('バックエンド') || lower.includes('データベース')) {
      return 'backend';
    }
    if (lower.includes('テスト')) {
      return 'testing';
    }
    if (lower.includes('デプロイ') || lower.includes('ci/cd')) {
      return 'devops';
    }
    
    return 'general';
  }

  // 実行時間を推定
  private estimateDuration(groups: ParallelExecutionGroup[]): number {
    // グループごとの推定時間（分）
    let totalDuration = 0;
    
    for (const group of groups) {
      if (group.canRunInParallel) {
        // 並列実行の場合は最長タスクの時間
        totalDuration += 5; // 仮に5分
      } else {
        // 順次実行の場合は合計時間
        totalDuration += group.tasks.length * 5;
      }
    }
    
    return totalDuration;
  }

  // 計画を承認
  public approvePlan(planId: string): boolean {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      console.error(`Plan not found: ${planId}`);
      return false;
    }
    
    if (this.currentState !== WorkflowState.AWAITING_APPROVAL) {
      console.error('Plan is not awaiting approval');
      return false;
    }
    
    console.log(`Plan ${planId} approved`);
    return true;
  }

  // 計画を実行
  public async executePlan(planId: string): Promise<WorkflowExecutionResult> {
    const plan = this.activePlans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }
    
    this.setState(WorkflowState.EXECUTING);
    const startTime = Date.now();
    const taskResults: TaskExecutionResult[] = [];
    
    try {
      // 実行グループごとに処理
      for (const group of plan.executionGroups) {
        console.log(`Executing group ${group.groupId} (parallel: ${group.canRunInParallel})`);
        
        if (group.canRunInParallel) {
          // 並列実行
          const promises = group.tasks.map(match => 
            this.executeTask(match.task, match.agent.name)
          );
          
          const results = await Promise.allSettled(promises);
          
          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const match = group.tasks[i];
            
            if (result.status === 'fulfilled') {
              taskResults.push(result.value);
            } else {
              taskResults.push({
                taskId: match.taskId,
                agentName: match.agent.name,
                status: 'failure',
                error: result.reason?.message || 'Unknown error',
                duration: 0,
                timestamp: new Date()
              });
            }
          }
        } else {
          // 順次実行
          for (const match of group.tasks) {
            try {
              const result = await this.executeTask(match.task, match.agent.name);
              taskResults.push(result);
            } catch (error: any) {
              taskResults.push({
                taskId: match.taskId,
                agentName: match.agent.name,
                status: 'failure',
                error: error.message,
                duration: 0,
                timestamp: new Date()
              });
            }
          }
        }
      }
      
      // 結果をまとめる
      const totalDuration = Date.now() - startTime;
      const successCount = taskResults.filter(r => r.status === 'success').length;
      const failureCount = taskResults.filter(r => r.status === 'failure').length;
      
      const result: WorkflowExecutionResult = {
        requestId: plan.requestId,
        planId: plan.id,
        state: failureCount === 0 ? WorkflowState.COMPLETED : WorkflowState.FAILED,
        taskResults,
        summary: `実行完了: ${successCount}個成功, ${failureCount}個失敗`,
        totalDuration,
        completedAt: new Date()
      };
      
      this.executionResults.set(plan.requestId, result);
      this.setState(result.state);
      
      return result;
    } catch (error: any) {
      this.setState(WorkflowState.FAILED);
      
      const result: WorkflowExecutionResult = {
        requestId: plan.requestId,
        planId: plan.id,
        state: WorkflowState.FAILED,
        taskResults,
        summary: 'ワークフロー実行中にエラーが発生しました',
        totalDuration: Date.now() - startTime,
        error: error.message
      };
      
      this.executionResults.set(plan.requestId, result);
      return result;
    }
  }

  // 個別タスクを実行
  private async executeTask(
    task: Task,
    agentName: string
  ): Promise<TaskExecutionResult> {
    const startTime = Date.now();
    
    try {
      console.log(`Executing task ${task.id} with agent ${agentName}`);
      
      // エージェントを使用してタスクを実行
      const result = await this.agentManager.executeTask(task.description, agentName);
      
      return {
        taskId: task.id,
        agentName,
        status: result.success ? 'success' : 'failure',
        output: result.output,
        error: result.error,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    } catch (error: any) {
      return {
        taskId: task.id,
        agentName,
        status: 'failure',
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date()
      };
    }
  }

  // ワークフロー全体を実行
  public async processUserRequest(request: UserRequest): Promise<WorkflowExecutionResult> {
    console.log(`Processing user request: ${request.id}`);
    
    // 1. リクエストを解析
    const requirements = await this.analyzeRequest(request);
    console.log('Requirements analyzed:', requirements);
    
    // 2. 実行計画を作成
    const plan = await this.createExecutionPlan(request, requirements);
    console.log('Execution plan created:', plan.id);
    
    // 3. 承認が必要な場合は待機（デモでは自動承認）
    if (plan.approvalRequired) {
      console.log('Plan requires approval...');
      this.approvePlan(plan.id);
    }
    
    // 4. 計画を実行
    const result = await this.executePlan(plan.id);
    console.log('Workflow execution completed:', result.state);
    
    return result;
  }

  // 実行結果を取得
  public getExecutionResult(requestId: string): WorkflowExecutionResult | undefined {
    return this.executionResults.get(requestId);
  }

  // アクティブな計画を取得
  public getActivePlans(): ExecutionPlan[] {
    return Array.from(this.activePlans.values());
  }

  // ワークフローをキャンセル
  public cancelWorkflow(): void {
    if (this.currentState === WorkflowState.EXECUTING) {
      this.setState(WorkflowState.CANCELLED);
      console.log('Workflow cancelled');
    }
  }

  // リセット
  public reset(): void {
    this.currentState = WorkflowState.IDLE;
    this.activePlans.clear();
    this.executionResults.clear();
    this.agentManager.clearAgents();
    console.log('Workflow orchestrator reset');
  }
}
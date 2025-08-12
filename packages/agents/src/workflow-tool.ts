/**
 * WorkflowTool - WorkflowOrchestratorを既存のツールシステムに統合
 * 
 * これにより、既存の承認UIメカニズムを使用してワークフローの承認が可能になります
 */

import { 
  BaseTool, 
  ToolResult, 
  ToolCallConfirmationDetails,
  ToolConfirmationOutcome,
  ApprovalMode
} from '../../core/src/tools/tools';
import { Config } from '../../core/src/config/config';
import { WorkflowOrchestrator, UserRequest, ExecutionPlan } from './workflow-orchestrator';

export interface WorkflowToolParams {
  description: string;
  context?: Record<string, any>;
  constraints?: string[];
  priority?: number;
}

export class WorkflowTool extends BaseTool<WorkflowToolParams> {
  public static readonly Name = 'workflow_execute';
  
  private orchestrator: WorkflowOrchestrator;
  private currentPlan: ExecutionPlan | null = null;
  private config: Config;

  constructor(config: Config) {
    super(
      WorkflowTool.Name,
      'Workflow Execute',
      'マルチエージェントワークフローを実行',
      false, // isOutputMarkdown
      false, // canUpdateOutput
      {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: '実行するタスクの説明',
          },
          context: {
            type: 'object',
            description: 'タスクのコンテキスト情報',
          },
          constraints: {
            type: 'array',
            items: { type: 'string' },
            description: '制約条件のリスト',
          },
          priority: {
            type: 'number',
            description: '優先度（1-10）',
          },
        },
        required: ['description'],
      }
    );
    
    this.config = config;
    this.orchestrator = WorkflowOrchestrator.getInstance();
  }

  validateToolParams(params: WorkflowToolParams): string | null {
    if (!params.description || params.description.trim() === '') {
      return 'タスクの説明が必要です';
    }
    
    if (params.priority !== undefined && (params.priority < 1 || params.priority > 10)) {
      return '優先度は1から10の間で指定してください';
    }
    
    return null;
  }

  getDescription(params: WorkflowToolParams): string {
    return `ワークフロー実行: ${params.description}`;
  }

  async shouldConfirmExecute(
    params: WorkflowToolParams,
    abortSignal: AbortSignal
  ): Promise<ToolCallConfirmationDetails | false> {
    // 承認モードがAUTO_EDITまたはYOLOの場合は承認不要
    if (this.config.getApprovalMode() === ApprovalMode.AUTO_EDIT ||
        this.config.getApprovalMode() === ApprovalMode.YOLO) {
      return false;
    }

    // ユーザーリクエストを作成
    const request: UserRequest = {
      id: `req-${Date.now()}`,
      description: params.description,
      context: params.context,
      constraints: params.constraints,
      priority: params.priority || 5,
      timestamp: new Date()
    };

    // 要件を分析して実行計画を作成
    try {
      const requirements = await this.orchestrator.analyzeRequest(request);
      const plan = await this.orchestrator.createExecutionPlan(request, requirements);
      this.currentPlan = plan;

      // 複雑度が低い場合は承認不要
      if (!plan.approvalRequired) {
        return false;
      }

      // 承認が必要な場合は詳細を返す
      const confirmationDetails: ToolCallConfirmationDetails = {
        type: 'info',
        title: `ワークフロー実行の承認: ${params.description}`,
        prompt: this.formatPlanSummary(plan),
        onConfirm: async (outcome: ToolConfirmationOutcome) => {
          if (outcome === ToolConfirmationOutcome.ProceedAlways) {
            // 今後の承認をスキップする設定（必要に応じて実装）
            console.log('今後、ワークフローの承認をスキップします');
          }
        }
      };

      return confirmationDetails;
    } catch (error) {
      console.error('計画作成エラー:', error);
      return false;
    }
  }

  private formatPlanSummary(plan: ExecutionPlan): string {
    const lines = [
      '📊 実行計画の概要:',
      `  • タスク数: ${plan.tasks.length}`,
      `  • 実行グループ数: ${plan.executionGroups.length}`,
      `  • 推定実行時間: ${plan.estimatedDuration || '不明'}分`,
      `  • 複雑度: ${plan.requirements.estimatedComplexity}`,
      '',
      '📝 主要タスク:',
    ];

    const displayTasks = plan.tasks.slice(0, 5);
    displayTasks.forEach((task, index) => {
      lines.push(`  ${index + 1}. ${task.description}`);
    });

    if (plan.tasks.length > 5) {
      lines.push(`  ... 他 ${plan.tasks.length - 5} タスク`);
    }

    lines.push('');
    lines.push('✅ 成功基準:');
    plan.requirements.successCriteria.forEach(criteria => {
      lines.push(`  • ${criteria}`);
    });

    return lines.join('\n');
  }

  async execute(
    params: WorkflowToolParams,
    signal: AbortSignal,
    updateOutput?: (output: string) => void
  ): Promise<ToolResult> {
    try {
      // 現在の計画があればそれを使用、なければ新規作成
      let plan = this.currentPlan;
      
      if (!plan) {
        const request: UserRequest = {
          id: `req-${Date.now()}`,
          description: params.description,
          context: params.context,
          constraints: params.constraints,
          priority: params.priority || 5,
          timestamp: new Date()
        };

        const requirements = await this.orchestrator.analyzeRequest(request);
        plan = await this.orchestrator.createExecutionPlan(request, requirements);
      }

      // 進行状況を更新
      if (updateOutput) {
        updateOutput('🔄 ワークフローを実行中...\n');
      }

      // 計画を実行
      const result = await this.orchestrator.executePlan(plan.id);

      // 結果のサマリーを作成
      const summary = [
        `実行結果: ${result.state}`,
        `サマリー: ${result.summary}`,
        `実行時間: ${(result.totalDuration / 1000).toFixed(2)}秒`,
      ];

      if (result.taskResults && result.taskResults.length > 0) {
        summary.push('');
        summary.push('タスク結果:');
        result.taskResults.forEach((task, index) => {
          const status = task.status === 'success' ? '✅' : '❌';
          summary.push(`  ${index + 1}. ${status} ${task.agentName} - ${task.status}`);
        });
      }

      const outputText = summary.join('\n');

      // 結果を返す
      return {
        responseParts: [{ text: outputText }],
        resultDisplay: {
          type: 'text',
          title: 'ワークフロー実行完了',
          content: outputText,
        },
      };
    } catch (error: any) {
      return {
        responseParts: [{ text: `エラー: ${error.message}` }],
        resultDisplay: {
          type: 'text',
          title: 'ワークフロー実行エラー',
          content: error.message,
        },
      };
    } finally {
      this.currentPlan = null;
    }
  }
}
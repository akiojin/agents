/**
 * ReActパターンを実装したエージェント
 * 
 * Reasoning and Acting (ReAct) パターンに従い、
 * タスクが完了するまで思考と行動を繰り返します。
 */

import { Agent, AgentConfig } from './agent';
import { ChatMessage } from '../providers/base';
import { logger } from '../utils/logger';
import { CoreToolScheduler, TrackedToolCall, ToolRequest } from '../../packages/core/src/core/coreToolScheduler';
import { ApprovalMode, ToolConfirmationOutcome } from '../../packages/core/src/config/config';

export interface ReActConfig extends AgentConfig {
  maxIterations?: number;  // 最大ループ回数
  iterationTimeout?: number;  // 各イテレーションのタイムアウト（ミリ秒）
}

export interface ReActTask {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export class ReActAgent extends Agent {
  private maxIterations: number;
  private iterationTimeout: number;
  private currentTasks: ReActTask[] = [];
  private toolScheduler?: CoreToolScheduler;
  
  constructor(config: ReActConfig) {
    super(config);
    this.maxIterations = config.maxIterations || 20;
    this.iterationTimeout = config.iterationTimeout || 60000; // 60秒
    
    // CoreToolSchedulerを初期化
    this.initializeToolScheduler();
  }

  /**
   * ツールスケジューラーの初期化
   */
  private initializeToolScheduler(): void {
    if (!this.toolRegistry) {
      logger.warn('ToolRegistry not available, approval UI will be limited');
      return;
    }

    this.toolScheduler = new CoreToolScheduler({
      toolRegistry: this.toolRegistry,
      outputUpdateHandler: (output: any) => {
        // 出力更新のハンドリング
        logger.debug('Tool output update:', output);
      },
      onToolCallsUpdate: (calls: TrackedToolCall[]) => {
        // ツール呼び出し状態の更新をハンドリング
        logger.debug('Tool calls updated:', calls.map(c => ({
          id: c.request.callId,
          status: c.status,
          tool: c.request.tool
        })));
      },
      onAllToolCallsComplete: () => {
        // すべてのツール呼び出しが完了
        logger.debug('All tool calls completed');
      },
      approvalMode: this.config.approvalMode || ApprovalMode.DEFAULT,
      getPreferredEditor: () => this.config.preferredEditor || 'vscode',
      config: this.config
    });
  }

  /**
   * ReActループを実行
   */
  async executeReActLoop(initialMessage: string): Promise<string> {
    logger.info('Starting ReAct loop');
    
    let iteration = 0;
    let finalResponse = '';
    
    // 初期タスクの設定
    await this.initializeTasks(initialMessage);
    
    // ReActループ - タスクが完了するまで継続
    while (!this.allTasksCompleted() && iteration < this.maxIterations) {
      iteration++;
      logger.info(`ReAct iteration ${iteration}/${this.maxIterations}`);
      
      try {
        // 1. Thought: 現在の状況を分析
        const thought = await this.think();
        logger.info(`Thought: ${thought}`);
        
        // 2. Action: 次のアクションを決定して実行
        const action = await this.decideAction();
        if (!action) {
          logger.info('No more actions needed');
          break;
        }
        
        logger.info(`Action: ${action.type} - ${action.description}`);
        const observation = await this.executeAction(action);
        
        // 3. Observation: 結果を観察
        logger.info(`Observation: ${observation}`);
        
        // 4. Update: タスクの状態を更新
        await this.updateTaskStatus(observation);
        
        // 結果を蓄積
        finalResponse = await this.synthesizeResponse();
        
        // タイムアウトチェック
        if (this.isTimeout()) {
          logger.warn('ReAct loop timeout');
          break;
        }
        
      } catch (error) {
        logger.error(`ReAct iteration ${iteration} failed:`, error);
        // エラーでも次のイテレーションを続行
      }
    }
    
    // 最終レポートの生成
    if (iteration >= this.maxIterations) {
      logger.warn(`ReAct loop reached maximum iterations (${this.maxIterations})`);
      finalResponse += '\n\n⚠️ 最大イテレーション数に達しました。';
    }
    
    finalResponse += this.generateFinalReport();
    
    logger.info(`ReAct loop completed after ${iteration} iterations`);
    return finalResponse;
  }

  /**
   * タスクの初期化
   */
  private async initializeTasks(message: string): Promise<void> {
    // TODOツールを使用してタスクを取得
    try {
      const todoResult = await this.mcpToolsHelper?.executeTool('todo_list', {});
      if (todoResult && Array.isArray(todoResult)) {
        this.currentTasks = todoResult.map((todo: any) => ({
          id: todo.id,
          description: todo.content || todo.description,
          status: todo.status
        }));
      }
    } catch (error) {
      logger.debug('Could not retrieve TODO list:', error);
    }
    
    // タスクがない場合は、メッセージから生成
    if (this.currentTasks.length === 0) {
      this.currentTasks = [{
        id: '1',
        description: message,
        status: 'pending'
      }];
    }
  }

  /**
   * 思考フェーズ
   */
  private async think(): Promise<string> {
    const pendingTasks = this.currentTasks.filter(t => 
      t.status === 'pending' || t.status === 'in_progress'
    );
    
    if (pendingTasks.length === 0) {
      return 'すべてのタスクが完了しました。';
    }
    
    const currentTask = pendingTasks[0];
    return `現在のタスク: ${currentTask.description} (${currentTask.status})`;
  }

  /**
   * アクション決定
   */
  private async decideAction(): Promise<any> {
    const pendingTasks = this.currentTasks.filter(t => 
      t.status === 'pending' || t.status === 'in_progress'
    );
    
    if (pendingTasks.length === 0) {
      return null;
    }
    
    // LLMにアクションを決定させる
    const prompt = `
現在のタスク: ${pendingTasks[0].description}
状態: ${pendingTasks[0].status}

次に実行すべきアクションを決定してください。
利用可能なツール: search, read_file, write_file, execute_command, todo_update

応答形式:
{
  "type": "ツール名",
  "description": "アクションの説明",
  "parameters": { ... }
}
`;
    
    const response = await this.chat(prompt);
    
    try {
      // レスポンスからJSONを抽出
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.debug('Could not parse action from response');
    }
    
    // デフォルトアクション
    return {
      type: 'think',
      description: '次のステップを検討中',
      parameters: {}
    };
  }

  /**
   * アクション実行（承認フロー対応）
   */
  private async executeAction(action: any): Promise<string> {
    try {
      if (action.type === 'think') {
        return 'Thinking...';
      }
      
      // ツールスケジューラーが利用可能な場合は承認フローを使用
      if (this.toolScheduler && this.toolRegistry) {
        // ツールが登録されているか確認
        const tool = this.toolRegistry.getTool(action.type);
        if (tool) {
          // ツール呼び出しをスケジュール
          const toolCall: ToolRequest = {
            callId: `react-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            tool: action.type,
            args: action.parameters || {}
          };
          
          // ツールをスケジュール（承認が必要な場合は待機）
          await this.toolScheduler.schedule([toolCall]);
          
          // 承認待ち状態の処理
          await this.handleApprovalProcess();
          
          // 実行結果を取得
          const completedCall = this.toolScheduler.toolCalls.find(
            c => c.request.callId === toolCall.callId
          );
          
          if (completedCall?.status === 'success' && completedCall.result) {
            return JSON.stringify(completedCall.result);
          } else if (completedCall?.status === 'error') {
            return `Action failed: ${completedCall.error}`;
          } else if (completedCall?.status === 'canceled') {
            return 'Action was canceled by user';
          }
        }
      }
      
      // フォールバック: 直接実行（後方互換性のため）
      const result = await this.mcpToolsHelper?.executeTool(
        action.type,
        action.parameters || {}
      );
      
      return JSON.stringify(result);
    } catch (error) {
      return `Action failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  /**
   * 承認プロセスの処理
   */
  private async handleApprovalProcess(): Promise<void> {
    if (!this.toolScheduler) return;
    
    // 承認待ちのツール呼び出しがあるか確認
    const awaitingApproval = this.toolScheduler.toolCalls.find(
      c => c.status === 'awaiting_approval'
    );
    
    if (awaitingApproval) {
      logger.info('⏳ ツール実行の承認待ち...');
      console.log('\n📋 実行承認が必要です:');
      console.log(`  ツール: ${awaitingApproval.request.tool}`);
      console.log(`  パラメータ: ${JSON.stringify(awaitingApproval.request.args, null, 2)}`);
      console.log('\n  [A] 承認 - 実行を承認');
      console.log('  [R] 拒否 - 実行をキャンセル');
      console.log('  [E] 編集 - パラメータを編集（実装予定）\n');
      
      // ここでユーザー入力を待つ必要がある
      // 実際の実装では、CLIのインタラクティブ入力または
      // UIコンポーネントからの応答を待つ
      
      // 仮の自動承認（デモ用）
      if (this.config.approvalMode === ApprovalMode.YOLO) {
        // YOLOモードでは自動承認
        await this.toolScheduler.handleConfirmationResponse(
          awaitingApproval.request.callId,
          ToolConfirmationOutcome.ProceedOnce
        );
      } else {
        // デフォルトでは一旦承認として進める（実際の実装では入力待ち）
        logger.info('⚠️ デモモード: 自動承認されました');
        await this.toolScheduler.handleConfirmationResponse(
          awaitingApproval.request.callId,
          ToolConfirmationOutcome.ProceedOnce
        );
      }
    }
    
    // ツール実行の完了を待つ
    await this.waitForToolCompletion();
  }

  /**
   * ツール実行の完了を待つ
   */
  private async waitForToolCompletion(): Promise<void> {
    if (!this.toolScheduler) return;
    
    // 実行中のツールがなくなるまで待つ
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        const hasRunning = this.toolScheduler!.toolCalls.some(
          c => c.status === 'executing' || c.status === 'awaiting_approval'
        );
        
        if (!hasRunning) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
      
      // タイムアウト設定
      setTimeout(() => {
        clearInterval(checkInterval);
        resolve();
      }, 30000); // 30秒でタイムアウト
    });
  }

  /**
   * タスク状態の更新
   */
  private async updateTaskStatus(observation: string): Promise<void> {
    // 成功を示すキーワードをチェック
    const successKeywords = ['completed', '完了', 'success', '成功', 'done'];
    const failureKeywords = ['failed', '失敗', 'error', 'エラー', 'canceled', 'キャンセル'];
    
    const currentTask = this.currentTasks.find(t => t.status === 'in_progress');
    if (!currentTask) {
      // in_progressがない場合は最初のpendingを開始
      const pendingTask = this.currentTasks.find(t => t.status === 'pending');
      if (pendingTask) {
        pendingTask.status = 'in_progress';
      }
      return;
    }
    
    const observationLower = observation.toLowerCase();
    
    if (successKeywords.some(keyword => observationLower.includes(keyword))) {
      currentTask.status = 'completed';
    } else if (failureKeywords.some(keyword => observationLower.includes(keyword))) {
      currentTask.status = 'failed';
    }
    
    // TODOツールで状態を更新
    try {
      await this.mcpToolsHelper?.executeTool('todo_update', {
        todos: this.currentTasks.map(t => ({
          id: t.id,
          content: t.description,
          status: t.status
        }))
      });
    } catch (error) {
      logger.debug('Could not update TODO list:', error);
    }
  }

  /**
   * レスポンスの合成
   */
  private async synthesizeResponse(): Promise<string> {
    const completed = this.currentTasks.filter(t => t.status === 'completed');
    const pending = this.currentTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
    const failed = this.currentTasks.filter(t => t.status === 'failed');
    
    let response = '';
    
    if (completed.length > 0) {
      response += `✅ 完了したタスク:\n`;
      completed.forEach(t => {
        response += `  - ${t.description}\n`;
      });
    }
    
    if (pending.length > 0) {
      response += `\n🔄 進行中のタスク:\n`;
      pending.forEach(t => {
        response += `  - ${t.description} (${t.status})\n`;
      });
    }
    
    if (failed.length > 0) {
      response += `\n❌ 失敗したタスク:\n`;
      failed.forEach(t => {
        response += `  - ${t.description}\n`;
      });
    }
    
    return response;
  }

  /**
   * すべてのタスクが完了したかチェック
   */
  private allTasksCompleted(): boolean {
    return this.currentTasks.every(t => 
      t.status === 'completed' || t.status === 'failed'
    );
  }

  /**
   * タイムアウトチェック
   */
  private isTimeout(): boolean {
    // 実装省略（開始時刻を記録して比較）
    return false;
  }

  /**
   * 最終レポートの生成
   */
  private generateFinalReport(): string {
    const completed = this.currentTasks.filter(t => t.status === 'completed').length;
    const failed = this.currentTasks.filter(t => t.status === 'failed').length;
    const pending = this.currentTasks.filter(t => 
      t.status === 'pending' || t.status === 'in_progress'
    ).length;
    
    return `

📊 最終結果:
  - 完了: ${completed}個
  - 失敗: ${failed}個
  - 未完了: ${pending}個
`;
  }
}
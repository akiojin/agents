/**
 * ReActパターンを実装したエージェント
 * 
 * Reasoning and Acting (ReAct) パターンに従い、
 * タスクが完了するまで思考と行動を繰り返します。
 */

import { Agent, AgentConfig } from './agent';
import { ChatMessage } from '../providers/base';
import { logger } from '../utils/logger';

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
  
  constructor(config: ReActConfig) {
    super(config);
    this.maxIterations = config.maxIterations || 20;
    this.iterationTimeout = config.iterationTimeout || 60000; // 60秒
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
   * アクション実行
   */
  private async executeAction(action: any): Promise<string> {
    try {
      if (action.type === 'think') {
        return 'Thinking...';
      }
      
      // MCPツールヘルパーを使用して実行（承認UIはCLI側で処理される）
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
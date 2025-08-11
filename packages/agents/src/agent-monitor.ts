/**
 * AgentMonitor - サブエージェントの実行状況を監視・表示
 * 
 * 機能:
 * - リアルタイムでエージェントの状態を追跡
 * - 並列実行中の全エージェントのステータスを一覧表示
 * - 実行進捗の視覚的な表示
 * - エージェント間の依存関係の可視化
 */

import chalk from 'chalk';
import { EventEmitter } from 'events';

// エージェントの実行状態
export enum AgentExecutionState {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  PLANNING = 'planning',
  EXECUTING = 'executing',
  WAITING = 'waiting',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// エージェントの実行情報
export interface AgentExecutionInfo {
  agentId: string;
  agentType: string;
  agentName: string;
  taskId: string;
  taskDescription: string;
  state: AgentExecutionState;
  currentStep?: string;
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  toolsUsed?: string[];
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
  parentAgentId?: string;
  childAgentIds?: string[];
  dependencies?: string[];
}

// 実行ステップ情報
export interface ExecutionStep {
  stepId: string;
  name: string;
  description?: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startTime?: Date;
  endTime?: Date;
  output?: string;
  error?: string;
}

// モニター設定
export interface MonitorConfig {
  updateInterval?: number;  // 更新間隔（ミリ秒）
  showDetails?: boolean;    // 詳細表示
  colorize?: boolean;       // 色付き表示
  groupByParent?: boolean;  // 親エージェントごとにグループ化
  maxHistorySize?: number;  // 履歴の最大サイズ
}

export class AgentMonitor extends EventEmitter {
  private static instance: AgentMonitor;
  private agents: Map<string, AgentExecutionInfo> = new Map();
  private executionHistory: AgentExecutionInfo[] = [];
  private config: MonitorConfig;
  private updateTimer?: NodeJS.Timer;
  private isMonitoring: boolean = false;

  private constructor(config: MonitorConfig = {}) {
    super();
    this.config = {
      updateInterval: 1000,
      showDetails: true,
      colorize: true,
      groupByParent: true,
      maxHistorySize: 100,
      ...config
    };
  }

  // シングルトンインスタンスを取得
  public static getInstance(config?: MonitorConfig): AgentMonitor {
    if (!AgentMonitor.instance) {
      AgentMonitor.instance = new AgentMonitor(config);
    }
    return AgentMonitor.instance;
  }

  // モニタリングを開始
  public startMonitoring(): void {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    this.updateTimer = setInterval(() => {
      this.displayStatus();
    }, this.config.updateInterval!);
    
    console.log(chalk.green('🔍 エージェントモニタリングを開始しました'));
    this.emit('monitoring-started');
  }

  // モニタリングを停止
  public stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
      this.updateTimer = undefined;
    }
    
    this.isMonitoring = false;
    console.log(chalk.yellow('🛑 エージェントモニタリングを停止しました'));
    this.emit('monitoring-stopped');
  }

  // エージェントを登録
  public registerAgent(info: AgentExecutionInfo): void {
    this.agents.set(info.agentId, info);
    
    // 親エージェントの子リストに追加
    if (info.parentAgentId) {
      const parent = this.agents.get(info.parentAgentId);
      if (parent) {
        if (!parent.childAgentIds) {
          parent.childAgentIds = [];
        }
        if (!parent.childAgentIds.includes(info.agentId)) {
          parent.childAgentIds.push(info.agentId);
        }
      }
    }
    
    this.emit('agent-registered', info);
    this.logAgentEvent(info, 'registered');
  }

  // エージェントの状態を更新
  public updateAgentState(
    agentId: string,
    state: AgentExecutionState,
    details?: Partial<AgentExecutionInfo>
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      console.warn(chalk.yellow(`⚠️ エージェント ${agentId} が見つかりません`));
      return;
    }
    
    const previousState = agent.state;
    agent.state = state;
    
    // 詳細情報を更新
    if (details) {
      Object.assign(agent, details);
    }
    
    // 状態変更時の処理
    switch (state) {
      case AgentExecutionState.EXECUTING:
        if (!agent.startTime) {
          agent.startTime = new Date();
        }
        break;
      case AgentExecutionState.COMPLETED:
      case AgentExecutionState.FAILED:
      case AgentExecutionState.CANCELLED:
        if (!agent.endTime) {
          agent.endTime = new Date();
          if (agent.startTime) {
            agent.duration = agent.endTime.getTime() - agent.startTime.getTime();
          }
        }
        // 履歴に追加
        this.addToHistory(agent);
        break;
    }
    
    this.emit('agent-state-changed', { agentId, previousState, newState: state, agent });
    this.logAgentEvent(agent, `state changed: ${previousState} -> ${state}`);
  }

  // エージェントの進捗を更新
  public updateAgentProgress(
    agentId: string,
    current: number,
    total: number,
    currentStep?: string
  ): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    agent.progress = {
      current,
      total,
      percentage: total > 0 ? Math.round((current / total) * 100) : 0
    };
    
    if (currentStep) {
      agent.currentStep = currentStep;
    }
    
    this.emit('agent-progress-updated', { agentId, progress: agent.progress, currentStep });
  }

  // ツール使用を記録
  public recordToolUsage(agentId: string, toolName: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    if (!agent.toolsUsed) {
      agent.toolsUsed = [];
    }
    
    if (!agent.toolsUsed.includes(toolName)) {
      agent.toolsUsed.push(toolName);
      this.emit('tool-used', { agentId, toolName });
    }
  }

  // エージェントを削除
  public removeAgent(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    
    // 親エージェントの子リストから削除
    if (agent.parentAgentId) {
      const parent = this.agents.get(agent.parentAgentId);
      if (parent && parent.childAgentIds) {
        parent.childAgentIds = parent.childAgentIds.filter(id => id !== agentId);
      }
    }
    
    // 子エージェントも削除
    if (agent.childAgentIds) {
      for (const childId of agent.childAgentIds) {
        this.removeAgent(childId);
      }
    }
    
    this.agents.delete(agentId);
    this.emit('agent-removed', agentId);
  }

  // 実行状況を表示
  public displayStatus(): void {
    if (this.agents.size === 0) return;
    
    console.clear();
    console.log(chalk.bold.cyan('\n═══════════════════════════════════════════════════════════════'));
    console.log(chalk.bold.cyan('                    エージェント実行状況モニター                    '));
    console.log(chalk.bold.cyan('═══════════════════════════════════════════════════════════════\n'));
    
    if (this.config.groupByParent) {
      this.displayGroupedAgents();
    } else {
      this.displayFlatAgents();
    }
    
    this.displaySummary();
  }

  // グループ化して表示
  private displayGroupedAgents(): void {
    const rootAgents = Array.from(this.agents.values())
      .filter(agent => !agent.parentAgentId);
    
    for (const agent of rootAgents) {
      this.displayAgentTree(agent, 0);
    }
  }

  // エージェントツリーを表示
  private displayAgentTree(agent: AgentExecutionInfo, depth: number): void {
    const indent = '  '.repeat(depth);
    const prefix = depth > 0 ? '├─ ' : '';
    
    // エージェント情報を表示
    const stateIcon = this.getStateIcon(agent.state);
    const stateColor = this.getStateColor(agent.state);
    
    console.log(
      indent + prefix +
      stateIcon + ' ' +
      chalk.bold(agent.agentName) +
      ' [' + chalk.gray(agent.agentType) + '] ' +
      stateColor(agent.state.toUpperCase())
    );
    
    // タスク説明を表示
    if (agent.taskDescription) {
      console.log(indent + '  ' + chalk.gray(`📝 ${agent.taskDescription}`));
    }
    
    // 現在のステップを表示
    if (agent.currentStep) {
      console.log(indent + '  ' + chalk.yellow(`→ ${agent.currentStep}`));
    }
    
    // 進捗を表示
    if (agent.progress && agent.state === AgentExecutionState.EXECUTING) {
      const progressBar = this.createProgressBar(agent.progress.percentage);
      console.log(
        indent + '  ' +
        progressBar + ' ' +
        chalk.cyan(`${agent.progress.percentage}%`) +
        chalk.gray(` (${agent.progress.current}/${agent.progress.total})`)
      );
    }
    
    // 実行時間を表示
    if (agent.startTime) {
      const duration = agent.duration || (Date.now() - agent.startTime.getTime());
      console.log(indent + '  ' + chalk.gray(`⏱️  ${this.formatDuration(duration)}`));
    }
    
    // ツール使用状況を表示
    if (agent.toolsUsed && agent.toolsUsed.length > 0 && this.config.showDetails) {
      console.log(indent + '  ' + chalk.gray(`🔧 ツール: ${agent.toolsUsed.join(', ')}`));
    }
    
    // エラーを表示
    if (agent.error) {
      console.log(indent + '  ' + chalk.red(`❌ エラー: ${agent.error}`));
    }
    
    console.log(); // 空行
    
    // 子エージェントを表示
    if (agent.childAgentIds) {
      for (const childId of agent.childAgentIds) {
        const child = this.agents.get(childId);
        if (child) {
          this.displayAgentTree(child, depth + 1);
        }
      }
    }
  }

  // フラット表示
  private displayFlatAgents(): void {
    const agents = Array.from(this.agents.values());
    
    for (const agent of agents) {
      const stateIcon = this.getStateIcon(agent.state);
      const stateColor = this.getStateColor(agent.state);
      
      console.log(
        stateIcon + ' ' +
        chalk.bold(agent.agentName) +
        ' [' + chalk.gray(agent.agentType) + '] ' +
        stateColor(agent.state.toUpperCase())
      );
      
      if (agent.taskDescription) {
        console.log('  ' + chalk.gray(`📝 ${agent.taskDescription}`));
      }
      
      if (agent.currentStep) {
        console.log('  ' + chalk.yellow(`→ ${agent.currentStep}`));
      }
      
      console.log(); // 空行
    }
  }

  // サマリーを表示
  private displaySummary(): void {
    const agents = Array.from(this.agents.values());
    const summary = {
      total: agents.length,
      idle: agents.filter(a => a.state === AgentExecutionState.IDLE).length,
      executing: agents.filter(a => a.state === AgentExecutionState.EXECUTING).length,
      completed: agents.filter(a => a.state === AgentExecutionState.COMPLETED).length,
      failed: agents.filter(a => a.state === AgentExecutionState.FAILED).length,
    };
    
    console.log(chalk.bold('\n📊 サマリー:'));
    console.log(
      '  合計: ' + chalk.cyan(summary.total) +
      ' | 実行中: ' + chalk.yellow(summary.executing) +
      ' | 完了: ' + chalk.green(summary.completed) +
      ' | 失敗: ' + chalk.red(summary.failed) +
      ' | 待機中: ' + chalk.gray(summary.idle)
    );
  }

  // 状態アイコンを取得
  private getStateIcon(state: AgentExecutionState): string {
    switch (state) {
      case AgentExecutionState.IDLE: return '⏸️';
      case AgentExecutionState.INITIALIZING: return '🔄';
      case AgentExecutionState.PLANNING: return '📋';
      case AgentExecutionState.EXECUTING: return '⚙️';
      case AgentExecutionState.WAITING: return '⏳';
      case AgentExecutionState.COMPLETED: return '✅';
      case AgentExecutionState.FAILED: return '❌';
      case AgentExecutionState.CANCELLED: return '🚫';
      default: return '❓';
    }
  }

  // 状態の色を取得
  private getStateColor(state: AgentExecutionState): (text: string) => string {
    switch (state) {
      case AgentExecutionState.IDLE: return chalk.gray;
      case AgentExecutionState.INITIALIZING: return chalk.blue;
      case AgentExecutionState.PLANNING: return chalk.cyan;
      case AgentExecutionState.EXECUTING: return chalk.yellow;
      case AgentExecutionState.WAITING: return chalk.magenta;
      case AgentExecutionState.COMPLETED: return chalk.green;
      case AgentExecutionState.FAILED: return chalk.red;
      case AgentExecutionState.CANCELLED: return chalk.strikethrough;
      default: return chalk.white;
    }
  }

  // プログレスバーを作成
  private createProgressBar(percentage: number): string {
    const width = 20;
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }

  // 時間をフォーマット
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}時間${minutes % 60}分${seconds % 60}秒`;
    } else if (minutes > 0) {
      return `${minutes}分${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  }

  // エージェントイベントをログ
  private logAgentEvent(agent: AgentExecutionInfo, event: string): void {
    if (!this.config.showDetails) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const message = `[${timestamp}] ${agent.agentName} (${agent.agentId}): ${event}`;
    
    // コンソールに出力しない（表示更新で上書きされるため）
    // 代わりにイベントとして発行
    this.emit('agent-log', { timestamp, agent, event, message });
  }

  // 履歴に追加
  private addToHistory(agent: AgentExecutionInfo): void {
    this.executionHistory.push({ ...agent });
    
    // 最大サイズを超えたら古いものを削除
    if (this.executionHistory.length > this.config.maxHistorySize!) {
      this.executionHistory.shift();
    }
  }

  // 実行履歴を取得
  public getExecutionHistory(): AgentExecutionInfo[] {
    return [...this.executionHistory];
  }

  // アクティブなエージェントを取得
  public getActiveAgents(): AgentExecutionInfo[] {
    return Array.from(this.agents.values())
      .filter(agent => 
        agent.state !== AgentExecutionState.COMPLETED &&
        agent.state !== AgentExecutionState.FAILED &&
        agent.state !== AgentExecutionState.CANCELLED
      );
  }

  // エージェント情報を取得
  public getAgent(agentId: string): AgentExecutionInfo | undefined {
    return this.agents.get(agentId);
  }

  // すべてのエージェントを取得
  public getAllAgents(): AgentExecutionInfo[] {
    return Array.from(this.agents.values());
  }

  // クリア
  public clear(): void {
    this.agents.clear();
    this.emit('cleared');
  }

  // リセット
  public reset(): void {
    this.stopMonitoring();
    this.clear();
    this.executionHistory = [];
    console.log(chalk.yellow('🔄 エージェントモニターをリセットしました'));
  }
}

// エクスポート
export default AgentMonitor;
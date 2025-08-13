/**
 * エージェントの状態管理システム
 * プランモードと実行モードの管理、フェーズとステップの追跡
 */

export enum AgentMode {
  PLANNING = 'planning',
  EXECUTION = 'execution',
  IDLE = 'idle'
}

export enum Phase {
  REQUIREMENTS = 'requirements',  // 要件定義
  DESIGN = 'design',              // 設計
  IMPLEMENTATION = 'implementation' // 実装
}

export enum StepState {
  LISTENING = 'listening',        // 聞く
  THINKING = 'thinking',          // 考える
  PRESENTING = 'presenting'       // 結果
}

export interface RequirementsContext {
  raw: string;              // ユーザーからの生の要求
  analyzed: string[];       // 分析された要件リスト
  confirmed: boolean;       // 要件確定フラグ
  clarifications?: string[]; // 確認事項
}

export interface DesignContext {
  architecture: string;     // アーキテクチャ設計
  technologies: string[];   // 使用技術スタック
  plan: string;            // 実装計画
  confirmed: boolean;      // 設計確定フラグ
  diagrams?: string[];     // 設計図（Mermaid等）
}

export interface ImplementationContext {
  progress: number;          // 実装進捗（0-100%）
  filesModified: string[];   // 変更されたファイル
  testsRun: boolean;        // テスト実行フラグ
  deploymentReady: boolean; // デプロイ準備完了フラグ
  currentTask?: string;     // 現在の作業内容
}

export interface StateTransition {
  from: {
    mode: AgentMode;
    phase: Phase;
    step: StepState;
  };
  to: {
    mode: AgentMode;
    phase: Phase;
    step: StepState;
  };
  timestamp: number;
  reason?: string;          // 遷移理由
}

export interface AgentState {
  mode: AgentMode;
  phase: Phase;
  step: StepState;
  context: {
    requirements?: RequirementsContext;
    design?: DesignContext;
    implementation?: ImplementationContext;
  };
  history: StateTransition[];
  sessionId: string;        // セッション識別子
  startTime: number;        // セッション開始時刻
}

export interface PlanApprovalData {
  requirements: string[];
  design: {
    architecture: string;
    technologies: string[];
    plan: string;
  };
  estimatedTime?: string;   // 実装予想時間
  riskAssessment?: string;  // リスク評価
}

export type ApprovalAction = 'approve' | 'reject' | 'edit';

export interface PlanApprovalResult {
  action: ApprovalAction;
  modifications?: string[]; // 編集時の修正要求
  comments?: string;       // ユーザーコメント
}
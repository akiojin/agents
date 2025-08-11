/**
 * 決定ログシステムの型定義
 */

/**
 * アクションタイプの列挙
 */
export enum ActionType {
  WriteFile = 'WriteFile',
  ReadFile = 'ReadFile',
  ExecuteCommand = 'ExecuteCommand',
  Search = 'Search',
  Analysis = 'Analysis',
  Planning = 'Planning',
  Decision = 'Decision',
  Learning = 'Learning',
  Other = 'Other'
}

/**
 * 実行結果の列挙
 */
export enum ResultType {
  Success = 'success',
  Failure = 'failure',
  Partial = 'partial',
  Pending = 'pending'
}

/**
 * アクション情報
 */
export interface Action {
  type: ActionType | string;
  target?: string;
  details?: Record<string, any>;
}

/**
 * 理由情報
 */
export interface Reason {
  direct: string;           // 直接的な理由
  userIntent?: string;      // ユーザーの意図
  context?: Record<string, any>; // コンテキスト情報
}

/**
 * 決定記録
 */
export interface Decision {
  id: number;
  timestamp: Date;
  
  // What
  action_type: string;
  action_target?: string;
  action_details?: string;  // JSON string
  
  // Why
  reason: string;
  user_intent?: string;
  context?: string;         // JSON string
  
  // Results
  result?: string;
  output?: string;
  error?: string;
  
  // Metadata
  session_id: string;
  project_path?: string;
  confidence?: number;
  importance?: number;
  
  // Relations
  parent_decision_id?: number;
}

/**
 * なぜチェーン（因果関係の連鎖）
 */
export interface WhyChain {
  chain: Decision[];        // 因果関係の連鎖
  summary: string;          // 要約説明
}

/**
 * パターン情報
 */
export interface Pattern {
  id?: number;
  pattern_type: string;
  pattern_data: any;
  frequency: number;
  success_rate?: number;
  last_seen?: Date;
}

/**
 * セッション情報
 */
export interface Session {
  id: string;
  started_at: Date;
  ended_at?: Date;
  project_path?: string;
  total_decisions: number;
  successful_decisions: number;
  failed_decisions: number;
  metadata?: Record<string, any>;
}

/**
 * 検索オプション
 */
export interface SearchOptions {
  limit?: number;
  offset?: number;
  actionTypes?: string[];
  sessionId?: string;
  projectPath?: string;
  startTime?: Date;
  endTime?: Date;
  includeChildren?: boolean;
  includeParents?: boolean;
}

/**
 * 検索結果
 */
export interface SearchResult {
  decision: Decision;
  relevance?: number;
  whyChain?: WhyChain;
}

/**
 * パターン検出オプション
 */
export interface PatternDetectionOptions {
  minFrequency?: number;    // 最小出現回数
  minSuccessRate?: number;  // 最小成功率
  timeWindow?: number;      // 時間窓（時間単位）
  patternTypes?: string[];  // 検出するパターンタイプ
}

/**
 * 統計情報
 */
export interface Statistics {
  totalDecisions: number;
  successRate: number;
  averageConfidence: number;
  mostFrequentActions: Array<{
    action_type: string;
    count: number;
    success_rate: number;
  }>;
  recentPatterns: Pattern[];
}
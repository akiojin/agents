/**
 * Front Matter対応ドキュメント管理システム用の型定義
 */

/**
 * ドキュメントタイプ
 */
export type DocType = 'adr' | 'spec' | 'howto' | 'runbook' | 'note';

/**
 * ドキュメントステータス
 */
export type DocStatus = 'draft' | 'active' | 'deprecated';

/**
 * Front Matterメタデータ
 */
export interface FrontMatter {
  /** ドキュメントID（形式: AGENTS-AREA-TYPE-YYYYMMDD-NNN） */
  doc_id: string;
  
  /** ドキュメントタイトル */
  title: string;
  
  /** ドキュメントタイプ */
  type: DocType;
  
  /** ドキュメントステータス */
  status: DocStatus;
  
  /** 所有者 */
  owner: string;
  
  /** タグ一覧 */
  tags: string[];
  
  /** このドキュメントが置き換える旧ドキュメントのID */
  supersedes: string[];
  
  /** このドキュメントを置き換える新ドキュメントのID */
  superseded_by: string[];
  
  /** 3行以内の要約 */
  summary: string;
  
  /** 作成日 */
  created: string; // YYYY-MM-DD形式
  
  /** 最終レビュー日 */
  last_review: string; // YYYY-MM-DD形式
  
  /** 次回レビュー予定日 */
  next_review: string; // YYYY-MM-DD形式
}

/**
 * ドキュメント構造
 */
export interface Document {
  /** Front Matterメタデータ */
  frontMatter: FrontMatter;
  
  /** ドキュメント本文（Markdown） */
  content: string;
  
  /** ファイルパス */
  filePath?: string;
  
  /** 作成日時 */
  createdAt: Date;
  
  /** 更新日時 */
  updatedAt: Date;
}

/**
 * ドキュメント検索結果
 */
export interface SearchResult {
  /** ドキュメント */
  document: Document;
  
  /** 類似度スコア（0.0-1.0） */
  similarity: number;
  
  /** マッチした箇所 */
  matches: {
    field: keyof FrontMatter | 'content';
    text: string;
    position?: number;
  }[];
}

/**
 * 重複検知結果
 */
export interface DuplicateResult {
  /** 既存ドキュメント */
  existing: Document;
  
  /** 類似度スコア（0.0-1.0） */
  similarity: number;
  
  /** 重複の理由 */
  reason: 'title_match' | 'content_similarity' | 'tag_overlap' | 'summary_match';
  
  /** 推奨アクション */
  recommendation: 'merge' | 'update_existing' | 'create_new' | 'review_required';
}

/**
 * ドキュメントテンプレート
 */
export interface DocumentTemplate {
  /** テンプレートタイプ */
  type: DocType;
  
  /** テンプレート名 */
  name: string;
  
  /** Front Matterテンプレート */
  frontMatter: Partial<FrontMatter>;
  
  /** コンテンツテンプレート */
  contentTemplate: string;
  
  /** 説明 */
  description?: string;
}

/**
 * ドキュメント生成オプション
 */
export interface DocumentGenerationOptions {
  /** ベースとなるテンプレート */
  template?: DocType;
  
  /** 自動ID生成 */
  autoGenerateId?: boolean;
  
  /** 自動タグ推定 */
  autoTagging?: boolean;
  
  /** レビュー期間（月） */
  reviewIntervalMonths?: number;
  
  /** 重複チェック閾値 */
  duplicateThreshold?: number;
}

/**
 * ドキュメントライフサイクル設定
 */
export interface DocumentLifecycleConfig {
  /** デフォルトレビュー間隔（月） */
  defaultReviewInterval: number;
  
  /** 自動アーカイブ期間（月） */
  autoArchiveAfter: number;
  
  /** 重複検知閾値 */
  duplicateThreshold: number;
  
  /** 必須タグ */
  requiredTags: string[];
  
  /** 禁止文字パターン */
  forbiddenPatterns: string[];
}

/**
 * ドキュメント統計
 */
export interface DocumentStats {
  /** 総ドキュメント数 */
  total: number;
  
  /** タイプ別統計 */
  byType: Record<DocType, number>;
  
  /** ステータス別統計 */
  byStatus: Record<DocStatus, number>;
  
  /** レビュー期限切れ */
  expiredReviews: number;
  
  /** 最近の更新数（30日以内） */
  recentUpdates: number;
}
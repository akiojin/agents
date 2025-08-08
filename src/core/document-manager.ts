/**
 * Serenaベースドキュメント管理システム
 * Front Matterを活用したドキュメント管理とChatGPT提案の重複防止システム
 */

import type { 
  Document, 
  FrontMatter, 
  DocType,
  SearchResult, 
  DuplicateResult, 
  DocumentTemplate,
  DocumentGenerationOptions,
  DocumentStats
} from '../types/document.js';
import { 
  parseFrontMatter, 
  generateMarkdown, 
  validateFrontMatter, 
  generateDocumentId,
  calculateSimilarity 
} from '../utils/front-matter.js';
import { logger } from '../utils/logger.js';

/**
 * ドキュメント管理マネージャー
 * Serena MCPと連携してドキュメントのライフサイクルを管理
 */
export class DocumentManager {
  private documents: Map<string, Document> = new Map();
  private templates: Map<DocType, DocumentTemplate> = new Map();
  
  constructor() {
    this.initializeTemplates();
  }

  /**
   * ドキュメントテンプレートを初期化
   */
  private initializeTemplates(): void {
    // ADR（Architecture Decision Record）テンプレート
    this.templates.set('adr', {
      type: 'adr',
      name: 'Architecture Decision Record',
      frontMatter: {
        type: 'adr',
        status: 'draft',
        owner: 'system',
        tags: ['architecture', 'decision'],
        supersedes: [],
        superseded_by: []
      },
      contentTemplate: `## Context

背景と課題を記述

## Options

検討した選択肢
- 選択肢1: 説明
- 選択肢2: 説明

## Decision

決定した内容とその理由

## Consequences

この決定による影響・結果
- 良い影響:
- 悪い影響:
- リスク:`,
      description: '重要な設計決定を記録するためのテンプレート'
    });

    // SPEC（仕様書）テンプレート
    this.templates.set('spec', {
      type: 'spec',
      name: 'Specification Document',
      frontMatter: {
        type: 'spec',
        status: 'draft',
        owner: 'system',
        tags: ['specification'],
        supersedes: [],
        superseded_by: []
      },
      contentTemplate: `## Goal / Non-Goals

### Goals
- 目標1
- 目標2

### Non-Goals
- 対象外1

## User Story / Flows

### User Story
- As a [user type], I want [goal] so that [benefit]

### Flows
1. ステップ1
2. ステップ2

## API/Schema

### API仕様
\`\`\`
接続 API 仕様を記述
\`\`\`

## Open Questions

- 未解決の課題1
- 未解決の課題2`,
      description: '機能仕様やAPI仕様を記録するためのテンプレート'
    });

    // HOWTO（手順書）テンプレート  
    this.templates.set('howto', {
      type: 'howto',
      name: 'How-to Guide',
      frontMatter: {
        type: 'howto',
        status: 'draft',
        owner: 'system',
        tags: ['howto', 'guide'],
        supersedes: [],
        superseded_by: []
      },
      contentTemplate: `## 概要

この手順書の目的と対象者

## 前提条件

- 前提条件1
- 前提条件2

## 手順

### ステップ1: タイトル
詳細な手順と注意点

\`\`\`bash
コマンド例
\`\`\`

### ステップ2: タイトル
詳細な手順

## トラブルシューティング

よくある問題と解決策

## 関連ドキュメント

- [関連ドキュメント1](link)`,
      description: '操作手順や設定方法を記録するためのテンプレート'
    });

    // RUNBOOK（運用手順書）テンプレート
    this.templates.set('runbook', {
      type: 'runbook',
      name: 'Runbook',
      frontMatter: {
        type: 'runbook',
        status: 'draft',
        owner: 'system',
        tags: ['runbook', 'operations'],
        supersedes: [],
        superseded_by: []
      },
      contentTemplate: `## Triggers

この手順が必要となる状況・トリガー

## Step-by-step

### 1. 初期確認
- 確認項目1
- 確認項目2

### 2. 対応手順
詳細な対応手順

\`\`\`bash
実行コマンド
\`\`\`

### 3. 確認・検証
対応完了の確認方法

## Rollback

問題が発生した場合のロールバック手順

## Oncall Contacts

- 担当者1: 連絡先
- エスカレーション先: 連絡先`,
      description: '運用・障害対応の手順を記録するためのテンプレート'
    });

    // NOTE（メモ）テンプレート
    this.templates.set('note', {
      type: 'note',
      name: 'Note',
      frontMatter: {
        type: 'note',
        status: 'draft',
        owner: 'system',
        tags: ['note'],
        supersedes: [],
        superseded_by: []
      },
      contentTemplate: `## 内容

メモ内容を記述

## TODO
- [ ] やること1
- [ ] やること2

## 参考
- 参考資料1
- 参考資料2`,
      description: '会議メモや一時的なメモを記録するためのテンプレート'
    });

    logger.debug(`ドキュメントテンプレート初期化完了: ${this.templates.size}個`);
  }

  /**
   * 新しいドキュメントを作成（重複チェック付き）
   */
  async createDocument(
    type: DocType,
    title: string,
    content: string,
    options: DocumentGenerationOptions = {}
  ): Promise<Document> {
    try {
      // 重複チェック
      if (options.duplicateThreshold !== undefined) {
        const duplicates = await this.checkDuplicates(
          { title, content, type },
          options.duplicateThreshold
        );
        
        if (duplicates.length > 0) {
          logger.warn(`重複の可能性があるドキュメントを検出: ${duplicates.length}件`);
          // 実際の実装では、ここで重複処理のフローに入る
        }
      }

      // テンプレートの取得
      const template = this.templates.get(type);
      if (!template) {
        throw new Error(`未知のドキュメントタイプ: ${type}`);
      }

      // Front Matterの生成
      const now = new Date();
      const docId = options.autoGenerateId !== false 
        ? this.generateUniqueDocumentId('CORE', type, now)
        : '';

      const frontMatter: FrontMatter = {
        ...template.frontMatter,
        doc_id: docId,
        title,
        summary: this.extractSummary(content),
        created: now.toISOString().slice(0, 10),
        last_review: now.toISOString().slice(0, 10),
        next_review: this.calculateNextReview(now, options.reviewIntervalMonths || 3),
        tags: options.autoTagging ? this.generateAutoTags(title, content, type) : template.frontMatter.tags || []
      };

      // ドキュメントオブジェクトの作成
      const document: Document = {
        frontMatter,
        content: content || template.contentTemplate,
        createdAt: now,
        updatedAt: now
      };

      // メモリに保存
      this.documents.set(docId, document);

      logger.info(`新しいドキュメントを作成: ${docId} - ${title}`);
      return document;

    } catch (error) {
      logger.error('ドキュメント作成エラー:', error);
      throw error;
    }
  }

  /**
   * ドキュメント検索（Front MatterとContentから検索）
   */
  async searchDocuments(
    query: string,
    options: {
      similarity?: number;
      type?: DocType;
      status?: string;
      tags?: string[];
      limit?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];
    const minSimilarity = options.similarity || 0.3;

    for (const [id, doc] of this.documents) {
      // 基本フィルタリング
      if (options.type && doc.frontMatter.type !== options.type) continue;
      if (options.status && doc.frontMatter.status !== options.status) continue;
      if (options.tags && !options.tags.every(tag => doc.frontMatter.tags.includes(tag))) continue;

      // 類似度計算
      const similarity = this.calculateDocumentSimilarity(query, doc);
      
      if (similarity >= minSimilarity) {
        results.push({
          document: doc,
          similarity,
          matches: this.findMatches(query, doc)
        });
      }
    }

    // 類似度でソート
    results.sort((a, b) => b.similarity - a.similarity);

    // 結果数制限
    const limit = options.limit || 10;
    return results.slice(0, limit);
  }

  /**
   * 重複チェック
   */
  async checkDuplicates(
    docInfo: { title: string; content: string; type: DocType },
    threshold: number = 0.8
  ): Promise<DuplicateResult[]> {
    const duplicates: DuplicateResult[] = [];

    for (const [id, existing] of this.documents) {
      // 完全に同じタイプのみチェック
      if (existing.frontMatter.type !== docInfo.type) continue;

      const similarity = this.calculateContentSimilarity(docInfo, existing);
      
      if (similarity >= threshold) {
        duplicates.push({
          existing,
          similarity,
          reason: this.determineDuplicateReason(docInfo, existing, similarity),
          recommendation: this.getRecommendation(similarity)
        });
      }
    }

    return duplicates.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * ドキュメント統計を取得
   */
  getDocumentStats(): DocumentStats {
    const stats: DocumentStats = {
      total: this.documents.size,
      byType: { adr: 0, spec: 0, howto: 0, runbook: 0, note: 0 },
      byStatus: { draft: 0, active: 0, deprecated: 0 },
      expiredReviews: 0,
      recentUpdates: 0
    };

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const doc of this.documents.values()) {
      // タイプ別統計
      stats.byType[doc.frontMatter.type]++;
      
      // ステータス別統計
      stats.byStatus[doc.frontMatter.status]++;
      
      // レビュー期限切れチェック
      if (new Date(doc.frontMatter.next_review) < now) {
        stats.expiredReviews++;
      }
      
      // 最近の更新チェック
      if (doc.updatedAt > thirtyDaysAgo) {
        stats.recentUpdates++;
      }
    }

    return stats;
  }

  /**
   * 期限切れドキュメント一覧を取得
   */
  getExpiredDocuments(): Document[] {
    const now = new Date();
    return Array.from(this.documents.values()).filter(
      doc => new Date(doc.frontMatter.next_review) < now
    );
  }

  // プライベートメソッド

  private generateUniqueDocumentId(area: string, type: DocType, date: Date): string {
    let sequence = 1;
    let docId: string;
    
    do {
      const sequenceStr = sequence.toString().padStart(3, '0');
      const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
      docId = `AGENTS-${area.toUpperCase()}-${type.toUpperCase()}-${dateStr}-${sequenceStr}`;
      sequence++;
    } while (this.documents.has(docId));
    
    return docId;
  }

  private extractSummary(content: string): string {
    const lines = content.split('\n').filter(line => line.trim());
    const summary = lines.slice(0, 3).join(' ').substring(0, 200);
    return summary + (summary.length === 200 ? '...' : '');
  }

  private calculateNextReview(date: Date, monthsLater: number): string {
    const nextDate = new Date(date);
    nextDate.setMonth(nextDate.getMonth() + monthsLater);
    return nextDate.toISOString().slice(0, 10);
  }

  private generateAutoTags(title: string, content: string, type: DocType): string[] {
    const tags = [type];
    const text = `${title} ${content}`.toLowerCase();
    
    // キーワードベースの自動タグ付け
    const tagKeywords = {
      'api': ['api', 'endpoint', 'rest', 'graphql'],
      'database': ['database', 'sql', 'mongodb', 'postgres'],
      'security': ['security', 'authentication', 'authorization', 'oauth'],
      'performance': ['performance', 'optimization', 'cache', 'speed'],
      'testing': ['test', 'testing', 'jest', 'cypress'],
      'deployment': ['deploy', 'deployment', 'ci/cd', 'docker'],
      'monitoring': ['monitoring', 'logging', 'metrics', 'alert']
    };

    for (const [tag, keywords] of Object.entries(tagKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        tags.push(tag);
      }
    }

    return tags;
  }

  private calculateDocumentSimilarity(query: string, doc: Document): number {
    const queryLower = query.toLowerCase();
    let score = 0;

    // タイトルマッチ（重み: 40%）
    if (doc.frontMatter.title.toLowerCase().includes(queryLower)) {
      score += 0.4;
    }

    // サマリーマッチ（重み: 30%）
    if (doc.frontMatter.summary.toLowerCase().includes(queryLower)) {
      score += 0.3;
    }

    // コンテンツマッチ（重み: 20%）
    if (doc.content.toLowerCase().includes(queryLower)) {
      score += 0.2;
    }

    // タグマッチ（重み: 10%）
    if (doc.frontMatter.tags.some(tag => tag.toLowerCase().includes(queryLower))) {
      score += 0.1;
    }

    return score;
  }

  private findMatches(query: string, doc: Document): SearchResult['matches'] {
    const matches: SearchResult['matches'] = [];
    const queryLower = query.toLowerCase();

    // Front Matterフィールドでのマッチを検索
    const frontMatterFields: (keyof FrontMatter)[] = ['title', 'summary'];
    for (const field of frontMatterFields) {
      const fieldValue = String(doc.frontMatter[field]);
      if (fieldValue.toLowerCase().includes(queryLower)) {
        matches.push({
          field,
          text: fieldValue,
          position: fieldValue.toLowerCase().indexOf(queryLower)
        });
      }
    }

    // コンテンツでのマッチを検索
    if (doc.content.toLowerCase().includes(queryLower)) {
      const position = doc.content.toLowerCase().indexOf(queryLower);
      const start = Math.max(0, position - 50);
      const end = Math.min(doc.content.length, position + 50);
      matches.push({
        field: 'content',
        text: doc.content.substring(start, end),
        position
      });
    }

    return matches;
  }

  private calculateContentSimilarity(docInfo: { title: string; content: string }, existing: Document): number {
    // タイトルの類似度
    const titleSim = calculateSimilarity(
      { title: docInfo.title } as FrontMatter,
      { title: existing.frontMatter.title } as FrontMatter
    );

    // コンテンツの類似度（シンプルな実装）
    const contentSim = this.simpleContentSimilarity(docInfo.content, existing.content);

    return (titleSim * 0.6) + (contentSim * 0.4);
  }

  private simpleContentSimilarity(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/));
    const words2 = new Set(content2.toLowerCase().split(/\s+/));
    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private determineDuplicateReason(
    docInfo: { title: string; content: string },
    existing: Document,
    similarity: number
  ): DuplicateResult['reason'] {
    if (docInfo.title === existing.frontMatter.title) {
      return 'title_match';
    }
    
    if (similarity > 0.9) {
      return 'content_similarity';
    }
    
    // その他の理由は実装に応じて追加
    return 'content_similarity';
  }

  private getRecommendation(similarity: number): DuplicateResult['recommendation'] {
    if (similarity > 0.95) {
      return 'update_existing';
    } else if (similarity > 0.85) {
      return 'review_required';
    } else if (similarity > 0.7) {
      return 'merge';
    } else {
      return 'create_new';
    }
  }
}
/**
 * Front Matter解析ユーティリティ
 * YAMLライブラリを使用してFront Matterを解析・生成
 */

import { parse, stringify } from 'yaml';
import type { FrontMatter, Document } from '../types/document.js';

/**
 * Front Matter解析結果
 */
export interface ParseResult {
  /** Front Matterメタデータ */
  frontMatter: FrontMatter | null;
  
  /** ドキュメント本文 */
  content: string;
  
  /** 元のMarkdownテキスト */
  raw: string;
}

/**
 * Front Matter区切り文字のパターン
 */
const FRONT_MATTER_DELIMITER = /^---\s*$/;

/**
 * Markdownテキストを解析してFront Matterとコンテンツに分離
 */
export function parseFrontMatter(markdown: string): ParseResult {
  const lines = markdown.split('\n');
  
  // Front Matterが存在するかチェック
  if (!lines[0] || !FRONT_MATTER_DELIMITER.test(lines[0])) {
    return {
      frontMatter: null,
      content: markdown,
      raw: markdown
    };
  }
  
  // 終了区切り文字を探す
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FRONT_MATTER_DELIMITER.test(lines[i])) {
      endIndex = i;
      break;
    }
  }
  
  if (endIndex === -1) {
    // 終了区切り文字が見つからない場合は通常のマークダウンとして扱う
    return {
      frontMatter: null,
      content: markdown,
      raw: markdown
    };
  }
  
  try {
    // Front Matter部分を抽出してYAMLとして解析
    const frontMatterYaml = lines.slice(1, endIndex).join('\n');
    const frontMatter = parse(frontMatterYaml) as FrontMatter;
    
    // コンテンツ部分を抽出
    const content = lines.slice(endIndex + 1).join('\n').trim();
    
    // 基本的なバリデーション
    if (!validateFrontMatter(frontMatter)) {
      throw new Error('Invalid front matter structure');
    }
    
    return {
      frontMatter,
      content,
      raw: markdown
    };
  } catch (error) {
    throw new Error(`Front matter parsing error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Front MatterとコンテンツからMarkdownを生成
 */
export function generateMarkdown(frontMatter: FrontMatter, content: string): string {
  const yamlContent = stringify(frontMatter, {
    indent: 2,
    lineWidth: 120,
    minContentWidth: 20
  });
  
  return `---\n${yamlContent}---\n\n${content}`;
}

/**
 * Front Matterの基本バリデーション
 */
export function validateFrontMatter(frontMatter: any): frontMatter is FrontMatter {
  if (!frontMatter || typeof frontMatter !== 'object') {
    return false;
  }
  
  const required = ['doc_id', 'title', 'type', 'status', 'owner', 'summary', 'created'];
  for (const field of required) {
    if (!(field in frontMatter) || !frontMatter[field]) {
      return false;
    }
  }
  
  // 配列フィールドの検証
  const arrayFields = ['tags', 'supersedes', 'superseded_by'];
  for (const field of arrayFields) {
    if (frontMatter[field] && !Array.isArray(frontMatter[field])) {
      return false;
    }
  }
  
  // 日付フィールドの簡単な検証
  const dateFields = ['created', 'last_review', 'next_review'];
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  for (const field of dateFields) {
    if (frontMatter[field] && !dateRegex.test(frontMatter[field])) {
      return false;
    }
  }
  
  // doc_idフォーマットの検証
  const docIdRegex = /^AGENTS-[A-Z]+-[A-Z]+-\d{8}-\d{3}$/;
  if (!docIdRegex.test(frontMatter.doc_id)) {
    return false;
  }
  
  return true;
}

/**
 * ドキュメントIDを生成
 */
export function generateDocumentId(area: string, type: string, date?: Date): string {
  const targetDate = date || new Date();
  const dateStr = targetDate.toISOString().slice(0, 10).replace(/-/g, '');
  
  // 連番は外部で管理（既存ドキュメントとの重複チェックが必要）
  const sequence = '001'; // プレースホルダー
  
  return `AGENTS-${area.toUpperCase()}-${type.toUpperCase()}-${dateStr}-${sequence}`;
}

/**
 * Front Matterの更新
 */
export function updateFrontMatter(
  original: FrontMatter,
  updates: Partial<FrontMatter>
): FrontMatter {
  const updated = { ...original, ...updates };
  
  // last_reviewとnext_reviewを自動更新
  if (updates.last_review) {
    const reviewDate = new Date(updates.last_review);
    reviewDate.setMonth(reviewDate.getMonth() + 3); // デフォルト3ヶ月後
    updated.next_review = reviewDate.toISOString().slice(0, 10);
  }
  
  return updated;
}

/**
 * ドキュメント同士の類似度を計算（シンプルな実装）
 */
export function calculateSimilarity(doc1: FrontMatter, doc2: FrontMatter): number {
  let score = 0;
  let maxScore = 0;
  
  // タイトルの類似度（重み: 30%）
  const titleWeight = 0.3;
  const titleSimilarity = calculateStringSimilarity(doc1.title, doc2.title);
  score += titleSimilarity * titleWeight;
  maxScore += titleWeight;
  
  // サマリーの類似度（重み: 25%）
  const summaryWeight = 0.25;
  const summarySimilarity = calculateStringSimilarity(doc1.summary, doc2.summary);
  score += summarySimilarity * summaryWeight;
  maxScore += summaryWeight;
  
  // タグの重複度（重み: 20%）
  const tagWeight = 0.2;
  const commonTags = doc1.tags.filter(tag => doc2.tags.includes(tag));
  const tagSimilarity = commonTags.length / Math.max(doc1.tags.length, doc2.tags.length, 1);
  score += tagSimilarity * tagWeight;
  maxScore += tagWeight;
  
  // タイプの一致（重み: 15%）
  const typeWeight = 0.15;
  if (doc1.type === doc2.type) {
    score += typeWeight;
  }
  maxScore += typeWeight;
  
  // 所有者の一致（重み: 10%）
  const ownerWeight = 0.1;
  if (doc1.owner === doc2.owner) {
    score += ownerWeight;
  }
  maxScore += ownerWeight;
  
  return maxScore > 0 ? score / maxScore : 0;
}

/**
 * 文字列間の類似度を計算（シンプルなレーベンシュタイン距離ベース）
 */
export function calculateStringSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;
  
  const matrix = Array(str2.length + 1).fill(null).map(() => 
    Array(str1.length + 1).fill(null)
  );
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      if (str1[i - 1] === str2[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1, // 置換
          matrix[j][i - 1] + 1,     // 挿入
          matrix[j - 1][i] + 1      // 削除
        );
      }
    }
  }
  
  const distance = matrix[str2.length][str1.length];
  const maxLength = Math.max(str1.length, str2.length);
  
  return 1 - distance / maxLength;
}

/**
 * Front Matterのデバッグ表示
 */
export function debugFrontMatter(frontMatter: FrontMatter): string {
  return `Document: ${frontMatter.doc_id}
Title: ${frontMatter.title}
Type: ${frontMatter.type} | Status: ${frontMatter.status}
Owner: ${frontMatter.owner}
Tags: [${frontMatter.tags.join(', ')}]
Created: ${frontMatter.created} | Review: ${frontMatter.next_review}
Summary: ${frontMatter.summary.substring(0, 100)}...`;
}
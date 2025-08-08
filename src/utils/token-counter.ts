/**
 * トークン使用量をカウントするユーティリティ
 */

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  thoughtsTokens: number;
  totalTokens: number;
}

export interface SessionStats {
  turns: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalThoughtsTokens: number;
  totalTokens: number;
  apiDuration: number; // milliseconds
  wallDuration: number; // milliseconds
  startTime: number;
}

/**
 * 簡易的なトークンカウント（実際のトークナイザーの代わり）
 * 日本語: 1文字 = 約2トークン
 * 英語: 1単語 = 約1.3トークン
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // 日本語文字の数をカウント
  const japaneseChars = (text.match(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/g) || []).length;
  
  // 英語の単語数をカウント（日本語を除いた部分）
  const englishText = text.replace(/[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf\u3400-\u4dbf]/g, ' ');
  const englishWords = englishText.trim().split(/\s+/).filter(w => w.length > 0).length;
  
  // トークン数を推定
  return Math.ceil(japaneseChars * 2 + englishWords * 1.3);
}

export class TokenCounter {
  private sessionStats: SessionStats;

  constructor() {
    this.sessionStats = {
      turns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalThoughtsTokens: 0,
      totalTokens: 0,
      apiDuration: 0,
      wallDuration: 0,
      startTime: Date.now(),
    };
  }

  /**
   * 入力トークンを追加
   */
  addInput(text: string): void {
    const tokens = estimateTokens(text);
    this.sessionStats.totalInputTokens += tokens;
    this.sessionStats.totalTokens += tokens;
  }

  /**
   * 出力トークンを追加
   */
  addOutput(text: string): void {
    const tokens = estimateTokens(text);
    this.sessionStats.totalOutputTokens += tokens;
    this.sessionStats.totalTokens += tokens;
  }

  /**
   * 思考トークンを追加（将来の拡張用）
   */
  addThoughts(text: string): void {
    const tokens = estimateTokens(text);
    this.sessionStats.totalThoughtsTokens += tokens;
    this.sessionStats.totalTokens += tokens;
  }

  /**
   * ターンを増やす
   */
  incrementTurn(): void {
    this.sessionStats.turns++;
  }

  /**
   * API呼び出し時間を追加
   */
  addApiDuration(duration: number): void {
    this.sessionStats.apiDuration += duration;
  }

  /**
   * セッション統計を取得
   */
  getStats(): SessionStats {
    this.sessionStats.wallDuration = Date.now() - this.sessionStats.startTime;
    return { ...this.sessionStats };
  }

  /**
   * 統計をリセット
   */
  reset(): void {
    this.sessionStats = {
      turns: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalThoughtsTokens: 0,
      totalTokens: 0,
      apiDuration: 0,
      wallDuration: 0,
      startTime: Date.now(),
    };
  }

  /**
   * 統計をフォーマットして表示用文字列を生成
   */
  formatStats(): string {
    const stats = this.getStats();
    const apiSeconds = (stats.apiDuration / 1000).toFixed(1);
    const wallSeconds = (stats.wallDuration / 1000).toFixed(1);

    // 各数値の最大幅を計算
    const maxTokens = Math.max(
      stats.totalInputTokens,
      stats.totalOutputTokens,
      stats.totalThoughtsTokens,
      stats.totalTokens
    );
    const tokenWidth = Math.max(5, maxTokens.toString().length);

    const lines = [
      '+-----------------------------------+',
      '|                                   |',
      '|  Agent powering down. Goodbye!    |',
      '|                                   |',
      '|                                   |',
      `|  Cumulative Stats (${stats.turns} Turns)${' '.repeat(Math.max(0, 7 - stats.turns.toString().length))}    |`,
      '|                                   |',
      `|  Input Tokens       ${stats.totalInputTokens.toString().padStart(tokenWidth)}      |`,
      `|  Output Tokens      ${stats.totalOutputTokens.toString().padStart(tokenWidth)}      |`,
      `|  Thoughts Tokens    ${stats.totalThoughtsTokens.toString().padStart(tokenWidth)}      |`,
      '|  -----------------------------    |',
      `|  Total Tokens       ${stats.totalTokens.toString().padStart(tokenWidth)}      |`,
      '|                                   |',
      `|  Total duration (API)   ${apiSeconds.padStart(4)}s      |`,
      `|  Total duration (wall)  ${wallSeconds.padStart(4)}s      |`,
      '|                                   |',
      '+-----------------------------------+'
    ];

    return lines.join('\n');
  }
}
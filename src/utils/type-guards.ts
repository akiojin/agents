/**
 * 型ガードユーティリティ
 * TypeScriptの型安全性を向上させるためのヘルパー関数
 */

import type { Config } from '../config/types.js';

/**
 * エラーオブジェクトの型ガード
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * HTTPステータスコードを持つエラーの型ガード
 */
export function isHttpError(error: unknown): error is Error & { status: number } {
  return (
    error instanceof Error &&
    typeof (error as any).status === 'number'
  );
}

/**
 * 非nullかつundefinedでない値の型ガード
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * 文字列の型ガード
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * 数値の型ガード
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * ブール値の型ガード
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * オブジェクトの型ガード
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 配列の型ガード
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * プロバイダー名の型ガード
 */
export function isValidProvider(value: unknown): value is Config['llm']['provider'] {
  return (
    isString(value) &&
    ['openai', 'anthropic', 'local-gptoss', 'local-lmstudio'].includes(value)
  );
}

/**
 * ログレベルの型ガード
 */
export function isValidLogLevel(value: unknown): value is Config['app']['logLevel'] {
  return (
    isString(value) &&
    ['debug', 'info', 'warn', 'error'].includes(value)
  );
}

/**
 * 環境変数の値が存在し、空でないかチェック
 */
export function isValidEnvValue(value: string | undefined): value is string {
  return isDefined(value) && value.trim() !== '';
}

/**
 * APIキーのバリデーション（空でない文字列かチェック）
 */
export function isValidApiKey(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

/**
 * URLのバリデーション（基本的なURLフォーマットチェック）
 */
export function isValidUrl(value: unknown): value is string {
  if (!isString(value)) return false;
  
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * ポート番号のバリデーション
 */
export function isValidPort(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 65535
  );
}

/**
 * ファイルパスのバリデーション（空でない文字列かチェック）
 */
export function isValidFilePath(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

/**
 * 正の整数の型ガード
 */
export function isPositiveInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value > 0;
}

/**
 * 非負の整数の型ガード
 */
export function isNonNegativeInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value) && value >= 0;
}

/**
 * タイムアウト値のバリデーション（正の整数）
 */
export function isValidTimeout(value: unknown): value is number {
  return isPositiveInteger(value) && value <= 300000; // 最大5分
}

/**
 * 並列実行数のバリデーション
 */
export function isValidMaxParallel(value: unknown): value is number {
  return isPositiveInteger(value) && value <= 100; // 最大100並列
}

/**
 * リトライ回数のバリデーション
 */
export function isValidMaxRetries(value: unknown): value is number {
  return isNonNegativeInteger(value) && value <= 10; // 最大10回
}
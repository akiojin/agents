/**
 * タイムアウト機能のユーティリティ
 */

/**
 * Promiseにタイムアウトを追加する
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  timeoutMessage?: string,
): Promise<T> {
  const defaultMessage = `リクエストが${timeoutMs / 1000}秒でタイムアウトしました`;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(timeoutMessage || defaultMessage));
      }, timeoutMs);
    }),
  ]);
}

/**
 * AbortControllerを使用したタイムアウト
 */
export function createTimeoutController(timeoutMs: number = 30000): {
  controller: AbortController;
  timeoutId: NodeJS.Timeout;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  return { controller, timeoutId };
}

/**
 * タイムアウト設定のインターフェース
 */
export interface TimeoutConfig {
  /** タイムアウト時間（ミリ秒） */
  timeoutMs?: number;
  /** タイムアウト時のエラーメッセージ */
  timeoutMessage?: string;
}

/**
 * デフォルトのタイムアウト設定
 */
export const DEFAULT_TIMEOUT_CONFIG: Required<TimeoutConfig> = {
  timeoutMs: 30000, // 30秒
  timeoutMessage: 'リクエストが30秒でタイムアウトしました',
};

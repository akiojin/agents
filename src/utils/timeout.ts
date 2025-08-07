/**
 * Timeout機能のユーティリティ
 */

/**
 * PromiseにTimeoutを追加する
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number = 30000,
  timeoutMessage?: string,
): Promise<T> {
  const defaultMessage = `Requestが${timeoutMs / 1000}secondsでtimed out`;

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
 * AbortControllerを使用したTimeout
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
 * TimeoutConfigのインターフェース
 */
export interface TimeoutConfig {
  /** Timeout時間（ミリseconds） */
  timeoutMs?: number;
  /** Timeout時のErrorMessage */
  timeoutMessage?: string;
}

/**
 * デフォルトのTimeoutConfig
 */
export const DEFAULT_TIMEOUT_CONFIG: Required<TimeoutConfig> = {
  timeoutMs: 30000, // 30seconds
  timeoutMessage: 'Requestが30secondsでtimed out',
};

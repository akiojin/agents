import { logger } from './logger.js';

export interface RetryOptions {
  /** 最大リトライ回数（デフォルト: 3） */
  maxRetries?: number;
  /** リトライ間隔（ミリ秒、デフォルト: 1000） */
  delay?: number;
  /** 指数バックオフを使用するか（デフォルト: false） */
  exponentialBackoff?: boolean;
  /** タイムアウト（ミリ秒、デフォルト: 30000） */
  timeout?: number;
  /** リトライ可能なエラーかを判定する関数 */
  shouldRetry?: (error: Error) => boolean;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attemptCount: number;
  totalTime: number;
}

/**
 * デフォルトのリトライ可能エラー判定
 */
const defaultShouldRetry = (error: Error): boolean => {
  const message = error.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('network') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('temporary') ||
    message.includes('service unavailable')
  );
};

/**
 * 関数を指定された条件でリトライ実行する
 * @param fn 実行する関数
 * @param options リトライオプション
 * @returns リトライ結果
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    delay = 1000,
    exponentialBackoff = false,
    timeout = 30000,
    shouldRetry = defaultShouldRetry,
  } = options;

  const startTime = Date.now();
  let attemptCount = 0;
  let lastError: Error | null = null;

  while (attemptCount < maxRetries) {
    attemptCount++;

    try {
      // タイムアウト付きで関数実行
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`処理がタイムアウトしました（${timeout}ms）`));
        }, timeout);
      });

      const result = await Promise.race([fn(), timeoutPromise]);

      return {
        success: true,
        result,
        attemptCount,
        totalTime: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      logger.warn(`リトライ実行 ${attemptCount}/${maxRetries}:`, {
        error: lastError.message,
        attemptCount,
      });

      // 最後の試行でない場合、リトライ可能かチェック
      if (attemptCount < maxRetries) {
        if (!shouldRetry(lastError)) {
          logger.debug('リトライ不可能なエラーのため中断します:', lastError.message);
          break;
        }

        // 遅延時間を計算（指数バックオフの場合）
        const currentDelay = exponentialBackoff ? delay * Math.pow(2, attemptCount - 1) : delay;

        logger.debug(`${currentDelay}ms 待機後にリトライします...`);
        await sleep(currentDelay);
      }
    }
  }

  return {
    success: false,
    error: lastError || new Error('不明なエラー'),
    attemptCount,
    totalTime: Date.now() - startTime,
  };
}

/**
 * 指定された時間待機する
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * リトライ付きでPromiseを実行するユーティリティクラス
 */
export class RetryHandler {
  private defaultOptions: RetryOptions;

  constructor(defaultOptions: RetryOptions = {}) {
    this.defaultOptions = {
      maxRetries: 3,
      delay: 1000,
      exponentialBackoff: false,
      timeout: 30000,
      shouldRetry: defaultShouldRetry,
      ...defaultOptions,
    };
  }

  /**
   * 関数をデフォルト設定でリトライ実行
   */
  async execute<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<RetryResult<T>> {
    return withRetry(fn, { ...this.defaultOptions, ...options });
  }

  /**
   * デフォルトオプションを更新
   */
  setDefaultOptions(options: Partial<RetryOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * デフォルトオプションを取得
   */
  getDefaultOptions(): RetryOptions {
    return { ...this.defaultOptions };
  }
}

// シングルトンインスタンス
export const defaultRetryHandler = new RetryHandler();

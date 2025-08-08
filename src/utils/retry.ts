import { logger } from './logger.js';

export interface RetryOptions {
  /** 最大Retry回数（デフォルト: 3） */
  maxRetries?: number;
  /** Retry間隔（ミリseconds、デフォルト: 1000） */
  delay?: number;
  /** 指数バックオフを使用するか（デフォルト: false） */
  exponentialBackoff?: boolean;
  /** Timeout（ミリseconds、デフォルト: 30000） */
  timeout?: number;
  /** Retry可能なErrorかを判定する関数 */
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
 * デフォルトのRetry可能Error判定
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
 * 関数をspecified条itemsでRetryExecuteする
 * @param fn Executeする関数
 * @param options RetryOptions
 * @returns RetryResult
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    delay = 1000,
    exponentialBackoff = false,
    timeout = 120000, // 2minutes for complex operations
    shouldRetry = defaultShouldRetry,
  } = options;

  const startTime = Date.now();
  let attemptCount = 0;
  let lastError: Error | null = null;

  while (attemptCount < maxRetries) {
    attemptCount++;

    try {
      // Timeout付きで関数Execute
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Processingがtimed out（${timeout}ms）`));
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

      logger.warn(`RetryExecute ${attemptCount}/${maxRetries}:`, {
        error: lastError.message,
        attemptCount,
      });

      // 最後の試行でない場合、Retry可能かチェック
      if (attemptCount < maxRetries) {
        if (!shouldRetry(lastError)) {
          logger.debug('Retry不可能なErrorのため中断します:', lastError.message);
          break;
        }

        // 遅延時間を計算（指数バックオフの場合）
        const currentDelay = exponentialBackoff ? delay * Math.pow(2, attemptCount - 1) : delay;

        logger.debug(`${currentDelay}ms 待機後にRetryします...`);
        await sleep(currentDelay);
      }
    }
  }

  return {
    success: false,
    error: lastError || new Error('不明なError'),
    attemptCount,
    totalTime: Date.now() - startTime,
  };
}

/**
 * specified時間待機する
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry付きでPromiseをExecuteするユーティリティクラス
 */
export class RetryHandler {
  private defaultOptions: RetryOptions;

  constructor(defaultOptions: RetryOptions = {}) {
    this.defaultOptions = {
      maxRetries: 3,
      delay: 1000,
      exponentialBackoff: false,
      timeout: 120000, // 2minutes default
      shouldRetry: defaultShouldRetry,
      ...defaultOptions,
    };
  }

  /**
   * 関数をデフォルトConfigでRetryExecute
   */
  async execute<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<RetryResult<T>> {
    return withRetry(fn, { ...this.defaultOptions, ...options });
  }

  /**
   * デフォルトOptionsをUpdate
   */
  setDefaultOptions(options: Partial<RetryOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * デフォルトOptionsをGet
   */
  getDefaultOptions(): RetryOptions {
    return { ...this.defaultOptions };
  }
}

// シングルトンインスタンス
export const defaultRetryHandler = new RetryHandler();

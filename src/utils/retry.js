import { logger } from './logger.js';
/**
 * デフォルトのRetry可能Error判定
 */
const defaultShouldRetry = (error) => {
    const message = error.message.toLowerCase();
    return (message.includes('timeout') ||
        message.includes('connection') ||
        message.includes('network') ||
        message.includes('rate limit') ||
        message.includes('too many requests') ||
        message.includes('temporary') ||
        message.includes('service unavailable'));
};
/**
 * 関数をspecified条itemsでRetryExecuteする
 * @param fn Executeする関数
 * @param options RetryOptions
 * @returns RetryResult
 */
export async function withRetry(fn, options = {}) {
    const { maxRetries = 3, delay = 1000, exponentialBackoff = false, timeout = 30000, // 2minutes for complex operations
    shouldRetry = defaultShouldRetry, } = options;
    const startTime = Date.now();
    let attemptCount = 0;
    let lastError = null;
    while (attemptCount < maxRetries) {
        attemptCount++;
        try {
            // Timeout付きで関数Execute
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => {
                    reject(new Error(`Processing timed out (${timeout}ms)`));
                }, timeout);
            });
            const result = await Promise.race([fn(), timeoutPromise]);
            return {
                success: true,
                result,
                attemptCount,
                totalTime: Date.now() - startTime,
            };
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            logger.warn(`RetryExecute ${attemptCount}/${maxRetries}:`, {
                error: lastError.message,
                attemptCount,
            });
            // 最後の試行でない場合、Retry可能かチェック
            if (attemptCount < maxRetries) {
                if (!shouldRetry(lastError)) {
                    logger.debug('Non-retryable error, aborting retry:', lastError.message);
                    break;
                }
                // 遅延時間を計算（指数バックオフの場合）
                const currentDelay = exponentialBackoff ? delay * Math.pow(2, attemptCount - 1) : delay;
                logger.debug(`Waiting ${currentDelay}ms before retry...`);
                await sleep(currentDelay);
            }
        }
    }
    return {
        success: false,
        error: lastError || new Error('Unknown error'),
        attemptCount,
        totalTime: Date.now() - startTime,
    };
}
/**
 * specified時間待機する
 */
export function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * Retry付きでPromiseをExecuteするユーティリティクラス
 */
export class RetryHandler {
    defaultOptions;
    constructor(defaultOptions = {}) {
        this.defaultOptions = {
            maxRetries: 3,
            delay: 1000,
            exponentialBackoff: false,
            timeout: 30000, // 2minutes default
            shouldRetry: defaultShouldRetry,
            ...defaultOptions,
        };
    }
    /**
     * 関数をデフォルトConfigでRetryExecute
     */
    async execute(fn, options = {}) {
        return withRetry(fn, { ...this.defaultOptions, ...options });
    }
    /**
     * デフォルトOptionsをUpdate
     */
    setDefaultOptions(options) {
        this.defaultOptions = { ...this.defaultOptions, ...options };
    }
    /**
     * デフォルトOptionsをGet
     */
    getDefaultOptions() {
        return { ...this.defaultOptions };
    }
}
// シングルトンインスタンス
export const defaultRetryHandler = new RetryHandler();
//# sourceMappingURL=retry.js.map
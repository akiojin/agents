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
 * 関数をspecified条itemsでRetryExecuteする
 * @param fn Executeする関数
 * @param options RetryOptions
 * @returns RetryResult
 */
export declare function withRetry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<RetryResult<T>>;
/**
 * specified時間待機する
 */
export declare function sleep(ms: number): Promise<void>;
/**
 * Retry付きでPromiseをExecuteするユーティリティクラス
 */
export declare class RetryHandler {
    private defaultOptions;
    constructor(defaultOptions?: RetryOptions);
    /**
     * 関数をデフォルトConfigでRetryExecute
     */
    execute<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<RetryResult<T>>;
    /**
     * デフォルトOptionsをUpdate
     */
    setDefaultOptions(options: Partial<RetryOptions>): void;
    /**
     * デフォルトOptionsをGet
     */
    getDefaultOptions(): RetryOptions;
}
export declare const defaultRetryHandler: RetryHandler;

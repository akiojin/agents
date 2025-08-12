export declare enum LogLevel {
    ERROR = 0,
    WARN = 1,
    INFO = 2,
    DEBUG = 3
}
export declare class SimpleLogger {
    private level;
    private silent;
    private logDir;
    constructor(options?: {
        logLevel?: string;
        silent?: boolean;
        logDir?: string;
    });
    /**
     * 統一Configから SimpleLogger インスタンスを作成
     */
    static fromUnifiedConfig(config: import('../config/types.js').Config): SimpleLogger;
    private parseLogLevel;
    private ensureLogDir;
    private formatMessage;
    private colorizeMessage;
    private writeToFile;
    private log;
    error(message: string, error?: unknown): void;
    warn(message: string, data?: unknown): void;
    info(message: string, data?: unknown): void;
    debug(message: string, data?: unknown): void;
    setLevel(level: LogLevel): void;
    getLevel(): LogLevel;
    /**
     * ConfigをUpdateする
     */
    updateConfig(options: {
        logLevel?: string;
        silent?: boolean;
        logDir?: string;
    }): void;
    /**
     * 現在のConfigをGet
     */
    getConfig(): {
        logLevel: string;
        silent: boolean;
        logDir: string;
    };
}
export declare const logger: SimpleLogger;
export declare const debug: (message: string, ...args: unknown[]) => void;
export declare const logTask: (taskName: string, status: "start" | "success" | "error", message?: string) => void;
export declare class PerformanceLogger {
    private startTime;
    private taskName;
    constructor(taskName: string);
    end(message?: string): void;
}

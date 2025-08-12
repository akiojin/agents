import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel || (LogLevel = {}));
export class SimpleLogger {
    level;
    silent;
    logDir;
    constructor(options) {
        // Configの優先順位: Options > 環境変数 > デフォルト値
        this.level = this.parseLogLevel(options?.logLevel || process.env.AGENTS_LOG_LEVEL || 'info');
        this.silent = options?.silent ?? process.env.AGENTS_SILENT === 'true' ?? false;
        this.logDir = options?.logDir || process.env.AGENTS_LOG_DIR || './logs';
        this.ensureLogDir();
    }
    /**
     * 統一Configから SimpleLogger インスタンスを作成
     */
    static fromUnifiedConfig(config) {
        return new SimpleLogger({
            logLevel: config.app.logLevel,
            silent: config.app.silent,
            logDir: config.app.logDir,
        });
    }
    parseLogLevel(level) {
        switch (level.toLowerCase()) {
            case 'error':
                return LogLevel.ERROR;
            case 'warn':
                return LogLevel.WARN;
            case 'info':
                return LogLevel.INFO;
            case 'debug':
                return LogLevel.DEBUG;
            default:
                return LogLevel.INFO;
        }
    }
    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }
    formatMessage(level, message, data) {
        const timestamp = new Date().toISOString();
        const levelName = LogLevel[level];
        let formattedMessage = `[${levelName}] ${timestamp} ${message}`;
        if (data && typeof data === 'object') {
            try {
                formattedMessage += ` ${JSON.stringify(data)}`;
            }
            catch (error) {
                // JSON.stringifyにFailedした場合はcharacters列にConvert
                formattedMessage += ` ${String(data)}`;
            }
        }
        else if (data !== undefined && data !== null) {
            formattedMessage += ` ${data}`;
        }
        return formattedMessage;
    }
    colorizeMessage(level, message) {
        switch (level) {
            case LogLevel.ERROR:
                return chalk.red(message);
            case LogLevel.WARN:
                return chalk.yellow(message);
            case LogLevel.INFO:
                return chalk.blue(message);
            case LogLevel.DEBUG:
                return chalk.gray(message);
            default:
                return message;
        }
    }
    writeToFile(filename, message, error) {
        try {
            const logFile = path.join(this.logDir, filename);
            const logEntry = `${message}${error ? `\n${error.stack}` : ''}\n`;
            fs.appendFileSync(logFile, logEntry);
        }
        catch (writeError) {
            // ファイル書き込みErrorはコンソールに出力のみ（ループを避けるため）
            console.error('Failed to write to log file:', writeError);
        }
    }
    log(level, message, dataOrError) {
        if (level > this.level) {
            return;
        }
        const formattedMessage = this.formatMessage(level, message, dataOrError);
        // コンソール出力
        if (!this.silent) {
            const colorizedMessage = this.colorizeMessage(level, formattedMessage);
            console.log(colorizedMessage);
        }
        // Errorログの場合はファイル出力
        if (level === LogLevel.ERROR) {
            const error = dataOrError instanceof Error ? dataOrError : undefined;
            this.writeToFile('agents-error.log', formattedMessage, error);
        }
    }
    error(message, error) {
        this.log(LogLevel.ERROR, message, error);
    }
    warn(message, data) {
        this.log(LogLevel.WARN, message, data);
    }
    info(message, data) {
        this.log(LogLevel.INFO, message, data);
    }
    debug(message, data) {
        this.log(LogLevel.DEBUG, message, data);
    }
    setLevel(level) {
        this.level = level;
        this.info(`Log level changed to ${LogLevel[level]}`);
    }
    getLevel() {
        return this.level;
    }
    /**
     * ConfigをUpdateする
     */
    updateConfig(options) {
        if (options.logLevel) {
            this.level = this.parseLogLevel(options.logLevel);
        }
        if (options.silent !== undefined) {
            this.silent = options.silent;
        }
        if (options.logDir) {
            const oldLogDir = this.logDir;
            this.logDir = options.logDir;
            this.ensureLogDir();
            this.info(`Log directory changed from ${oldLogDir} to ${this.logDir}`);
        }
    }
    /**
     * 現在のConfigをGet
     */
    getConfig() {
        return {
            logLevel: LogLevel[this.level].toLowerCase(),
            silent: this.silent,
            logDir: this.logDir,
        };
    }
}
// シングルトンインスタンス（遅延初期化）
let _logger = null;
export const logger = new Proxy({}, {
    get(target, prop) {
        if (!_logger) {
            _logger = new SimpleLogger({
                silent: process.env.AGENTS_SILENT === 'true'
            });
        }
        return _logger[prop];
    }
});
// デバッグモード用のヘルパー関数（後方互換性）
export const debug = (message, ...args) => {
    if (process.env.DEBUG) {
        logger.debug(`${message}${args.length > 0 ? ` ${args.join(' ')}` : ''}`);
    }
};
// TaskExecuteログ用のヘルパー関数
export const logTask = (taskName, status, message) => {
    switch (status) {
        case 'start':
            logger.info(`Task started: ${taskName}`);
            break;
        case 'success':
            logger.info(`Task completed: ${taskName}`, message ? { message } : undefined);
            break;
        case 'error':
            logger.error(`Task failed: ${taskName}`, message ? new Error(message) : undefined);
            break;
    }
};
// パフォーマンス計測用のヘルパー関数
export class PerformanceLogger {
    startTime;
    taskName;
    constructor(taskName) {
        this.taskName = taskName;
        this.startTime = performance.now();
        logger.debug(`Performance measurement started: ${taskName}`);
    }
    end(message) {
        const duration = performance.now() - this.startTime;
        logger.info(`Performance: ${this.taskName} completed in ${duration.toFixed(2)}ms`, message
            ? { message, duration: `${duration.toFixed(2)}ms` }
            : { duration: `${duration.toFixed(2)}ms` });
    }
}
//# sourceMappingURL=logger.js.map
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceLogger = exports.logTask = exports.debug = exports.logger = exports.SimpleLogger = exports.LogLevel = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chalk_1 = __importDefault(require("chalk"));
var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["ERROR"] = 0] = "ERROR";
    LogLevel[LogLevel["WARN"] = 1] = "WARN";
    LogLevel[LogLevel["INFO"] = 2] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 3] = "DEBUG";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class SimpleLogger {
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
                return chalk_1.default.red(message);
            case LogLevel.WARN:
                return chalk_1.default.yellow(message);
            case LogLevel.INFO:
                return chalk_1.default.blue(message);
            case LogLevel.DEBUG:
                return chalk_1.default.gray(message);
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
exports.SimpleLogger = SimpleLogger;
// シングルトンインスタンス（遅延初期化）
let _logger = null;
exports.logger = new Proxy({}, {
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
const debug = (message, ...args) => {
    if (process.env.DEBUG) {
        exports.logger.debug(`${message}${args.length > 0 ? ` ${args.join(' ')}` : ''}`);
    }
};
exports.debug = debug;
// TaskExecuteログ用のヘルパー関数
const logTask = (taskName, status, message) => {
    switch (status) {
        case 'start':
            exports.logger.info(`Task started: ${taskName}`);
            break;
        case 'success':
            exports.logger.info(`Task completed: ${taskName}`, message ? { message } : undefined);
            break;
        case 'error':
            exports.logger.error(`Task failed: ${taskName}`, message ? new Error(message) : undefined);
            break;
    }
};
exports.logTask = logTask;
// パフォーマンス計測用のヘルパー関数
class PerformanceLogger {
    constructor(taskName) {
        this.taskName = taskName;
        this.startTime = performance.now();
        exports.logger.debug(`Performance measurement started: ${taskName}`);
    }
    end(message) {
        const duration = performance.now() - this.startTime;
        exports.logger.info(`Performance: ${this.taskName} completed in ${duration.toFixed(2)}ms`, message
            ? { message, duration: `${duration.toFixed(2)}ms` }
            : { duration: `${duration.toFixed(2)}ms` });
    }
}
exports.PerformanceLogger = PerformanceLogger;
//# sourceMappingURL=logger.js.map
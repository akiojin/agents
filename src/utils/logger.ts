import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
}

export class SimpleLogger {
  private level: LogLevel;
  private silent: boolean;
  private logDir: string;

  constructor(options?: { logLevel?: string; silent?: boolean; logDir?: string }) {
    // Configの優先順位: Options > 環境変数 > デフォルト値
    this.level = this.parseLogLevel(options?.logLevel || process.env.AGENTS_LOG_LEVEL || 'info');
    this.silent = options?.silent ?? process.env.AGENTS_SILENT === 'true' ?? false;
    this.logDir = options?.logDir || process.env.AGENTS_LOG_DIR || '.agents/logs';
    this.ensureLogDir();
  }

  /**
   * 統一Configから SimpleLogger インスタンスを作成
   */
  static fromUnifiedConfig(config: import('../config/types.js').Config): SimpleLogger {
    return new SimpleLogger({
      logLevel: config.app.logLevel,
      silent: config.app.silent,
      logDir: config.app.logDir,
    });
  }

  private parseLogLevel(level: string): LogLevel {
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

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatMessage(level: LogLevel, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    let formattedMessage = `[${levelName}] ${timestamp} ${message}`;

    if (data && typeof data === 'object') {
      try {
        formattedMessage += ` ${JSON.stringify(data)}`;
      } catch (error) {
        // JSON.stringifyにFailedした場合はcharacters列にConvert
        formattedMessage += ` ${String(data)}`;
      }
    } else if (data !== undefined && data !== null) {
      formattedMessage += ` ${data}`;
    }

    return formattedMessage;
  }

  private colorizeMessage(level: LogLevel, message: string): string {
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

  private writeToFile(filename: string, message: string, error?: Error): void {
    try {
      const logFile = path.join(this.logDir, filename);
      const logEntry = `${message}${error ? `\n${error.stack}` : ''}\n`;
      fs.appendFileSync(logFile, logEntry);
    } catch (writeError) {
      // ファイル書き込みErrorはコンソールに出力のみ（ループを避けるため）
      console.error('Failed to write to log file:', writeError);
    }
  }

  private log(level: LogLevel, message: string, dataOrError?: unknown): void {
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

  error(message: string, error?: unknown): void {
    this.log(LogLevel.ERROR, message, error);
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, data);
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, data);
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  setLevel(level: LogLevel): void {
    this.level = level;
    this.info(`Log level changed to ${LogLevel[level]}`);
  }

  getLevel(): LogLevel {
    return this.level;
  }

  /**
   * ConfigをUpdateする
   */
  updateConfig(options: { logLevel?: string; silent?: boolean; logDir?: string }): void {
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
let _logger: SimpleLogger | null = null;

export const logger = new Proxy({} as SimpleLogger, {
  get(target, prop) {
    if (!_logger) {
      _logger = new SimpleLogger({
        silent: process.env.AGENTS_SILENT === 'true'
      });
    }
    return (_logger as any)[prop];
  }
});

// デバッグモード用のヘルパー関数（後方互換性）
export const debug = (message: string, ...args: unknown[]): void => {
  if (process.env.DEBUG) {
    logger.debug(`${message}${args.length > 0 ? ` ${args.join(' ')}` : ''}`);
  }
};

// TaskExecuteログ用のヘルパー関数
export const logTask = (
  taskName: string,
  status: 'start' | 'success' | 'error',
  message?: string,
): void => {
  switch (status) {
    case 'start':
      logger.info(`Task started: ${taskName}`);
      break;
    case 'success':
      if (message) {
        logger.info(`Task completed: ${taskName}`, { message });
      } else {
        logger.info(`Task completed: ${taskName}`);
      }
      break;
    case 'error':
      if (message) {
        logger.error(`Task failed: ${taskName}`, new Error(message));
      } else {
        logger.error(`Task failed: ${taskName}`);
      }
      break;
  }
};

// パフォーマンス計測用のヘルパー関数
export class PerformanceLogger {
  private startTime: number;
  private taskName: string;

  constructor(taskName: string) {
    this.taskName = taskName;
    this.startTime = performance.now();
    logger.debug(`Performance measurement started: ${taskName}`);
  }

  end(message?: string): void {
    const duration = performance.now() - this.startTime;
    logger.info(
      `Performance: ${this.taskName} completed in ${duration.toFixed(2)}ms`,
      message
        ? { message, duration: `${duration.toFixed(2)}ms` }
        : { duration: `${duration.toFixed(2)}ms` },
    );
  }
}

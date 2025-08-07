import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

export class SimpleLogger {
  private level: LogLevel;
  private silent: boolean;
  private logDir: string;

  constructor(options?: {
    logLevel?: string;
    silent?: boolean;
    logDir?: string;
  }) {
    // 設定の優先順位: オプション > 環境変数 > デフォルト値
    this.level = this.parseLogLevel(
      options?.logLevel || process.env.AGENTS_LOG_LEVEL || 'info'
    );
    this.silent = options?.silent ?? (process.env.AGENTS_SILENT === 'true') ?? false;
    this.logDir = options?.logDir || process.env.AGENTS_LOG_DIR || './logs';
    this.ensureLogDir();
  }

  /**
   * 統一設定から SimpleLogger インスタンスを作成
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
      case 'error': return LogLevel.ERROR;
      case 'warn': return LogLevel.WARN;
      case 'info': return LogLevel.INFO;
      case 'debug': return LogLevel.DEBUG;
      default: return LogLevel.INFO;
    }
  }

  private ensureLogDir(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    let formattedMessage = `[${levelName}] ${timestamp} ${message}`;
    
    if (data && typeof data === 'object') {
      formattedMessage += ` ${JSON.stringify(data)}`;
    } else if (data) {
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
      // ファイル書き込みエラーはコンソールに出力のみ（ループを避けるため）
      console.error('Failed to write to log file:', writeError);
    }
  }

  private log(level: LogLevel, message: string, dataOrError?: any): void {
    if (level > this.level) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, dataOrError);
    
    // コンソール出力
    if (!this.silent) {
      const colorizedMessage = this.colorizeMessage(level, formattedMessage);
      console.log(colorizedMessage);
    }

    // エラーログの場合はファイル出力
    if (level === LogLevel.ERROR) {
      const error = dataOrError instanceof Error ? dataOrError : undefined;
      this.writeToFile('agents-error.log', formattedMessage, error);
    }
  }

  error(message: string, error?: Error): void {
    this.log(LogLevel.ERROR, message, error);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  debug(message: string, data?: any): void {
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
   * 設定を更新する
   */
  updateConfig(options: {
    logLevel?: string;
    silent?: boolean;
    logDir?: string;
  }): void {
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
   * 現在の設定を取得
   */
  getConfig() {
    return {
      logLevel: LogLevel[this.level].toLowerCase(),
      silent: this.silent,
      logDir: this.logDir,
    };
  }
}

// シングルトンインスタンス
export const logger = new SimpleLogger();

// デバッグモード用のヘルパー関数（後方互換性）
export const debug = (message: string, ...args: unknown[]): void => {
  if (process.env.DEBUG) {
    logger.debug(`${message}${args.length > 0 ? ` ${args.join(' ')}` : ''}`);
  }
};

// タスク実行ログ用のヘルパー関数
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
      logger.info(`Task completed: ${taskName}`, message ? { message } : undefined);
      break;
    case 'error':
      logger.error(`Task failed: ${taskName}`, message ? new Error(message) : undefined);
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
    logger.info(`Performance: ${this.taskName} completed in ${duration.toFixed(2)}ms`, 
      message ? { message, duration: `${duration.toFixed(2)}ms` } : { duration: `${duration.toFixed(2)}ms` });
  }
}

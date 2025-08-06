import winston from 'winston';
import chalk from 'chalk';

// カスタムフォーマット
const customFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} `;

  // レベルに応じて色を変更
  switch (level) {
    case 'error':
      msg += chalk.red(`[${level.toUpperCase()}]`);
      break;
    case 'warn':
      msg += chalk.yellow(`[${level.toUpperCase()}]`);
      break;
    case 'info':
      msg += chalk.blue(`[${level.toUpperCase()}]`);
      break;
    case 'debug':
      msg += chalk.gray(`[${level.toUpperCase()}]`);
      break;
    default:
      msg += `[${level.toUpperCase()}]`;
  }

  msg += ` ${message}`;

  // メタデータがある場合は追加
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }

  return msg;
});

// Winstonロガーの設定
const createLogger = (): winston.Logger => {
  const logLevel = process.env.AGENTS_LOG_LEVEL || 'info';
  const isProduction = process.env.NODE_ENV === 'production';

  return winston.createLogger({
    level: logLevel,
    format: winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
      winston.format.splat(),
      customFormat,
    ),
    transports: [
      // コンソール出力
      new winston.transports.Console({
        silent: process.env.AGENTS_SILENT === 'true',
      }),
      // ファイル出力（エラーログ）
      new winston.transports.File({
        filename: 'agents-error.log',
        level: 'error',
        silent: isProduction ? false : true,
      }),
      // ファイル出力（全ログ）
      new winston.transports.File({
        filename: 'agents.log',
        silent: isProduction ? false : true,
      }),
    ],
  });
};

// ロガーインスタンスの作成
export const logger = createLogger();

// デバッグモード用のヘルパー関数
export const debug = (message: string, ...args: unknown[]): void => {
  if (process.env.DEBUG) {
    console.log(chalk.gray(`[DEBUG] ${message}`), ...args);
  }
};

// タスク実行ログ用のヘルパー関数
export const logTask = (
  taskName: string,
  status: 'start' | 'success' | 'error',
  message?: string,
): void => {
  const timestamp = new Date().toISOString();

  switch (status) {
    case 'start':
      logger.info(`Task started: ${taskName}`, { timestamp });
      break;
    case 'success':
      logger.info(`Task completed: ${taskName}`, { timestamp, message });
      break;
    case 'error':
      logger.error(`Task failed: ${taskName}`, { timestamp, message });
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
    logger.info(`Performance: ${this.taskName} completed in ${duration.toFixed(2)}ms`, { message });
  }
}

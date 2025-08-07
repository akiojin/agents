import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { SimpleLogger, LogLevel, logger } from '../../src/utils/logger.js';

describe('SimpleLogger', () => {
  let testLogger: SimpleLogger;
  let consoleLogSpy: any;
  let testLogDir: string;

  beforeEach(() => {
    // コンソール出力をキャプチャ
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    
    // テスト用のログディレクトリを設定
    testLogDir = path.join(process.cwd(), 'test-logs');
    process.env.AGENTS_LOG_DIR = testLogDir;
    
    testLogger = new SimpleLogger();
  });

  afterEach(() => {
    // モックをクリーンアップ
    consoleLogSpy.mockRestore();
    
    // テストログディレクトリを削除
    if (fs.existsSync(testLogDir)) {
      fs.rmSync(testLogDir, { recursive: true, force: true });
    }
    
    // 環境変数をクリーンアップ
    delete process.env.AGENTS_LOG_DIR;
    delete process.env.AGENTS_LOG_LEVEL;
    delete process.env.AGENTS_SILENT;
  });

  describe('ログレベル設定', () => {
    it('デフォルトでINFOレベルが設定される', () => {
      expect(testLogger.getLevel()).toBe(LogLevel.INFO);
    });

    it('環境変数でログレベルを設定できる', () => {
      process.env.AGENTS_LOG_LEVEL = 'debug';
      const debugLogger = new SimpleLogger();
      expect(debugLogger.getLevel()).toBe(LogLevel.DEBUG);
    });

    it('setLevelでログレベルを変更できる', () => {
      testLogger.setLevel(LogLevel.ERROR);
      expect(testLogger.getLevel()).toBe(LogLevel.ERROR);
    });
  });

  describe('ログ出力', () => {
    it('errorメッセージが出力される', () => {
      testLogger.error('Test error message');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test error message')
      );
    });

    it('warnメッセージが出力される', () => {
      testLogger.warn('Test warn message');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test warn message')
      );
    });

    it('infoメッセージが出力される', () => {
      testLogger.info('Test info message');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test info message')
      );
    });

    it('debugメッセージは通常出力されない', () => {
      testLogger.debug('Test debug message');
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('debugレベル設定時にdebugメッセージが出力される', () => {
      testLogger.setLevel(LogLevel.DEBUG);
      testLogger.debug('Test debug message');
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test debug message')
      );
    });
  });

  describe('サイレントモード', () => {
    it('サイレントモード時は出力されない', () => {
      process.env.AGENTS_SILENT = 'true';
      const silentLogger = new SimpleLogger();
      
      silentLogger.error('Error message');
      silentLogger.warn('Warn message');
      silentLogger.info('Info message');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });

  describe('ファイル出力', () => {
    it('エラーログがファイルに書き込まれる', () => {
      const testError = new Error('Test error');
      testLogger.error('File write test', testError);
      
      const errorLogFile = path.join(testLogDir, 'agents-error.log');
      expect(fs.existsSync(errorLogFile)).toBe(true);
      
      const logContent = fs.readFileSync(errorLogFile, 'utf-8');
      expect(logContent).toContain('File write test');
      expect(logContent).toContain('Test error');
    });

    it('非エラーログはファイルに書き込まれない', () => {
      testLogger.info('Info message');
      testLogger.warn('Warn message');
      
      const errorLogFile = path.join(testLogDir, 'agents-error.log');
      expect(fs.existsSync(errorLogFile)).toBe(false);
    });
  });

  describe('データ付きログ', () => {
    it('オブジェクトデータがJSON形式で出力される', () => {
      const testData = { key: 'value', count: 42 };
      testLogger.info('Test with data', testData);
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining(JSON.stringify(testData))
      );
    });

    it('文字列データがそのまま出力される', () => {
      testLogger.info('Test with string data', 'additional info');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('additional info')
      );
    });
  });

  describe('ログフォーマット', () => {
    it('ISO形式のタイムスタンプが含まれる', () => {
      testLogger.info('Timestamp test');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[INFO\] \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/)
      );
    });
  });
});

describe('シングルトンロガー', () => {
  it('loggerがSimpleLoggerのインスタンスである', () => {
    expect(logger).toBeInstanceOf(SimpleLogger);
  });

  it('loggerはシングルトンである', () => {
    const logger1 = logger;
    const logger2 = logger;
    expect(logger1).toBe(logger2);
  });
});

describe('ヘルパー関数', () => {
  let consoleLogSpy: any;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    delete process.env.DEBUG;
  });

  describe('debug関数', () => {
    it('DEBUG環境変数が設定されている時に出力される', async () => {
      process.env.DEBUG = 'true';
      
      // シングルトンのloggerのレベルをDEBUGに設定
      logger.setLevel(LogLevel.DEBUG);
      const { debug } = await import('../../src/utils/logger.js');
      
      debug('Debug message', 'arg1', 'arg2');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Debug message arg1 arg2')
      );
    });

    it('DEBUG環境変数が未設定の時は出力されない', async () => {
      const { debug } = await import('../../src/utils/logger.js');
      
      debug('Debug message');
      
      expect(consoleLogSpy).not.toHaveBeenCalled();
    });
  });
});
import EventEmitter from 'events';
import { spawn, ChildProcess } from 'child_process';
import { logger } from '../utils/logger.js';

/**
 * Shellセッションの状態
 */
export enum ShellSessionStatus {
  STARTING = 'starting',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  KILLED = 'killed',
  TIMEOUT = 'timeout'
}

/**
 * Shellセッション情報
 */
export interface ShellSession {
  id: string;
  command: string;
  args: string[];
  status: ShellSessionStatus;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  exitCode?: number;
  pid?: number;
  workingDirectory: string;
  environment?: Record<string, string>;
  maxDuration?: number; // 最大実行時間（ミリ秒）
  abortController?: AbortController;
}

/**
 * 出力データ
 */
export interface OutputData {
  sessionId: string;
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: Date;
}

/**
 * セッション統計
 */
export interface SessionStats {
  total: number;
  running: number;
  completed: number;
  failed: number;
  killed: number;
  timeout: number;
}

/**
 * バックグラウンドShell管理クラス
 * 長時間実行されるShellコマンドを並列で管理する
 */
export class BackgroundShellManager extends EventEmitter {
  private sessions = new Map<string, ShellSession>();
  private processes = new Map<string, ChildProcess>();
  private sessionCounter = 0;
  private maxConcurrentSessions = 10;
  private defaultTimeout = 30 * 60 * 1000; // 30分
  
  constructor(options: {
    maxConcurrentSessions?: number;
    defaultTimeout?: number;
  } = {}) {
    super();
    
    this.maxConcurrentSessions = options.maxConcurrentSessions ?? 10;
    this.defaultTimeout = options.defaultTimeout ?? (30 * 60 * 1000);
    
    logger.debug('BackgroundShellManager initialized', {
      maxConcurrentSessions: this.maxConcurrentSessions,
      defaultTimeout: this.defaultTimeout
    });
  }

  /**
   * 新しいShellセッションを開始
   */
  startSession(
    command: string,
    options: {
      args?: string[];
      cwd?: string;
      env?: Record<string, string>;
      timeout?: number;
      abortController?: AbortController;
    } = {}
  ): string {
    // 同時実行数制限チェック
    if (this.getRunningSessionsCount() >= this.maxConcurrentSessions) {
      throw new Error(`Maximum concurrent sessions (${this.maxConcurrentSessions}) reached`);
    }
    
    const sessionId = `bg-${String(++this.sessionCounter).padStart(3, '0')}`;
    const session: ShellSession = {
      id: sessionId,
      command,
      args: options.args || [],
      status: ShellSessionStatus.STARTING,
      startTime: new Date(),
      workingDirectory: options.cwd || process.cwd(),
      environment: options.env,
      maxDuration: options.timeout || this.defaultTimeout,
      abortController: options.abortController
    };
    
    this.sessions.set(sessionId, session);
    
    logger.info(`Starting shell session: ${sessionId}`, {
      command,
      args: options.args,
      cwd: options.cwd
    });
    
    // プロセスの開始
    this.spawnProcess(session);
    
    this.emit('session:started', session);
    return sessionId;
  }

  /**
   * プロセスを起動
   */
  private spawnProcess(session: ShellSession): void {
    try {
      const process = spawn(session.command, session.args, {
        cwd: session.workingDirectory,
        env: { ...process.env, ...session.environment },
        stdio: ['ignore', 'pipe', 'pipe'], // stdin無効、stdout/stderr有効
        detached: false // プロセスグループとして管理
      });
      
      session.pid = process.pid;
      session.status = ShellSessionStatus.RUNNING;
      this.processes.set(session.id, process);
      
      logger.debug(`Process spawned: ${session.id} (PID: ${session.pid})`);
      
      // 標準出力の処理
      process.stdout?.on('data', (data: Buffer) => {
        const outputData: OutputData = {
          sessionId: session.id,
          type: 'stdout',
          data: data.toString(),
          timestamp: new Date()
        };
        this.emit('output', outputData);
      });
      
      // 標準エラー出力の処理
      process.stderr?.on('data', (data: Buffer) => {
        const outputData: OutputData = {
          sessionId: session.id,
          type: 'stderr',
          data: data.toString(),
          timestamp: new Date()
        };
        this.emit('output', outputData);
      });
      
      // プロセス終了の処理
      process.on('close', (code: number | null, signal: string | null) => {
        this.handleProcessExit(session.id, code, signal);
      });
      
      // プロセスエラーの処理
      process.on('error', (error: Error) => {
        logger.error(`Process error: ${session.id}`, error);
        session.status = ShellSessionStatus.FAILED;
        this.completeSession(session.id, null, error.message);
      });
      
      // タイムアウト設定
      if (session.maxDuration) {
        setTimeout(() => {
          if (session.status === ShellSessionStatus.RUNNING) {
            logger.warn(`Session timeout: ${session.id}`);
            this.killSession(session.id, 'timeout');
          }
        }, session.maxDuration);
      }
      
      // AbortControllerの監視
      if (session.abortController) {
        session.abortController.signal.addEventListener('abort', () => {
          if (session.status === ShellSessionStatus.RUNNING) {
            logger.info(`Session aborted: ${session.id}`);
            this.killSession(session.id, 'aborted');
          }
        });
      }
      
      this.emit('session:running', session);
      
    } catch (error) {
      logger.error(`Failed to spawn process: ${session.id}`, error);
      session.status = ShellSessionStatus.FAILED;
      this.completeSession(session.id, null, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * プロセス終了の処理
   */
  private handleProcessExit(sessionId: string, exitCode: number | null, signal: string | null): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    logger.debug(`Process exited: ${sessionId}`, { exitCode, signal });
    
    if (signal === 'SIGKILL' || signal === 'SIGTERM') {
      session.status = ShellSessionStatus.KILLED;
    } else if (exitCode === 0) {
      session.status = ShellSessionStatus.COMPLETED;
    } else {
      session.status = ShellSessionStatus.FAILED;
    }
    
    this.completeSession(sessionId, exitCode, signal);
  }

  /**
   * セッションの完了処理
   */
  private completeSession(sessionId: string, exitCode: number | null, signal?: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    session.endTime = new Date();
    session.duration = session.endTime.getTime() - session.startTime.getTime();
    session.exitCode = exitCode || undefined;
    
    // プロセスマップから削除
    this.processes.delete(sessionId);
    
    logger.info(`Session completed: ${sessionId}`, {
      status: session.status,
      duration: session.duration,
      exitCode: session.exitCode
    });
    
    this.emit('session:completed', session);
  }

  /**
   * セッションを強制終了
   */
  killSession(sessionId: string, reason = 'manual'): boolean {
    const session = this.sessions.get(sessionId);
    const process = this.processes.get(sessionId);
    
    if (!session || !process) {
      return false;
    }
    
    if (session.status !== ShellSessionStatus.RUNNING) {
      return false;
    }
    
    logger.info(`Killing session: ${sessionId}`, { reason });
    
    try {
      // まずSIGTERMで穏やかに終了を試行
      process.kill('SIGTERM');
      
      // 5秒後にまだ実行中の場合はSIGKILLで強制終了
      setTimeout(() => {
        if (this.processes.has(sessionId)) {
          logger.warn(`Force killing session: ${sessionId}`);
          process.kill('SIGKILL');
        }
      }, 5000);
      
      if (reason === 'timeout') {
        session.status = ShellSessionStatus.TIMEOUT;
      } else {
        session.status = ShellSessionStatus.KILLED;
      }
      
      this.emit('session:killed', session, reason);
      return true;
      
    } catch (error) {
      logger.error(`Failed to kill session: ${sessionId}`, error);
      return false;
    }
  }

  /**
   * セッション情報を取得
   */
  getSession(sessionId: string): ShellSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * 全セッション一覧を取得
   */
  getAllSessions(): ShellSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * 実行中のセッション一覧を取得
   */
  getRunningSessions(): ShellSession[] {
    return this.getAllSessions().filter(session => 
      session.status === ShellSessionStatus.RUNNING
    );
  }

  /**
   * 実行中のセッション数を取得
   */
  getRunningSessionsCount(): number {
    return this.getRunningSessions().length;
  }

  /**
   * セッション統計を取得
   */
  getStats(): SessionStats {
    const sessions = this.getAllSessions();
    
    return {
      total: sessions.length,
      running: sessions.filter(s => s.status === ShellSessionStatus.RUNNING).length,
      completed: sessions.filter(s => s.status === ShellSessionStatus.COMPLETED).length,
      failed: sessions.filter(s => s.status === ShellSessionStatus.FAILED).length,
      killed: sessions.filter(s => s.status === ShellSessionStatus.KILLED).length,
      timeout: sessions.filter(s => s.status === ShellSessionStatus.TIMEOUT).length
    };
  }

  /**
   * セッション履歴をクリア
   */
  clearHistory(): void {
    // 実行中のセッション以外を削除
    const runningSessions = this.getRunningSessions();
    this.sessions.clear();
    
    runningSessions.forEach(session => {
      this.sessions.set(session.id, session);
    });
    
    logger.info('Session history cleared', { 
      kept: runningSessions.length 
    });
    
    this.emit('history:cleared', runningSessions.length);
  }

  /**
   * 全セッションを強制終了
   */
  killAllSessions(): void {
    const runningSessions = this.getRunningSessions();
    
    logger.info(`Killing ${runningSessions.length} running sessions`);
    
    runningSessions.forEach(session => {
      this.killSession(session.id, 'shutdown');
    });
    
    this.emit('all:killed', runningSessions.length);
  }

  /**
   * セッションが存在するかチェック
   */
  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  /**
   * セッションが実行中かチェック
   */
  isSessionRunning(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.status === ShellSessionStatus.RUNNING;
  }

  /**
   * 指定セッションの最近の出力を取得
   * （実際の実装ではOutputStreamerが担当）
   */
  getRecentOutput(sessionId: string, lines = 50): string[] {
    // プレースホルダー実装
    // OutputStreamerクラスで実装予定
    return [`Session ${sessionId} の出力取得機能は Phase 2 で実装予定`];
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    logger.info('BackgroundShellManager cleanup started');
    
    // 全セッションを終了
    this.killAllSessions();
    
    // イベントリスナーをクリア
    this.removeAllListeners();
    
    logger.debug('BackgroundShellManager cleaned up');
  }
}
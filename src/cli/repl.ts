import readline from 'readline';
import chalk from 'chalk';
import EventEmitter from 'events';
import type { AgentCore } from '../core/agent.js';
import type { MCPManager } from '../mcp/manager.js';
import { logger } from '../utils/logger.js';
import { TokenCounter } from '../utils/token-counter.js';
import { InputQueueManager, ProcessingResult } from './input-queue-manager.js';
import { CommandProcessor } from './command-processor.js';
import { QueuedTask } from './priority-queue.js';

/**
 * 非同期対応REPL管理クラス
 * 入力キューイング、並列処理、リアルタイム状態表示を提供
 */
class AsyncREPL extends EventEmitter {
  private agent: AgentCore;
  private mcpManager: MCPManager;
  private tokenCounter: TokenCounter;
  private inputQueue: InputQueueManager;
  private commandProcessor: CommandProcessor;
  private rl: readline.Interface;
  private isRunning = false;
  private activePromises = new Map<string, Promise<any>>();
  private statusInterval?: NodeJS.Timeout;
  
  constructor(agent: AgentCore, mcpManager: MCPManager) {
    super();
    this.agent = agent;
    this.mcpManager = mcpManager;
    this.tokenCounter = new TokenCounter();
    this.inputQueue = new InputQueueManager();
    this.commandProcessor = new CommandProcessor(agent, mcpManager, this.tokenCounter);
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt(),
      terminal: true,
      completer: this.completer.bind(this)
    });
    
    this.setupEventHandlers();
  }

  /**
   * REPLを開始
   */
  async start(): Promise<void> {
    this.showWelcome();
    this.isRunning = true;
    
    // 入力イベントハンドラー
    this.rl.on('line', this.handleInput.bind(this));
    this.rl.on('close', this.handleClose.bind(this));
    
    // SIGINT/SIGTERM ハンドラー
    process.on('SIGINT', this.handleInterrupt.bind(this));
    process.on('SIGTERM', this.handleTerminate.bind(this));
    
    // プロンプト表示
    this.rl.prompt();
    
    // 状態表示の開始
    this.startStatusDisplay();
    
    return new Promise((resolve) => {
      this.once('exit', resolve);
    });
  }

  /**
   * 入力処理
   */
  private handleInput(input: string): void {
    const trimmedInput = input.trim();
    
    if (trimmedInput.length === 0) {
      this.rl.prompt();
      return;
    }
    
    // AbortController作成（中断可能にする）
    const abortController = new AbortController();
    
    try {
      // 入力をキューに追加
      const taskId = this.inputQueue.addInput(trimmedInput, {
        abortController
      });
      
      this.displayQueueStatus();
      
      // すぐに次の入力を受け付ける
      this.rl.prompt();
      
    } catch (error) {
      console.log(chalk.red('入力処理エラー:'), error instanceof Error ? error.message : String(error));
      this.rl.prompt();
    }
  }

  /**
   * イベントハンドラーの設定
   */
  private setupEventHandlers(): void {
    // 入力キューイベント
    this.inputQueue.on('input:queued', (task) => {
      console.log(chalk.gray(`[Queue:${task.id}] タスクがキューに追加されました`));
    });
    
    this.inputQueue.on('process:input', (task) => {
      this.processTask(task);
    });
    
    this.inputQueue.on('input:completed', (task, result) => {
      this.handleTaskCompleted(task, result);
    });
    
    this.inputQueue.on('input:error', (task, error) => {
      this.handleTaskError(task, error);
    });
    
    this.inputQueue.on('all:stopped', () => {
      console.log(chalk.yellow('🛑 全てのタスクが停止されました'));
    });
    
    this.inputQueue.on('emergency:stop', () => {
      console.log(chalk.red('🚨 緊急停止が実行されました'));
    });
    
    // コマンドプロセッサーイベント
    this.commandProcessor.on('exit:requested', (stats) => {
      console.log('');
      console.log(stats);
      console.log('');
      this.shutdown();
    });
    
    this.commandProcessor.on('stop:all', () => {
      this.inputQueue.stopAll();
    });
    
    this.commandProcessor.on('stop:task', (taskId) => {
      this.inputQueue.cancelTask(taskId);
    });
  }

  /**
   * タスクの実際の処理
   */
  private async processTask(task: QueuedTask<any>): Promise<void> {
    const promise = this.commandProcessor.processTask(task)
      .then(result => {
        this.inputQueue.completeTask(task.id, result);
      })
      .catch(error => {
        const errorResult: ProcessingResult = {
          success: false,
          error: error instanceof Error ? error : new Error(String(error)),
          duration: 0
        };
        this.inputQueue.completeTask(task.id, errorResult);
      });
    
    // アクティブなPromiseとして管理
    this.activePromises.set(task.id, promise);
    
    try {
      await promise;
    } finally {
      this.activePromises.delete(task.id);
    }
  }

  /**
   * タスク完了処理
   */
  private handleTaskCompleted(task: QueuedTask<any>, result: ProcessingResult): void {
    if (result.success && result.result) {
      const taskResult = result.result;
      
      // 画面クリア要求
      if (taskResult.clearScreen) {
        console.clear();
      }
      
      // 終了要求
      if (taskResult.exit) {
        // 非同期でshutdownを実行
        this.shutdown().catch(error => {
          console.error('Shutdown error:', error);
        });
        return;
      }
      
      // メッセージ表示
      if (taskResult.message) {
        if (taskResult.display || task.payload.type === 'slash_command') {
          console.log(taskResult.message);
        } else {
          // 通常のメッセージレスポンス（フォーマット付き）
          this.displayResponse(taskResult.response || taskResult.message, taskResult.stats);
        }
      }
    }
    
    console.log(chalk.green(`✅ [${task.id}] 完了 (${result.duration}ms)`));
  }

  /**
   * タスクエラー処理
   */
  private handleTaskError(task: QueuedTask<any>, error: Error): void {
    console.log(chalk.red(`❌ [${task.id}] エラー: ${error.message}`));
  }

  /**
   * レスポンス表示
   */
  private displayResponse(response: string, stats?: any): void {
    if (!response) return;
    
    // フォーマット付きレスポンス表示
    const formattedResponse = response.split('\\n').map((line, index) => {
      if (index === 0) {
        return chalk.cyan('> ') + line;
      }
      return '  ' + line;
    }).join('\\n');
    
    console.log(formattedResponse);
    
    // 統計情報表示
    if (stats) {
      const contextUsage = Math.round((stats.totalTokens / 200000) * 100);
      const remaining = 100 - Math.min(100, contextUsage);
      console.log(chalk.gray(`\\n[Context: ${remaining}% remaining | ${stats.totalTokens.toLocaleString()} tokens used]`));
    }
    
    console.log(); // 空行
  }

  /**
   * キュー状態の表示
   */
  private displayQueueStatus(): void {
    const status = this.inputQueue.getStatus();
    if (status.queue.totalTasks > 0 || status.isProcessing) {
      const parts = [];
      if (status.isProcessing) parts.push(chalk.yellow('処理中:1'));
      if (status.queue.urgent > 0) parts.push(chalk.red(`緊急:${status.queue.urgent}`));
      if (status.queue.normal > 0) parts.push(chalk.blue(`通常:${status.queue.normal}`));
      if (status.queue.low > 0) parts.push(chalk.gray(`低:${status.queue.low}`));
      
      console.log(chalk.gray(`[${parts.join(' | ')}]`));
    }
  }

  /**
   * 状態表示の開始
   */
  private startStatusDisplay(): void {
    // 定期的な状態更新（必要に応じて）
    this.statusInterval = setInterval(() => {
      const status = this.inputQueue.getStatus();
      if (status.queue.totalTasks > 3) {
        // キューが混雑している場合のみ表示
        console.log(chalk.gray(`⏳ キュー: ${status.queue.totalTasks} tasks pending...`));
      }
    }, 10000); // 10秒間隔
  }

  /**
   * プロンプト文字列の生成
   */
  private getPrompt(): string {
    return chalk.gray('> ');
  }

  /**
   * オートコンプリート
   */
  private completer(line: string): [string[], string] {
    const completions = [
      '/help', '/exit', '/clear', '/refresh', '/clearhistory', '/history',
      '/save', '/load', '/tools', '/mcp', '/mcperror', '/mcptools',
      '/model', '/parallel', '/verbose', '/status', '/stop', '/jobs', '/kill'
    ];
    const hits = completions.filter((c) => c.startsWith(line));
    return [hits.length ? hits : completions, line];
  }

  /**
   * ウェルカムメッセージ
   */
  private showWelcome(): void {
    console.clear();
    console.log('');
    console.log('   ' + chalk.cyan.bold('AGENTS - Enhanced Async REPL'));
    console.log('   ' + chalk.gray('Powered by DeepAgents Technology'));
    console.log('');
    
    // セッション情報
    const history = this.agent.getHistory();
    if (history.length > 0) {
      console.log(chalk.yellow(`📂 Session continued (${history.length} messages in history)`));
      this.showRecentHistory(history);
    } else {
      console.log(chalk.gray('🆕 New session started'));
    }
    
    console.log('');
    console.log(chalk.gray('✨ 新機能:'));
    console.log(chalk.gray('  • 処理中でも新しい入力が可能'));
    console.log(chalk.gray('  • 優先度付きタスクキュー'));
    console.log(chalk.gray('  • リアルタイム状態表示'));
    console.log(chalk.gray('  • /help でコマンド一覧を表示'));
    console.log('');
  }

  /**
   * 最近の履歴表示
   */
  private showRecentHistory(history: any[]): void {
    console.log(chalk.cyan('Recent conversation:'));
    console.log(chalk.gray('─'.repeat(50)));
    
    const recentHistory = history.slice(-3);
    recentHistory.forEach((entry, index) => {
      const isLast = index === recentHistory.length - 1;
      const roleColor = entry.role === 'user' ? chalk.blue : chalk.green;
      const roleLabel = entry.role === 'user' ? 'You' : 'AI';
      
      console.log(roleColor(`${roleLabel}:`));
      
      let content = entry.content;
      if (content.length > 200) {
        content = content.substring(0, 200) + '...';
      }
      
      content.split('\\n').forEach((line: string) => {
        console.log(`  ${line}`);
      });
      
      if (!isLast) {
        console.log('');
      }
    });
    
    console.log(chalk.gray('─'.repeat(50)));
  }

  /**
   * 中断処理 (Ctrl+C)
   */
  private async handleInterrupt(): Promise<void> {
    console.log('\\n\\n' + chalk.yellow('🔄 中断信号を受信しました'));
    
    const status = this.inputQueue.getStatus();
    if (status.isProcessing || status.queue.totalTasks > 0) {
      console.log(chalk.yellow('処理中のタスクがあります:'));
      console.log(chalk.yellow(`  処理中: ${status.isProcessing ? 1 : 0}`));
      console.log(chalk.yellow(`  キュー: ${status.queue.totalTasks}`));
      console.log(chalk.yellow('全てのタスクを停止しています...'));
      
      // 強化された緊急停止プロセスを実行
      await Promise.all([
        this.inputQueue.emergencyStop(),
        this.commandProcessor.emergencyStopAll()
      ]);
      
      console.log(chalk.green('✅ 全ての処理が停止されました'));
    } else {
      // アクティブなプロセスがある場合は強制停止
      await this.commandProcessor.emergencyStopAll();
    }
    
    await this.shutdown();
  }

  /**
   * 終了処理 (SIGTERM)
   */
  private async handleTerminate(): Promise<void> {
    console.log('\\n' + chalk.red('終了信号を受信しました'));
    await this.shutdown();
  }

  /**
   * 終了処理
   */
  private async handleClose(): Promise<void> {
    if (this.isRunning) {
      await this.shutdown();
    }
  }

  /**
   * システムシャットダウン
   */
  private async shutdown(): Promise<void> {
    if (!this.isRunning) return;
    
    console.log(chalk.gray('\nシステムを終了しています...'));
    this.isRunning = false;
    
    // 状態表示停止
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
    
    // アクティブな処理の停止
    this.activePromises.forEach((promise, taskId) => {
      console.log(chalk.gray(`  タスク ${taskId} を中断中...`));
    });
    
    // クリーンアップ（非同期対応）
    try {
      this.inputQueue.cleanup();
      await this.commandProcessor.cleanup();
    } catch (error) {
      console.log(chalk.red(`クリーンアップエラー: ${error}`));
    }
    
    // 統計表示
    console.log('');
    console.log(this.tokenCounter.formatStats());
    console.log('');
    
    // readline終了
    this.rl.close();
    
    // 終了イベント発火
    this.emit('exit');
  }
}

/**
 * REPLを開始する関数（既存のAPIとの互換性維持）
 */
export function startREPL(agent: AgentCore, mcpManager: MCPManager): Promise<void> {
  const asyncREPL = new AsyncREPL(agent, mcpManager);
  return asyncREPL.start();
}

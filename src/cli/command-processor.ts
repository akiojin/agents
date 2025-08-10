import EventEmitter from 'events';
import chalk from 'chalk';
import inquirer from 'inquirer';
import type { AgentCore } from '../core/agent.js';
import { ContinuousExecutionEngine } from '../core/agent.js';
import type { MCPManager } from '../mcp/manager.js';
import { InputItem, InputType, ProcessingResult } from './input-queue-manager.js';
import { QueuedTask } from './priority-queue.js';
import { logger } from '../utils/logger.js';
import { TokenCounter } from '../utils/token-counter.js';
import { BackgroundShellManager, ShellSessionStatus } from '../shell/background-shell-manager.js';
import { OutputStreamer } from '../shell/output-streamer.js';

/**
 * コマンド処理クラス
 * InputQueueManagerから受け取ったタスクを実際に処理する
 */
// IntegratedMemorySystemを追加
import { IntegratedMemorySystem } from '../../packages/memory/src/index.js';

export class CommandProcessor extends EventEmitter {
  private agent: AgentCore;
  private mcpManager: MCPManager;
  private tokenCounter: TokenCounter;
  private shellManager: BackgroundShellManager;
  private outputStreamer: OutputStreamer;
  private memorySystem: IntegratedMemorySystem;
  private isShuttingDown = false;
  
  // プロセス管理の強化
  private activeAbortControllers = new Map<string, AbortController>();
  private activeProcesses = new Set<number>(); // PIDを追跡
  private emergencyShutdownTimeout?: NodeJS.Timeout;
  
  constructor(agent: AgentCore, mcpManager: MCPManager, tokenCounter: TokenCounter) {
    super();
    this.agent = agent;
    this.mcpManager = mcpManager;
    this.tokenCounter = tokenCounter;
    this.shellManager = new BackgroundShellManager();
    this.outputStreamer = new OutputStreamer();
    
    // 記憶システムの初期化
    this.memorySystem = new IntegratedMemorySystem({
      decayInterval: 60000, // 1分ごとに記憶減衰チェック
      memoryThreshold: 0.3, // 記憶強度のしきい値
      maxMemories: 10000 // 最大記憶数
    });
    
    // ShellManagerとOutputStreamerを連携
    this.setupShellIntegration();
    
    // 記憶システムの初期化を非同期で実行
    this.initializeMemorySystem();
    
    logger.debug('CommandProcessor initialized with shell support and memory system');
  }
  
  /**
   * Shell機能の統合セットアップ
   */
  private setupShellIntegration(): void {
    // ShellManagerの出力をOutputStreamerに転送
    this.shellManager.on('output', (outputData) => {
      this.outputStreamer.processOutput(outputData);
    });
    
    // セッション完了時の処理
    this.shellManager.on('session:completed', (session) => {
      this.outputStreamer.finalizeSession(session.id);
    });
    
    // 各種イベントをREPLに転送
    this.shellManager.on('session:started', (session) => {
      this.emit('shell:session:started', session);
    });
    
    this.shellManager.on('session:completed', (session) => {
      this.emit('shell:session:completed', session);
    });
    
    this.shellManager.on('session:killed', (session, reason) => {
      this.emit('shell:session:killed', session, reason);
    });
  }

  /**
   * 記憶システムの初期化
   */
  private async initializeMemorySystem(): Promise<void> {
    try {
      await this.memorySystem.initialize();
      logger.info('IntegratedMemorySystem initialized successfully');
      
      // 自動減衰を開始
      this.memorySystem.startAutoDecay();
      
    } catch (error) {
      logger.error('Failed to initialize IntegratedMemorySystem', error);
      // ChromaDBが利用できない場合でも続行（記憶機能なしで動作）
    }
  }

  /**
   * タスクを処理する
   */
  /**
   * AbortControllerを登録・管理する
   */
  registerAbortController(taskId: string, abortController: AbortController): void {
    this.activeAbortControllers.set(taskId, abortController);
    
    // AbortController完了時に自動削除
    abortController.signal.addEventListener('abort', () => {
      this.activeAbortControllers.delete(taskId);
    });
    
    logger.debug(`AbortController registered for task: ${taskId}`);
  }

  /**
   * プロセスIDを登録・追跡する
   */
  registerProcess(pid: number): void {
    this.activeProcesses.add(pid);
    logger.debug(`Process registered: ${pid}`);
  }

  /**
   * プロセスIDの登録を削除する
   */
  unregisterProcess(pid: number): void {
    this.activeProcesses.delete(pid);
    logger.debug(`Process unregistered: ${pid}`);
  }

  /**
   * 全てのアクティブタスクを緊急停止する
   */
  emergencyStopAll(): Promise<void> {
    return new Promise((resolve) => {
      console.log(chalk.red('🚨 緊急停止プロセスを開始しています...'));
      
      let stoppedCount = 0;
      const totalItems = this.activeAbortControllers.size + this.activeProcesses.size;
      
      if (totalItems === 0) {
        console.log(chalk.green('✅ 停止対象のプロセスがありません'));
        resolve();
        return;
      }
      
      // 全てのAbortControllerを実行
      for (const [taskId, controller] of this.activeAbortControllers.entries()) {
        try {
          console.log(chalk.yellow(`⏹️  タスク停止中: ${taskId}`));
          controller.abort();
          stoppedCount++;
        } catch (error) {
          console.log(chalk.red(`❌ タスク停止失敗: ${taskId} - ${error}`));
        }
      }
      
      // 全てのプロセスを強制終了
      for (const pid of this.activeProcesses) {
        try {
          console.log(chalk.yellow(`🔴 プロセス強制終了中: PID ${pid}`));
          process.kill(pid, 'SIGTERM');
          
          // 3秒後にSIGKILLで強制終了
          setTimeout(() => {
            try {
              process.kill(pid, 'SIGKILL');
              console.log(chalk.red(`💥 プロセス強制終了: PID ${pid} (SIGKILL)`));
            } catch (killError) {
              // プロセスが既に終了している場合は無視
            }
          }, 3000);
          
          stoppedCount++;
        } catch (error) {
          console.log(chalk.red(`❌ プロセス停止失敗: PID ${pid} - ${error}`));
        }
      }
      
      // タイムアウト付きで完了を待つ
      this.emergencyShutdownTimeout = setTimeout(() => {
        console.log(chalk.yellow(`⚠️  緊急停止完了: ${stoppedCount}/${totalItems} 項目処理`));
        resolve();
      }, 5000); // 5秒でタイムアウト
    });
  }

  /**
   * 特定タスクの中断
   */
  abortTask(taskId: string): boolean {
    const controller = this.activeAbortControllers.get(taskId);
    if (controller && !controller.signal.aborted) {
      controller.abort();
      console.log(chalk.yellow(`🛑 タスクを中断しました: ${taskId}`));
      return true;
    }
    return false;
  }

  async processTask(task: QueuedTask<InputItem>): Promise<ProcessingResult> {
    const startTime = Date.now();
    
    try {
      if (this.isShuttingDown) {
        throw new Error('System is shutting down');
      }
      
      // AbortControllerが提供されている場合は登録
      if (task.abortController) {
        this.registerAbortController(task.id, task.abortController);
      }

      logger.debug(`Processing task: ${task.id}, type: ${task.payload.type}`);
      
      let result: any;
      
      switch (task.payload.type) {
        case InputType.SLASH_COMMAND:
          result = await this.handleSlashCommand(task);
          break;
        case InputType.MESSAGE:
          result = await this.handleMessage(task);
          break;
        case InputType.SYSTEM:
          result = await this.handleSystemCommand(task);
          break;
        default:
          throw new Error(`Unknown input type: ${task.payload.type}`);
      }
      
      const duration = Date.now() - startTime;
      
      return {
        success: true,
        result,
        duration
      };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(`Task processing failed: ${task.id}`, error);
      
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        duration
      };
    }
  }

  /**
   * スラッシュコマンドの処理
   */
  private async handleSlashCommand(task: QueuedTask<InputItem>): Promise<any> {
    const { command, args } = task.payload;
    
    if (!command) {
      throw new Error('Invalid slash command');
    }

    // AbortControllerによる中断チェック
    if (task.abortController?.signal.aborted) {
      throw new Error('Task was aborted');
    }
    
    switch (command) {
      case '/help':
        return this.showHelp();
        
      case '/exit':
        return this.handleExit();
        
      case '/clear':
        return this.handleClear();
        
      case '/refresh':
        return this.handleRefresh();
        
      case '/clearhistory':
        return this.handleClearHistory();
        
      case '/history':
        return this.handleHistory();
        
      case '/save':
        return this.handleSave(args);
        
      case '/load':
        return this.handleLoad(args);
        
      case '/tools':
        return this.handleTools();
        
      case '/mcp':
        return this.handleMcp();
        
      case '/mcperror':
        return this.handleMcpError();
        
      case '/mcptools':
        return this.handleMcpTools();
        
      case '/model':
        return this.handleModel(args, task.abortController);
        
      case '/parallel':
        return this.handleParallel();
        
      case '/verbose':
        return this.handleVerbose();
        
      case '/status':
        return this.handleStatus();
        
      case '/stop':
        return this.handleStop(args);
        
      case '/jobs':
        return this.handleJobs();
        
      case '/kill':
        return this.handleKill(args);
        
      case '/shell':
        return this.handleShell(args);
        
      case '/output':
        return this.handleOutput(args);
        
      case '/attach':
        return this.handleAttach(args);
        
      case '/clear-logs':
        return this.handleClearLogs(args);
        
      // /deepコマンドは廃止（通常メッセージがデフォルトで深い実行を行うため）
      // case '/deep':
      //   return this.handleDeepExecution(args, task.abortController);
        
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  /**
   * 通常メッセージの処理
   */
  private async handleMessage(task: QueuedTask<InputItem>): Promise<any> {
    const startTime = Date.now();
    
    // AbortControllerによる中断チェック
    if (task.abortController?.signal.aborted) {
      throw new Error('Task was aborted');
    }
    
    const input = task.payload.content;
    
    try {
      // Phase 1: 記憶検索フェーズ
      console.log(chalk.cyan('🔍 記憶検索フェーズ...'));
      
      // 類似タスクや過去のエラーパターンを検索
      const relevantMemories = await this.memorySystem.recall(input, {
        limit: 5,
        minSimilarity: 0.7
      });
      
      // エラーパターンをチェック
      const errorSolution = await this.memorySystem.findErrorSolution(input, {
        context: input,
        timestamp: new Date()
      });
      
      if (errorSolution) {
        console.log(chalk.yellow('⚠️ 過去の類似エラーパターンを検出'));
        console.log(chalk.gray(`  解決策: ${errorSolution.solution}`));
      }
      
      // Phase 2: 深い思考フェーズ（継続実行エンジンを使用）
      console.log(chalk.cyan('🧠 深い思考フェーズ...'));
      
      // ContinuousExecutionEngineの初期化
      const engine = new ContinuousExecutionEngine(this.agent);
      
      // 記憶情報を含めたコンテキストを構築
      let enrichedInput = input;
      if (relevantMemories.length > 0) {
        const memoryContext = relevantMemories
          .map((m: any) => `[過去の経験] ${m.content}`)
          .join('\n');
        enrichedInput = `${input}\n\n関連する過去の経験:\n${memoryContext}`;
      }
      
      if (errorSolution) {
        enrichedInput += `\n\n⚠️ 注意: 類似のエラーパターンが過去に発生しています。\n推奨される解決策: ${errorSolution.solution}`;
      }
      
      // Phase 3: 継続実行フェーズ
      console.log(chalk.cyan('🚀 継続実行フェーズ...'));
      
      // トークンカウント
      this.tokenCounter.addInput(enrichedInput);
      this.tokenCounter.incrementTurn();
      
      // 継続実行エンジンで実行
      const executionResult = await engine.executeUntilComplete(enrichedInput, {
        requireUserApproval: false,
        maxExecutionTime: 30, // 30分
        allowManualIntervention: true
      });
      
      const duration = Date.now() - startTime;
      
      // トークンカウント
      this.tokenCounter.addOutput(executionResult.finalResult);
      this.tokenCounter.addApiDuration(duration);
      
      // Phase 4: 学習保存フェーズ
      console.log(chalk.cyan('💾 学習保存フェーズ...'));
      
      if (executionResult.success) {
        // 成功パターンの保存
        await this.memorySystem.storeSuccessPattern(
          input,
          executionResult.taskSteps || [],
          executionResult.finalResult
        );
        console.log(chalk.green('✅ 成功パターンを記憶しました'));
      } else if (executionResult.error) {
        // エラーパターンの保存
        await this.memorySystem.storeErrorPattern(
          executionResult.error,
          executionResult.partialResult || '部分的な実行結果',
          { task: input, timestamp: new Date() }
        );
        console.log(chalk.yellow('📝 エラーパターンを記憶しました'));
      }
      
      // 記憶ネットワークの更新
      if (this.memorySystem.synapticNetwork) {
        // 記憶の活性化と学習
        await this.memorySystem.synapticNetwork.activate(input, {
          strengthenConnections: true,
          propagate: true
        });
        
        // 結果に基づいて記憶を更新
        await this.memorySystem.synapticNetwork.updateOutcome(
          input,
          executionResult.success
        );
      }
      
      // 実行結果の構築
      const response = executionResult.success
        ? executionResult.finalResult
        : `エラーが発生しましたが、部分的に実行しました。\n\n${executionResult.partialResult || ''}\n\nエラー: ${executionResult.error}`;
      
      return {
        response,
        stats: this.tokenCounter.getStats(),
        executionSummary: {
          success: executionResult.success,
          tasksCompleted: executionResult.tasksCompleted,
          tasksTotal: executionResult.tasksTotal,
          duration: Math.round(duration / 1000) + '秒',
          memoryUsed: relevantMemories.length > 0
        }
      };
      
    } catch (error) {
      // エラー時も学習
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      try {
        await this.memorySystem.storeErrorPattern(
          errorMessage,
          'タスク実行に失敗しました',
          { task: input, timestamp: new Date() }
        );
      } catch (memoryError) {
        logger.error('Failed to store error pattern', memoryError);
      }
      
      throw error;
    }
  }

  /**
   * システムコマンドの処理
   */
  private async handleSystemCommand(task: QueuedTask<InputItem>): Promise<any> {
    const content = task.payload.content;
    
    switch (content) {
      case 'shutdown':
        this.isShuttingDown = true;
        return { message: 'System shutdown initiated' };
      case 'status':
        return this.getSystemStatus();
      default:
        throw new Error(`Unknown system command: ${content}`);
    }
  }

  /**
   * ヘルプの表示
   */
  private showHelp(): any {
    const helpText = [
      chalk.cyan('Available commands:'),
      '',
      chalk.yellow('General:'),
      '  /help        - Show help',
      '  /exit        - Exit',
      '  /clear       - Clear conversation history and screen',
      '  /refresh     - Clear screen only',
      '  /status      - Show system status',
      '',
      chalk.yellow('Conversation:'),
      '  /clearhistory - Clear conversation history',
      '  /history     - Show history',
      '  /save <file> - Save conversation',
      '  /load <file> - Load conversation',
      '',
      chalk.yellow('System:'),
      '  /tools       - Show available tools',
      '  /mcp         - Show MCP server status',
      '  /mcperror    - Show MCP server error details',
      '  /mcptools    - Show MCP tools list',
      '  /model <name>- Change model',
      '  /parallel    - Toggle parallel execution mode',
      '  /verbose     - Toggle verbose mode',
      '',
      chalk.yellow('Background Shell:'),
      '  /shell <cmd> - Run command in background',
      '  /jobs        - Show background jobs',
      '  /output <id> - Show job output',
      '  /attach <id> - Attach to job output stream',
      '  /kill <id>   - Kill background job',
      '  /clear-logs  - Clear shell session logs',
      '',
      chalk.yellow('Task Control:'),
      '  /stop        - Stop current processing'
    ].join('\\n');
    
    return { message: helpText, display: true };
  }

  /**
   * 終了処理
   */
  private handleExit(): any {
    this.isShuttingDown = true;
    const stats = this.tokenCounter.formatStats();
    
    // イベント発火で外部に終了を通知
    this.emit('exit:requested', stats);
    
    return { 
      message: 'Goodbye!',
      stats,
      exit: true
    };
  }

  /**
   * 履歴クリア
   */
  private handleClear(): any {
    this.agent.clearHistory();
    return { 
      message: chalk.green('History cleared and screen refreshed'),
      clearScreen: true
    };
  }

  /**
   * 画面リフレッシュ
   */
  private handleRefresh(): any {
    return { 
      message: '',
      clearScreen: true
    };
  }

  /**
   * 履歴のみクリア
   */
  private handleClearHistory(): any {
    this.agent.clearHistory();
    return { message: chalk.green('Conversation history cleared') };
  }

  /**
   * 履歴表示
   */
  private handleHistory(): any {
    const history = this.agent.getHistory();
    const historyText = history.map((entry, index) => {
      return `${chalk.gray(`[${index + 1}]`)} ${entry.role}: ${entry.content}`;
    }).join('\\n');
    
    return { 
      message: historyText || chalk.gray('No history available'),
      display: true
    };
  }

  /**
   * セッション保存
   */
  private async handleSave(filename?: string): Promise<any> {
    let saveFilename = filename;
    if (!saveFilename) {
      const now = new Date();
      const timestamp = now.toISOString()
        .replace(/[:.]/g, '-')
        .replace('T', '_')
        .slice(0, -5);
      saveFilename = `session_${timestamp}.json`;
    }
    
    try {
      await this.agent.saveSession(saveFilename);
      return { message: chalk.green(`Session saved: ${saveFilename}`) };
    } catch (error) {
      throw new Error(`Failed to save session: ${error}`);
    }
  }

  /**
   * セッション読み込み
   */
  private async handleLoad(filename?: string): Promise<any> {
    if (!filename) {
      throw new Error('Please specify a filename');
    }
    
    try {
      await this.agent.loadSession(filename);
      return { message: chalk.green(`Session loaded: ${filename}`) };
    } catch (error) {
      throw new Error(`Failed to load session: ${error}`);
    }
  }

  /**
   * ツール一覧表示
   */
  private async handleTools(): Promise<any> {
    const tools = await this.mcpManager.listTools();
    const toolsText = tools.map(tool => `  - ${tool.name}: ${tool.description}`).join('\\n');
    
    return { 
      message: `${chalk.cyan('Available tools:')}\\n${toolsText}`,
      display: true
    };
  }

  /**
   * MCP状態表示
   */
  private handleMcp(): any {
    const progress = this.agent.getMCPInitializationProgress();
    
    if (!progress) {
      return { message: chalk.red('MCP manager not available') };
    }
    
    const statusText = [
      chalk.cyan('=== MCP Server Status ==='),
      progress.isInitializing ? 
        chalk.yellow(`🔄 Initializing... (${progress.completed}/${progress.total} completed)`) :
        chalk.green(`[OK] Initialization completed (${progress.completed}/${progress.total} servers)`),
      progress.failed > 0 ? chalk.red(`❌ ${progress.failed} server(s) failed`) : ''
    ].filter(Boolean).join('\\n');
    
    return { message: statusText, display: true };
  }

  /**
   * MCPエラー詳細
   */
  private handleMcpError(): any {
    // グローバル変数からエラー情報を取得（既存実装を維持）
    const failedServers = (global as any).__failedMCPServers;
    
    if (!failedServers || failedServers.length === 0) {
      return { message: chalk.yellow('No MCP server errors to display') };
    }
    
    const errorText = failedServers.map((server: any) => {
      const typeIndicator = server.type === 'http' ? '🌐' : server.type === 'sse' ? '⚡' : '📡';
      return `${typeIndicator} ${chalk.red(server.name)}\\n  Error: ${server.error}`;
    }).join('\\n\\n');
    
    return { 
      message: `${chalk.cyan('=== MCP Server Error Details ===')}\\n${errorText}`,
      display: true
    };
  }

  /**
   * MCPツール一覧
   */
  private async handleMcpTools(): Promise<any> {
    const tools = await this.mcpManager.listTools();
    const toolsText = tools.map(tool => `  ${tool.name}: ${tool.description}`).join('\\n');
    
    return { 
      message: `${chalk.cyan('MCP Tools:')}\\n${toolsText}`,
      display: true
    };
  }

  /**
   * モデル変更
   */
  private async handleModel(modelName?: string, abortController?: AbortController): Promise<any> {
    if (!modelName) {
      // インタラクティブモード
      const availableModels = await this.agent.listAvailableModels();
      const currentModel = this.agent.getCurrentModel();
      
      if (availableModels.length === 0) {
        return { message: chalk.red('利用可能なモデルを取得できませんでした。') };
      }
      
      const choices = availableModels.map(model => ({
        name: model === currentModel ? `${model} (現在選択中)` : model,
        value: model,
        short: model
      }));
      
      choices.push({ name: 'キャンセル', value: 'cancel', short: 'キャンセル' });
      
      if (abortController?.signal.aborted) {
        throw new Error('Model selection was aborted');
      }
      
      const answer = await inquirer.prompt([{
        type: 'list',
        name: 'selectedModel',
        message: 'モデルを選択してください:',
        choices: choices,
        pageSize: 10
      }]);
      
      if (answer.selectedModel === 'cancel') {
        return { message: chalk.gray('モデル変更をキャンセルしました。') };
      }
      
      if (answer.selectedModel === currentModel) {
        return { message: chalk.yellow('同じモデルが選択されました。変更はありません。') };
      }
      
      const success = await this.agent.setModel(answer.selectedModel);
      if (success) {
        return { message: chalk.green(`✅ モデルが ${answer.selectedModel} に変更されました`) };
      } else {
        throw new Error('モデルの変更に失敗しました');
      }
    } else {
      // 直接指定モード
      const success = await this.agent.setModel(modelName);
      if (success) {
        return { message: chalk.green(`✅ モデルが ${modelName} に変更されました`) };
      } else {
        throw new Error('モデルの変更に失敗しました');
      }
    }
  }

  /**
   * 並列実行モードの切り替え
   */
  private handleParallel(): any {
    const isParallel = this.agent.toggleParallelMode();
    return { 
      message: chalk.yellow(`Parallel execution mode: ${isParallel ? 'Enabled' : 'Disabled'}`)
    };
  }

  /**
   * 詳細モードの切り替え
   */
  private handleVerbose(): any {
    const isVerbose = this.agent.toggleVerboseMode();
    return { 
      message: chalk.yellow(`Verbose mode: ${isVerbose ? 'Enabled' : 'Disabled'}`)
    };
  }

  /**
   * システム状態の表示
   */
  private handleStatus(): any {
    return this.getSystemStatus();
  }

  /**
   * 処理停止
   */
  private handleStop(target?: string): any {
    if (target) {
      // 特定のタスクを停止
      this.emit('stop:task', target);
      return { message: chalk.yellow(`Stopping task: ${target}`) };
    } else {
      // 全体停止
      this.emit('stop:all');
      return { message: chalk.yellow('Stopping all processing') };
    }
  }

  /**
   * ジョブ一覧表示
   */
  private handleJobs(): any {
    const sessions = this.shellManager.getAllSessions();
    
    if (sessions.length === 0) {
      return { message: chalk.gray('No background jobs running'), display: true };
    }
    
    const stats = this.shellManager.getStats();
    const lines = [
      chalk.cyan(`📋 Background Jobs (${sessions.length} total)`),
      chalk.gray(`Running: ${stats.running}, Completed: ${stats.completed}, Failed: ${stats.failed}`),
      ''
    ];
    
    // 実行中のジョブを先に表示
    const runningSessions = sessions
      .filter(s => s.status === ShellSessionStatus.RUNNING)
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    
    if (runningSessions.length > 0) {
      lines.push(chalk.green('🟢 Running Jobs:'));
      runningSessions.forEach(session => {
        const duration = Date.now() - session.startTime.getTime();
        const durationStr = this.formatDuration(duration);
        lines.push(`  ${chalk.yellow(session.id)}: ${session.command} ${session.args.join(' ')}`);
        lines.push(`    ${chalk.gray(`Started: ${session.startTime.toLocaleTimeString()}, Duration: ${durationStr}`)}`);
        lines.push(`    ${chalk.gray(`PID: ${session.pid}, Working Dir: ${session.workingDirectory}`)}`);
      });
      lines.push('');
    }
    
    // 完了済み・失敗したジョブ（最新5件）
    const completedSessions = sessions
      .filter(s => s.status !== ShellSessionStatus.RUNNING)
      .sort((a, b) => (b.endTime?.getTime() || 0) - (a.endTime?.getTime() || 0))
      .slice(0, 5);
    
    if (completedSessions.length > 0) {
      lines.push(chalk.blue('📄 Recent Completed Jobs:'));
      completedSessions.forEach(session => {
        const statusIcon = this.getStatusIcon(session.status);
        const durationStr = session.duration ? this.formatDuration(session.duration) : 'Unknown';
        lines.push(`  ${statusIcon} ${chalk.yellow(session.id)}: ${session.command} ${session.args.join(' ')}`);
        lines.push(`    ${chalk.gray(`Status: ${session.status}, Duration: ${durationStr}, Exit Code: ${session.exitCode || 'N/A'}`)}`);
      });
    }
    
    return { message: lines.join('\\n'), display: true };
  }

  /**
   * ジョブ終了
   */
  private handleKill(jobId?: string): any {
    if (!jobId) {
      throw new Error('Please specify a job ID (use /jobs to see available jobs)');
    }
    
    const session = this.shellManager.getSession(jobId);
    if (!session) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    if (session.status !== ShellSessionStatus.RUNNING) {
      return { message: chalk.yellow(`Job ${jobId} is not running (status: ${session.status})`) };
    }
    
    const success = this.shellManager.killSession(jobId);
    if (success) {
      return { message: chalk.green(`✅ Job ${jobId} killed successfully`) };
    } else {
      throw new Error(`Failed to kill job: ${jobId}`);
    }
  }

  /**
   * バックグラウンドシェルコマンド実行
   */
  private handleShell(command?: string): any {
    if (!command) {
      throw new Error('Please specify a command to run (e.g., /shell npm run build)');
    }
    
    try {
      // コマンドを解析
      const parts = command.trim().split(' ');
      const cmd = parts[0];
      const args = parts.slice(1);
      
      const sessionId = this.shellManager.startSession(cmd, {
        args,
        cwd: process.cwd(),
        timeout: 30 * 60 * 1000 // 30分
      });
      
      return { 
        message: chalk.green(`🚀 Started background job: ${chalk.yellow(sessionId)}\\n`) +
                chalk.gray(`Command: ${command}\\n`) +
                chalk.gray(`Use '/output ${sessionId}' to view output\\n`) +
                chalk.gray(`Use '/attach ${sessionId}' for real-time streaming\\n`) +
                chalk.gray(`Use '/kill ${sessionId}' to stop`)
      };
      
    } catch (error) {
      throw new Error(`Failed to start background job: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * ジョブ出力表示
   */
  private handleOutput(jobId?: string): any {
    if (!jobId) {
      throw new Error('Please specify a job ID (use /jobs to see available jobs)');
    }
    
    const session = this.shellManager.getSession(jobId);
    if (!session) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    const outputs = this.outputStreamer.getSessionOutput(jobId, {
      lines: 100,
      type: 'both'
    });
    
    if (outputs.length === 0) {
      return { 
        message: chalk.gray(`No output available for job: ${jobId}\\n`) +
                chalk.gray(`Job status: ${session.status}`)
      };
    }
    
    const lines = [
      chalk.cyan(`📺 Output for job: ${jobId} (last ${outputs.length} lines)`),
      chalk.gray(`Status: ${session.status}, Started: ${session.startTime.toLocaleString()}`),
      chalk.gray('─'.repeat(80))
    ];
    
    outputs.forEach(output => {
      const timestamp = output.timestamp.toLocaleTimeString();
      const typeColor = output.type === 'stderr' ? chalk.red : chalk.white;
      const prefix = chalk.gray(`[${timestamp}]`);
      lines.push(`${prefix} ${typeColor(output.data.trimEnd())}`);
    });
    
    lines.push(chalk.gray('─'.repeat(80)));
    lines.push(chalk.gray(`Use '/attach ${jobId}' for real-time streaming`));
    
    return { message: lines.join('\\n'), display: true };
  }

  /**
   * ジョブ出力にアタッチ（リアルタイムストリーミング）
   */
  private handleAttach(jobId?: string): any {
    if (!jobId) {
      throw new Error('Please specify a job ID (use /jobs to see available jobs)');
    }
    
    const session = this.shellManager.getSession(jobId);
    if (!session) {
      throw new Error(`Job not found: ${jobId}`);
    }
    
    if (session.status === ShellSessionStatus.RUNNING) {
      // リアルタイムストリーミングを開始
      const stopStreaming = this.outputStreamer.startStreamingSession(jobId, (output) => {
        const timestamp = output.timestamp.toLocaleTimeString();
        const typeColor = output.type === 'stderr' ? chalk.red : chalk.white;
        console.log(`[${chalk.yellow(jobId)}] ${chalk.gray(timestamp)} ${typeColor(output.data.trimEnd())}`);
      });
      
      // ストリーミング停止の仕組み（実装時に追加予定）
      this.emit('streaming:started', jobId, stopStreaming);
      
      return {
        message: chalk.green(`🔗 Attached to job: ${jobId}\\n`) +
                chalk.gray('Real-time output streaming started\\n') +
                chalk.gray('Press Ctrl+C or use /stop to detach')
      };
    } else {
      return {
        message: chalk.yellow(`Job ${jobId} is not running (status: ${session.status})\\n`) +
                chalk.gray(`Use '/output ${jobId}' to view final output`)
      };
    }
  }

  /**
   * ログクリア
   */
  private handleClearLogs(sessionId?: string): any {
    if (sessionId) {
      // 特定セッションのログをクリア
      const session = this.shellManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Job not found: ${sessionId}`);
      }
      
      this.outputStreamer.clearSession(sessionId);
      return { message: chalk.green(`✅ Logs cleared for job: ${sessionId}`) };
    } else {
      // 全ログクリア
      const sessionIds = this.shellManager.getAllSessions().map(s => s.id);
      sessionIds.forEach(id => this.outputStreamer.clearSession(id));
      
      return { message: chalk.green(`✅ Logs cleared for all jobs (${sessionIds.length} sessions)`) };
    }
  }

  /**
   * システム状態の取得
   */
  private getSystemStatus(): any {
    const stats = this.tokenCounter.getStats();
    const currentModel = this.agent.getCurrentModel();
    
    const statusText = [
      chalk.cyan('📊 System Status:'),
      `  Model: ${currentModel}`,
      `  Total tokens: ${stats.totalTokens.toLocaleString()}`,
      `  Total turns: ${stats.totalTurns}`,
      `  Average response time: ${stats.averageResponseTime.toFixed(2)}ms`,
      `  Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`
    ].join('\\n');
    
    return { 
      message: statusText,
      display: true
    };
  }

  /**
   * シャットダウン状態の設定
   */
  /**
   * DeepAgents継続実行モード
   */
  private async handleDeepExecution(taskDescription?: string, abortController?: AbortController): Promise<any> {
    if (!taskDescription) {
      throw new Error('タスクの説明を入力してください (例: /deep "React アプリのバグを修正して単体テストを作成")');
    }

    try {
      // DeepAgentsエンジンの初期化
      console.log(chalk.cyan('🧠 DeepAgents継続実行モードを開始しています...'));
      
      const engine = new ContinuousExecutionEngine(this.agent);
      
      // AbortControllerの監視
      if (abortController) {
        abortController.signal.addEventListener('abort', () => {
          console.log(chalk.yellow('🛑 DeepAgents実行が中断されました'));
        });
      }
      
      console.log(chalk.green(`🎯 タスク: ${taskDescription}`));
      console.log(chalk.gray('デフォルトオプション: 計画作成 + 自動実行'));
      console.log('');
      
      // 継続実行の開始
      const result = await engine.executeUntilComplete(taskDescription, {
        requireUserApproval: false, // 自動実行
        maxExecutionTime: 60, // 60分
        allowManualIntervention: true
      });
      
      // 結果の表示
      const lines = [
        chalk.cyan('🏁 DeepAgents実行結果:'),
        `  ステータス: ${result.success ? chalk.green('成功') : chalk.red('失敗')}`,
        `  完了度: ${result.tasksCompleted}/${result.tasksTotal} タスク (${Math.round((result.tasksCompleted / result.tasksTotal) * 100)}%)`,
        `  実行時間: ${result.totalDuration}分`,
        '',
        chalk.cyan('最終結果:'),
        result.finalResult
      ];
      
      if (result.error) {
        lines.push('');
        lines.push(chalk.red('エラー:'));
        lines.push(chalk.red(`  ${result.error}`));
      }
      
      if (result.performance) {
        lines.push('');
        lines.push(chalk.cyan('パフォーマンス:'));
        lines.push(`  反復回数: ${result.performance.iterations}`);
        lines.push(`  平均反復時間: ${Math.round(result.performance.averageIterationTime / 1000)}秒`);
        lines.push(`  完了率: ${Math.round(result.performance.taskCompletionRate)}%`);
      }
      
      return {
        message: lines.join('\n'),
        display: true,
        deepResult: result
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        message: chalk.red(`❌ DeepAgents実行エラー: ${errorMessage}`),
        display: true
      };
    }
  }

  setShuttingDown(value: boolean): void {
    this.isShuttingDown = value;
  }

  /**
   * 期間をフォーマット（ミリ秒を人間読み取り可能な形式に変換）
   */
  private formatDuration(duration: number): string {
    if (duration < 1000) {
      return `${duration}ms`;
    } else if (duration < 60000) {
      return `${(duration / 1000).toFixed(1)}s`;
    } else if (duration < 3600000) {
      return `${Math.floor(duration / 60000)}m ${Math.floor((duration % 60000) / 1000)}s`;
    } else {
      const hours = Math.floor(duration / 3600000);
      const minutes = Math.floor((duration % 3600000) / 60000);
      return `${hours}h ${minutes}m`;
    }
  }

  /**
   * ステータスアイコンを取得
   */
  private getStatusIcon(status: ShellSessionStatus): string {
    switch (status) {
      case ShellSessionStatus.RUNNING:
        return '🟢';
      case ShellSessionStatus.COMPLETED:
        return '✅';
      case ShellSessionStatus.FAILED:
        return '❌';
      case ShellSessionStatus.KILLED:
        return '🔴';
      case ShellSessionStatus.TIMEOUT:
        return '⏰';
      case ShellSessionStatus.STARTING:
        return '🟡';
      default:
        return '⚪';
    }
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    logger.info('CommandProcessor cleanup started');
    this.isShuttingDown = true;
    
    // 緊急停止タイマーをクリア
    if (this.emergencyShutdownTimeout) {
      clearTimeout(this.emergencyShutdownTimeout);
    }
    
    // 全てのアクティブプロセス・タスクを停止
    await this.emergencyStopAll();
    
    // ShellManagerとOutputStreamerのクリーンアップ
    this.shellManager.cleanup();
    this.outputStreamer.cleanup();
    
    // 記憶システムのクリーンアップ
    if (this.memorySystem) {
      await this.memorySystem.cleanup();
    }
    
    // イベントリスナーをクリア
    this.removeAllListeners();
    
    // アクティブコントローラーをクリア
    this.activeAbortControllers.clear();
    this.activeProcesses.clear();
    
    logger.debug('CommandProcessor cleaned up');
  }
}
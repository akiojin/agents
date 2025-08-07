#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';

import inquirer from 'inquirer';
import { createRequire } from 'module';
import { startREPL } from './cli/repl.js';
import { ConfigManager } from './config/index.js';
import { logger } from './utils/logger.js';
import { AgentCore } from './core/agent.js';
import { MCPManager } from './mcp/manager.js';
import type { Config } from './config/types.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

const program = new Command();

program
  .name('agents')
  .description('オープンソースで完全無料の自律型コーディングエージェント')
  .version(packageJson.version);

// グローバルオプション
program
  .option('-m, --model <model>', 'LLMモデルを指定', 'gpt-4')
  .option('-c, --config <path>', '設定ファイルのパス', '.agents.yaml')
  .option('-v, --verbose', '詳細ログ出力')
  .option('--no-color', 'カラー出力を無効化')
  .option('--max-parallel <number>', '並列タスク実行数', '5')
  .option('--timeout <seconds>', 'タスクタイムアウト（秒）', '300');

// initコマンド
program
  .command('init')
  .description('エージェント設定を初期化')
  .action(async () => {
    const { globalProgressReporter } = await import('./ui/progress.js');
    
    try {
      interface InitAnswers {
        provider: 'openai' | 'anthropic' | 'local-gptoss' | 'local-lmstudio';
        apiKey?: string;
        localEndpoint?: string;
        useMCP: boolean;
      }

      globalProgressReporter.startTask('エージェント初期化', ['TTY確認', '設定入力', '設定ファイル作成']);

      // TTY確認
      globalProgressReporter.updateSubtask(0);
      if (!process.stdin.isTTY) {
        globalProgressReporter.completeTask(false);
        throw new Error(
          '対話型セットアップにはTTY環境が必要です。docker exec -it を使用してください。',
        );
      }

      // 設定入力
      globalProgressReporter.updateSubtask(1);
      const answers: InitAnswers = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'LLMプロバイダーを選択:',
          choices: [
            { name: 'OpenAI', value: 'openai' },
            { name: 'Anthropic', value: 'anthropic' },
            { name: 'Local (GPT-OSS)', value: 'local-gptoss' },
            { name: 'Local (LM Studio)', value: 'local-lmstudio' },
          ],
        },
        {
          type: 'input',
          name: 'apiKey',
          message: 'APIキーを入力（ローカルの場合は空欄）:',
          when: (answers: InitAnswers) => !answers.provider.startsWith('local-'),
        },
        {
          type: 'input',
          name: 'localEndpoint',
          message: 'ローカルエンドポイントURL:',
          default: 'http://127.0.0.1:1234',
          when: (answers: InitAnswers) => answers.provider.startsWith('local-'),
        },
        {
          type: 'confirm',
          name: 'useMCP',
          message: 'MCPツールを有効化しますか？',
          default: true,
        },
      ]);

      // 設定ファイル作成
      globalProgressReporter.updateSubtask(2);
      const configManager = ConfigManager.getInstance();

      // InitAnswersを統一Configに変換
      const unifiedConfig: Partial<Config> = {
        llm: {
          provider: answers.provider,
          apiKey: answers.apiKey,
          timeout: 30000,
          maxRetries: 3,
        },
        mcp: {
          servers: [],
          timeout: 30000,
          enabled: answers.useMCP,
          maxRetries: 3,
        },
      };

      // ローカルプロバイダーの場合はエンドポイントを追加
      if (answers.localEndpoint && answers.provider.startsWith('local-')) {
        // エンドポイント情報は環境変数に設定することを推奨
        process.env.AGENTS_LOCAL_ENDPOINT = answers.localEndpoint;
      }

      await configManager.save(unifiedConfig);
      globalProgressReporter.completeTask(true);
      console.log(chalk.green('✅ 設定を初期化しました'));
    } catch (error) {
      globalProgressReporter.completeTask(false);
      globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
      console.log(chalk.red('❌ 初期化に失敗しました'));
      logger.error('Init failed:', error);
      process.exit(1);
    }
  });

// taskコマンド
program
  .command('task <description>')
  .description('タスクを実行')
  .option('-f, --file <paths...>', 'ターゲットファイル')
  .option('-p, --parallel', '並列実行を有効化', false)
  .action(async (description: string, options) => {
    const { globalProgressReporter } = await import('./ui/progress.js');
    
    globalProgressReporter.startTask('タスク実行準備', ['設定読み込み', 'エージェント初期化', 'MCP初期化', 'タスク実行']);
    
    try {
      // 設定読み込み
      globalProgressReporter.updateSubtask(0);
      const configManager = ConfigManager.getInstance();
      const config = await configManager.load();
      
      // エージェント初期化
      globalProgressReporter.updateSubtask(1);
      const agent = new AgentCore(config);
      const mcpManager = new MCPManager(config);

      // MCP初期化
      globalProgressReporter.updateSubtask(2);
      if (config.mcp?.enabled) {
        await mcpManager.initialize();
        agent.setupMCPTools(mcpManager);
        globalProgressReporter.showInfo('MCPツールが初期化されました');
      }

      // タスク実行
      globalProgressReporter.updateSubtask(3);
      globalProgressReporter.completeTask(true);
      
      const result = config.mcp?.enabled
        ? await agent.executeTaskWithMCP({
            description,
            files: options.file || [],
            parallel: options.parallel,
          })
        : await agent.executeTask({
            description,
            files: options.file || [],
            parallel: options.parallel,
          });

      console.log(chalk.green('✅ タスクが完了しました'));
      console.log(result);
    } catch (error) {
      globalProgressReporter.completeTask(false);
      globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
      logger.error('Task execution failed:', error);
      process.exit(1);
    }
  });



// watchコマンド
program
  .command('watch [paths...]')
  .description('ファイル変更を監視して自動実行')
  .option('-t, --task <task>', '実行するタスク')
  .action(async (paths: string[], options) => {
    console.log(chalk.cyan('ファイル監視を開始します...'));
    const configManager = ConfigManager.getInstance();
    const config = await configManager.load();
    const agent = new AgentCore(config);

    // chokidarを使用してファイル監視
    const { watch } = await import('chokidar');
    const watcher = watch(paths.length > 0 ? paths : ['.'], {
      ignored: /node_modules|\.git|dist/,
      persistent: true,
    });

    watcher.on('change', (path) => {
      void (async () => {
        console.log(chalk.yellow(`変更検出: ${path}`));
        if (options.task) {
          await agent.executeTask({
            description: options.task,
            files: [path],
          });
        }
      })();
    });
  });

// statusコマンド
program
  .command('status')
  .description('エージェントステータスを表示')
  .action(async () => {
    const configManager = ConfigManager.getInstance();
    const config = await configManager.load();
    console.log(chalk.cyan('エージェントステータス:'));
    console.log(chalk.gray('  プロバイダー:'), config.llm.provider);
    console.log(chalk.gray('  モデル:'), config.llm.model || 'デフォルト');
    console.log(chalk.gray('  MCP:'), config.mcp.enabled ? '有効' : '無効');
    console.log(chalk.gray('  並列タスク数:'), config.app.maxParallel);
    console.log(chalk.gray('  タイムアウト:'), `${config.app.timeout / 1000}秒`);
    console.log(chalk.gray('  ログレベル:'), config.app.logLevel);
  });

// 引数なしの場合は対話モードを開始
if (process.argv.length === 2) {
  const { globalProgressReporter } = await import('./ui/progress.js');
  
  globalProgressReporter.startTask('対話モード開始', ['設定読み込み', 'エージェント初期化', 'MCP初期化', 'REPL開始']);
  
  try {
    // 設定読み込み
    globalProgressReporter.updateSubtask(0);
    const configManager = ConfigManager.getInstance();
    const config = await configManager.load();
    
    // エージェント初期化
    globalProgressReporter.updateSubtask(1);
    const agent = new AgentCore(config);
    const mcpManager = new MCPManager(config);

    // MCP初期化
    globalProgressReporter.updateSubtask(2);
    if (config.mcp?.enabled) {
      await mcpManager.initialize();
      agent.setupMCPTools(mcpManager);
      globalProgressReporter.showInfo('MCPツールが有効化されました');
    }

    // REPL開始
    globalProgressReporter.updateSubtask(3);
    globalProgressReporter.completeTask(true);
    
    console.log(chalk.cyan('🤖 エージェントとの対話を開始します'));
    console.log(chalk.gray('終了するには /exit を入力してください'));

    await startREPL(agent, mcpManager);
  } catch (error) {
    globalProgressReporter.completeTask(false);
    globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
    console.error(chalk.red('対話モードの開始に失敗しました:'), error);
    process.exit(1);
  }
} else {
  // 引数ありの場合は通常のコマンド処理
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error && error.message.includes('outputHelp')) {
      // ヘルプ表示の場合は正常終了
      process.exit(0);
    }
    if (error instanceof Error) {
      console.error(chalk.red('エラー:'), error.message);
    }
    process.exit(1);
  }
}

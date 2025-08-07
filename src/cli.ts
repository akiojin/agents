#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
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
    try {
      interface InitAnswers {
        provider: 'openai' | 'anthropic' | 'local-gptoss' | 'local-lmstudio';
        apiKey?: string;
        localEndpoint?: string;
        useMCP: boolean;
      }

      // TTY確認
      if (!process.stdin.isTTY) {
        throw new Error('対話型セットアップにはTTY環境が必要です。docker exec -it を使用してください。');
      }

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

      // 統一設定を作成
      const spinner = ora('設定ファイルを作成中...').start();
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
        }
      };
      
      // ローカルプロバイダーの場合はエンドポイントを追加
      if (answers.localEndpoint && answers.provider.startsWith('local-')) {
        // エンドポイント情報は環境変数に設定することを推奨
        process.env.AGENTS_LOCAL_ENDPOINT = answers.localEndpoint;
      }
      
      await configManager.saveConfig(unifiedConfig);
      spinner.succeed(chalk.green('設定を初期化しました'));
    } catch (error) {
      console.log(chalk.red('初期化に失敗しました'));
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
    const spinner = ora('タスクを実行中...').start();
    const configManager = ConfigManager.getInstance();
    const config = await configManager.load();
    const agent = new AgentCore(config);
    const mcpManager = new MCPManager(config);

    try {
      if (config.useMCP) {
        await mcpManager.initialize();
        agent.setupMCPTools(mcpManager);
      }

      const result = config.useMCP
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

      spinner.succeed(chalk.green('タスクが完了しました'));
      console.log(result);
    } catch (error) {
      spinner.fail(chalk.red('タスクの実行に失敗しました'));
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

// エラーハンドリング
program.exitOverride();

try {
  await program.parseAsync(process.argv);
} catch (error) {
  if (error instanceof Error) {
    console.error(chalk.red('エラー:'), error.message);
  }
  process.exit(1);
}

// 引数なしの場合は対話モードを開始
if (process.argv.length === 2) {
  const config = await loadConfig.load();
  const agent = new AgentCore(config);
  const mcpManager = new MCPManager(config);

  if (config.useMCP) {
    await mcpManager.initialize();
    agent.setupMCPTools(mcpManager);
  }

  console.log(chalk.cyan('🤖 エージェントとの対話を開始します'));
  console.log(chalk.gray('終了するには /exit を入力してください'));

  await startREPL(agent, mcpManager);
}

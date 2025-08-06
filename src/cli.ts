#!/usr/bin/env bun
import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { createRequire } from 'module';
import { startREPL } from './cli/repl.js';
import { loadConfig } from './utils/config.js';
import { logger } from './utils/logger.js';
import { AgentCore } from './core/agent.js';
import { MCPManager } from './mcp/manager.js';
import type { Config } from './types/config.js';

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
    const spinner = ora('設定を初期化中...').start();
    
    try {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'LLMプロバイダーを選択:',
          choices: ['OpenAI', 'Anthropic', 'Local (GPT-OSS)', 'Local (LM Studio)'],
        },
        {
          type: 'input',
          name: 'apiKey',
          message: 'APIキーを入力（ローカルの場合は空欄）:',
          when: (answers) => !answers.provider.includes('Local'),
        },
        {
          type: 'input',
          name: 'localEndpoint',
          message: 'ローカルエンドポイントURL:',
          default: 'http://localhost:8080',
          when: (answers) => answers.provider.includes('Local'),
        },
        {
          type: 'confirm',
          name: 'useMCP',
          message: 'MCPツールを有効化しますか？',
          default: true,
        },
      ]);
      
      // 設定ファイルを生成
      await loadConfig.save(answers as Config);
      spinner.succeed(chalk.green('設定を初期化しました'));
    } catch (error) {
      spinner.fail(chalk.red('初期化に失敗しました'));
      logger.error('Init failed:', error);
      process.exit(1);
    }
  });

// chatコマンド
program
  .command('chat')
  .description('対話モードを開始')
  .option('-s, --session <id>', 'セッションIDを指定')
  .action(async (_options) => {
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
  });

// taskコマンド
program
  .command('task <description>')
  .description('タスクを実行')
  .option('-f, --file <paths...>', 'ターゲットファイル')
  .option('-p, --parallel', '並列実行を有効化', false)
  .action(async (description: string, options) => {
    const spinner = ora('タスクを実行中...').start();
    const config = await loadConfig.load();
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
    const config = await loadConfig.load();
    const agent = new AgentCore(config);
    
    // chokidarを使用してファイル監視
    const { watch } = await import('chokidar');
    const watcher = watch(paths.length > 0 ? paths : ['.'], {
      ignored: /node_modules|\.git|dist/,
      persistent: true,
    });
    
    watcher.on('change', async (path) => {
      console.log(chalk.yellow(`変更検出: ${path}`));
      if (options.task) {
        await agent.executeTask({
          description: options.task,
          files: [path],
        });
      }
    });
  });

// statusコマンド
program
  .command('status')
  .description('エージェントステータスを表示')
  .action(async () => {
    const config = await loadConfig.load();
    console.log(chalk.cyan('エージェントステータス:'));
    console.log(chalk.gray('  プロバイダー:'), config.provider);
    console.log(chalk.gray('  モデル:'), config.model || 'デフォルト');
    console.log(chalk.gray('  MCP:'), config.useMCP ? '有効' : '無効');
    console.log(chalk.gray('  並列タスク数:'), config.maxParallel || 5);
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

// 引数なしの場合はヘルプを表示
if (process.argv.length === 2) {
  program.help();
}
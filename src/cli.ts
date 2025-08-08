#!/usr/bin/env bun

// REPLモード判定（引数なしで起動された場合）
if (process.argv.length === 2) {
  process.env.AGENTS_SILENT = 'true';
}

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
  .description('オープンソースで完全無料の自律型コーディングAgent')
  .version(packageJson.version);

// グローバルOptions
program
  .option('-m, --model <model>', 'LLMModelを指定', 'gpt-4')
  .option('-c, --config <path>', 'Configファイルのパス', '.agents.yaml')
  .option('-v, --verbose', 'Detailsログ出力')
  .option('--no-color', 'カラー出力を無効化')
  .option('--max-parallel <number>', 'ParallelTaskExecute数', '5')
  .option('--timeout <seconds>', 'TaskTimeout（seconds）', '300');

// initCommand
program
  .command('init')
  .description('AgentConfigをInitialize')
  .action(async () => {
    const { globalProgressReporter } = await import('./ui/progress.js');
    
    try {
      interface InitAnswers {
        provider: 'openai' | 'anthropic' | 'local-gptoss' | 'local-lmstudio';
        apiKey?: string;
        localEndpoint?: string;
        useMCP: boolean;
      }

      globalProgressReporter.startTask('AgentInitialize', ['TTYCheck', 'Config入力', 'Configファイル作成']);

      // TTYCheck
      globalProgressReporter.updateSubtask(0);
      if (!process.stdin.isTTY) {
        globalProgressReporter.completeTask(false);
        throw new Error(
          '対話型セットアップにはTTY環境が必要です。docker exec -it を使用してplease。',
        );
      }

      // Config入力
      globalProgressReporter.updateSubtask(1);
      const answers: InitAnswers = await inquirer.prompt([
        {
          type: 'list',
          name: 'provider',
          message: 'LLMProviderを選択:',
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
          message: 'APIキーを入力（Localの場合は空欄）:',
          when: (answers: InitAnswers) => !answers.provider.startsWith('local-'),
        },
        {
          type: 'input',
          name: 'localEndpoint',
          message: 'LocalエンドポイントURL:',
          default: 'http://127.0.0.1:1234',
          when: (answers: InitAnswers) => answers.provider.startsWith('local-'),
        },
        {
          type: 'confirm',
          name: 'useMCP',
          message: 'MCPToolを有効化しますか？',
          default: true,
        },
      ]);

      // Configファイル作成
      globalProgressReporter.updateSubtask(2);
      const configManager = ConfigManager.getInstance();

      // InitAnswersを統一ConfigにConvert
      const unifiedConfig: Partial<Config> = {
        llm: {
          provider: answers.provider,
          apiKey: answers.apiKey,
          timeout: 30000, // 2minutes for complex queries
          maxRetries: 3,
        },
        mcp: {
          servers: [],
          timeout: 30000, // 2minutes for MCP operations
          enabled: answers.useMCP,
          maxRetries: 3,
        },
      };

      // LocalProviderの場合はエンドポイントを追加
      if (answers.localEndpoint && answers.provider.startsWith('local-')) {
        // エンドポイントInfoは環境変数にConfigすることを推奨
        process.env.AGENTS_LOCAL_ENDPOINT = answers.localEndpoint;
      }

      await configManager.save(unifiedConfig);
      globalProgressReporter.completeTask(true);
      console.log(chalk.green('✅ Config initialized'));
    } catch (error) {
      globalProgressReporter.completeTask(false);
      globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
      console.log(chalk.red('❌ Initialization failed'));
      logger.error('Init failed:', error);
      process.exit(1);
    }
  });

// taskCommand
program
  .command('task <description>')
  .description('TaskをExecute')
  .option('-f, --file <paths...>', 'ターゲットファイル')
  .option('-p, --parallel', 'ParallelExecuteを有効化', false)
  .action(async (description: string, options) => {
    const { globalProgressReporter } = await import('./ui/progress.js');
    
    globalProgressReporter.startTask('Preparing task execution', ['Loading config', 'Initializing agent', 'Initializing MCP', 'Executing task']);
    
    try {
      // ConfigLoad
      globalProgressReporter.updateSubtask(0);
      const configManager = ConfigManager.getInstance();
      const config = await configManager.load();
      
      // AgentInitialize
      globalProgressReporter.updateSubtask(1);
      const agent = new AgentCore(config);
      const mcpManager = MCPManager.fromUnifiedConfig(config);

      // MCPInitialize
      globalProgressReporter.updateSubtask(2);
      if (config.mcp?.enabled) {
        await mcpManager.initialize();
        await agent.setupMCPTools(mcpManager);
        globalProgressReporter.showInfo('MCP tools initialized');
      }

      // TaskExecute
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

      console.log(chalk.green('✅ Task completed'));
      console.log(result);
    } catch (error) {
      globalProgressReporter.completeTask(false);
      globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
      logger.error('Task execution failed:', error);
      process.exit(1);
    }
  });



// watchCommand
program
  .command('watch [paths...]')
  .description('ファイル変更をMonitorして自動Execute')
  .option('-t, --task <task>', 'ExecuteするTask')
  .action(async (paths: string[], options) => {
    console.log(chalk.cyan('ファイルMonitorをStartedします...'));
    const configManager = ConfigManager.getInstance();
    const config = await configManager.load();
    const agent = new AgentCore(config);

    // chokidarを使用してファイルMonitor
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

// statusCommand
program
  .command('status')
  .description('Agentステータスを表示')
  .action(async () => {
    const configManager = ConfigManager.getInstance();
    const config = await configManager.load();
    console.log(chalk.cyan('Agentステータス:'));
    console.log(chalk.gray('  Provider:'), config.llm.provider);
    console.log(chalk.gray('  Model:'), config.llm.model || 'デフォルト');
    console.log(chalk.gray('  MCP:'), config.mcp.enabled ? '有効' : '無効');
    console.log(chalk.gray('  ParallelTask数:'), config.app.maxParallel);
    console.log(chalk.gray('  Timeout:'), `${config.app.timeout / 1000}seconds`);
    console.log(chalk.gray('  ログレベル:'), config.app.logLevel);
  });

// Argumentsなしの場合は対話モードをStarted
if (process.argv.length === 2) {
  // REPLモードでは環境変数でログを無効化
  process.env.AGENTS_SILENT = 'true';
  
  try {
    const configManager = ConfigManager.getInstance();
    const config = await configManager.load();
    const agent = new AgentCore(config);
    const mcpManager = MCPManager.fromUnifiedConfig(config);

    // REPL即座起動 - MCPは遅延初期化
    const replPromise = startREPL(agent, mcpManager);
    
    // MCP初期化をバックグラウンドで実行
    if (config.mcp?.enabled) {
      console.log(chalk.gray('● Loading MCP tools in background...'));
      
      // 初期化進捗イベントをリスニング
      mcpManager.on('initialization-started', (progress) => {
        console.log(chalk.gray(`  🔄 Starting initialization of ${progress.total} servers...`));
      });

      mcpManager.on('server-initialized', (data) => {
        console.log(chalk.gray(`  ✅ ${data.serverName} initialized (${data.toolCount} tools)`));
      });

      mcpManager.on('server-status-updated', (data) => {
        if (data.status.status === 'failed') {
          const serverType = data.status.type === 'http' ? '🌐' : data.status.type === 'sse' ? '⚡' : '📡';
                    // エラー表示を抑制 - ログにのみ記録
          logger.debug(`MCP server ${data.serverName} failed`);
          if (data.status.error) {
            // エラーメッセージをクリーンアップ
            let cleanError = data.status.error;
            if (cleanError.includes('MCPServer')) {
              cleanError = cleanError.replace(/MCPServer \[.*?\] /g, '');
            }
            // エラー詳細もログにのみ記録
            logger.debug(`MCP server ${data.serverName} error: ${cleanError}`);
          }
        }
      });

      mcpManager.initialize()
        .then(() => {
          console.log(chalk.gray('  📋 Setting up MCP tools helper...'));
          return agent.setupMCPTools(mcpManager);
        })
        .then(() => {
          console.log(chalk.gray('  ✅ MCP tools helper setup completed'));
          const progress = mcpManager.getInitializationProgress();
          console.log(chalk.green(`[MCP] ${progress.completed}/${progress.total} servers ready, ${progress.failed} failed`));
        })
        .catch((error) => {
          console.log(chalk.red('● MCP initialization failed:'));
          console.log(chalk.red(`  Error: ${error.message}`));
          console.log(chalk.red(`  Stack: ${error.stack}`));
          
          // 個別サーバーの状態を表示
          const progress = mcpManager.getInitializationProgress();
          for (const server of progress.servers) {
            if (server.status === 'failed' && server.error) {
              console.log(chalk.red(`  ${server.name}: ${server.error}`));
            }
          }
        });
    } else {
      console.log(chalk.gray('● MCP disabled in configuration'));
    }

    await replPromise;
  } catch (error) {
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
} else {
  // Argumentsありの場合は通常のCommandProcessing
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    if (error instanceof Error && error.message.includes('outputHelp')) {
      // ヘルプ表示の場合は正常Exit
      process.exit(0);
    }
    if (error instanceof Error) {
      console.error(chalk.red('Error:'), error.message);
    }
    process.exit(1);
  }
}

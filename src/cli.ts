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
// continuousCommand - 継続実行エンジンを使用したコマンド
program
  .command('auto <prompt>')
  .description('プロンプト1つでタスクを最後まで自動実行')
  .option('-m, --max-iterations <number>', '最大実行回数', '30')
  .option('-h, --human-approval', '人間の承認を求める', false)
  .option('-s, --session-id <id>', 'セッションIDを指定')
  .action(async (prompt: string, options) => {
    const { globalProgressReporter } = await import('./ui/progress.js');
    
    try {
      globalProgressReporter.startTask('継続実行エンジンの準備', ['設定読み込み', 'エージェント初期化', 'MCP初期化', '継続実行開始']);
      
      // 設定読み込み
      globalProgressReporter.updateSubtask(0);
      const configManager = ConfigManager.getInstance();
      const config = await configManager.load();
      
      // エージェント初期化
      globalProgressReporter.updateSubtask(1);
      const agent = new AgentCore(config);
      const mcpManager = MCPManager.fromUnifiedConfig(config);
      
      // MCP初期化
      globalProgressReporter.updateSubtask(2);
      if (config.mcp?.enabled) {
        await mcpManager.initialize();
        await agent.setupMCPTools(mcpManager);
      }
      
      // 継続実行エンジンを初期化
      const ContinuousExecutionEngine = (AgentCore as any).ContinuousExecutionEngine;
      const engine = new ContinuousExecutionEngine(agent);
      
      // 継続実行開始
      globalProgressReporter.updateSubtask(3);
      globalProgressReporter.completeTask(true);
      
      console.log(chalk.cyan('🚀 継続実行エンジンを開始します...'));
      console.log(chalk.gray(`プロンプト: ${prompt}`));
      console.log(chalk.gray(`最大反復回数: ${options.maxIterations}`));
      console.log(chalk.gray(`人間承認: ${options.humanApproval ? '有効' : '無効'}`));
      console.log('');
      
      const result = await engine.executeUntilComplete(prompt, {
        maxIterations: parseInt(options.maxIterations, 10),
        requireHumanApproval: options.humanApproval,
        sessionId: options.sessionId
      });
      
      console.log('');
      console.log(chalk.green('✅ 継続実行が完了しました'));
      console.log(chalk.gray(`実行回数: ${result.iterations}`));
      console.log(chalk.gray(`完了理由: ${result.completionReason}`));
      console.log('');
      console.log(chalk.yellow('最終結果:'));
      console.log(result.finalResult);
      
    } catch (error) {
      globalProgressReporter.completeTask(false);
      globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
      console.error(chalk.red('❌ 継続実行中にエラーが発生しました'));
      logger.error('Continuous execution failed:', error);
      process.exit(1);
    }
  });

program
  .name('agents')
  .description('オープンソースで完全無料の自律型コーディングAgent')
  .version(packageJson.version);

// グローバルOptions
program
  .option('-m, --model <model>', 'LLMModelを指定')
  .option('-v, --verbose', 'Detailsログ出力')
  .option('--no-color', 'カラー出力を無効化')
  .option('--max-parallel <number>', 'ParallelTaskExecute数', '5')
  .option('--timeout <seconds>', 'TaskTimeout（seconds）', '300')
  .option('-c, --continue', '前回のセッションを継続');

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
          default: 'http://host.docker.internal:1234',
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

// docsCommand - Serenaベースドキュメント管理
program
  .command('docs')
  .description('Serenaベースドキュメント管理システム')
  .addCommand(
    new Command('create')
      .description('新しいドキュメントを作成')
      .option('-t, --type <type>', 'ドキュメントタイプ (adr|spec|howto|runbook|note)', 'note')
      .option('-T, --title <title>', 'ドキュメントタイトル')
      .option('--no-duplicate-check', '重複チェックをスキップ')
      .action(async (options) => {
        const { globalProgressReporter } = await import('./ui/progress.js');
        
        try {
          globalProgressReporter.startTask('ドキュメント作成', ['設定読み込み', 'Serena初期化', 'タイトル入力', 'ドキュメント作成', 'Serenaに保存']);
          
          // 設定読み込み
          globalProgressReporter.updateSubtask(0);
          const configManager = ConfigManager.getInstance();
          const config = await configManager.load();
          
          // Agent & Serena初期化
          globalProgressReporter.updateSubtask(1);
          const agent = new AgentCore(config);
          const mcpManager = MCPManager.fromUnifiedConfig(config);
          await mcpManager.initialize();
          await agent.setupMCPTools(mcpManager);
          
          // ドキュメント情報の入力
          globalProgressReporter.updateSubtask(2);
          let title = options.title;
          
          if (!title) {
            if (!process.stdin.isTTY) {
              throw new Error('対話環境が必要です。--titleオプションを使用してください。');
            }
            
            const titleAnswer = await inquirer.prompt([{
              type: 'input',
              name: 'title',
              message: 'ドキュメントタイトルを入力:',
              validate: (input: string) => input.trim().length > 0 || 'タイトルは必須です'
            }]);
            title = titleAnswer.title;
          }
          
          // DocumentManager初期化
          const { DocumentManager } = await import('./core/document-manager.js');
          const { SerenaDocumentAdapter } = await import('./core/serena-document-adapter.js');
          const { configureSerenaAdapter } = await import('./utils/serena-helper.js');
          const docManager = new DocumentManager();
          const serenaAdapter = new SerenaDocumentAdapter(docManager);
          
          // SerenaAdapterにMCPインターフェースを設定
          configureSerenaAdapter(serenaAdapter, agent);
          
          // 重複チェック
          if (options.duplicateCheck !== false) {
            const duplicates = await serenaAdapter.checkDuplicatesInSerenaMemory(
              title,
              '',
              options.type
            );
            
            if (duplicates.isDuplicate && duplicates.similarDocuments.length > 0) {
              console.log(chalk.yellow(`⚠️  類似ドキュメントが${duplicates.similarDocuments.length}件見つかりました:`));
              for (const similar of duplicates.similarDocuments.slice(0, 3)) {
                console.log(chalk.gray(`  - ${similar.frontMatter.title} (${similar.frontMatter.doc_id})`));
              }
              
              if (process.stdin.isTTY) {
                const continueAnswer = await inquirer.prompt([{
                  type: 'confirm',
                  name: 'continue',
                  message: 'それでも新しいドキュメントを作成しますか？',
                  default: false
                }]);
                
                if (!continueAnswer.continue) {
                  console.log(chalk.gray('ドキュメント作成をキャンセルしました。'));
                  return;
                }
              }
            }
          }
          
          // ドキュメント作成
          globalProgressReporter.updateSubtask(3);
          const document = await docManager.createDocument(
            options.type,
            title,
            '',
            {
              autoTagging: true,
              duplicateThreshold: options.duplicateCheck !== false ? 0.8 : undefined
            }
          );
          
          // Serenaに保存
          globalProgressReporter.updateSubtask(4);
          await serenaAdapter.saveToSerenaMemory(document);
          
          globalProgressReporter.completeTask(true);
          console.log(chalk.green('✅ ドキュメントを作成しました'));
          console.log(chalk.gray(`  ID: ${document.frontMatter.doc_id}`));
          console.log(chalk.gray(`  タイトル: ${document.frontMatter.title}`));
          console.log(chalk.gray(`  タイプ: ${document.frontMatter.type}`));
          console.log(chalk.gray(`  タグ: ${document.frontMatter.tags.join(', ')}`));
          
        } catch (error) {
          globalProgressReporter.completeTask(false);
          globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
          console.error(chalk.red('❌ ドキュメント作成に失敗しました'));
          logger.error('Document creation failed:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('ドキュメント一覧を表示')
      .option('-t, --type <type>', 'ドキュメントタイプでフィルタ')
      .option('-s, --status <status>', 'ステータスでフィルタ')
      .option('--limit <number>', '表示件数制限', '10')
      .action(async (options) => {
        const { globalProgressReporter } = await import('./ui/progress.js');
        
        try {
          globalProgressReporter.startTask('ドキュメント一覧取得', ['設定読み込み', 'Serena初期化', 'ドキュメント一覧取得']);
          
          // 設定読み込み
          globalProgressReporter.updateSubtask(0);
          const configManager = ConfigManager.getInstance();
          const config = await configManager.load();
          
          // Serena初期化
          globalProgressReporter.updateSubtask(1);
          const agent = new AgentCore(config);
          const mcpManager = MCPManager.fromUnifiedConfig(config);
          await mcpManager.initialize();
          await agent.setupMCPTools(mcpManager);
          
          // ドキュメント一覧取得
          globalProgressReporter.updateSubtask(2);
          const { DocumentManager } = await import('./core/document-manager.js');
          const { SerenaDocumentAdapter } = await import('./core/serena-document-adapter.js');
          const { configureSerenaAdapter } = await import('./utils/serena-helper.js');
          const docManager = new DocumentManager();
          const serenaAdapter = new SerenaDocumentAdapter(docManager);
          
          // SerenaAdapterにMCPインターフェースを設定
          configureSerenaAdapter(serenaAdapter, agent);
          
          const memoryList = await serenaAdapter.listAllDocuments();
          globalProgressReporter.completeTask(true);
          
          console.log(chalk.cyan(`📄 Serenaドキュメント一覧 (${memoryList.length}件)`));
          console.log('');
          
          if (memoryList.length === 0) {
            console.log(chalk.gray('ドキュメントが見つかりません。'));
            return;
          }
          
          // 制限数でスライス
          const limit = parseInt(options.limit, 10);
          const displayList = memoryList.slice(0, limit);
          
          for (const memoryName of displayList) {
            console.log(chalk.blue(`• ${memoryName}`));
          }
          
          if (memoryList.length > limit) {
            console.log(chalk.gray(`  ... 他${memoryList.length - limit}件`));
          }
          
        } catch (error) {
          globalProgressReporter.completeTask(false);
          globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
          console.error(chalk.red('❌ ドキュメント一覧取得に失敗しました'));
          logger.error('Document listing failed:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('search')
      .description('ドキュメントを検索')
      .argument('<query>', '検索クエリ')
      .option('--limit <number>', '表示件数制限', '5')
      .action(async (query: string, options) => {
        const { globalProgressReporter } = await import('./ui/progress.js');
        
        try {
          globalProgressReporter.startTask('ドキュメント検索', ['設定読み込み', 'Serena初期化', '検索実行']);
          
          // 設定読み込み
          globalProgressReporter.updateSubtask(0);
          const configManager = ConfigManager.getInstance();
          const config = await configManager.load();
          
          // Serena初期化  
          globalProgressReporter.updateSubtask(1);
          const agent = new AgentCore(config);
          const mcpManager = MCPManager.fromUnifiedConfig(config);
          await mcpManager.initialize();
          await agent.setupMCPTools(mcpManager);
          
          // 検索実行
          globalProgressReporter.updateSubtask(2);
          const { DocumentManager } = await import('./core/document-manager.js');
          const { SerenaDocumentAdapter } = await import('./core/serena-document-adapter.js');
          const { configureSerenaAdapter } = await import('./utils/serena-helper.js');
          const docManager = new DocumentManager();
          const serenaAdapter = new SerenaDocumentAdapter(docManager);
          
          // SerenaAdapterにMCPインターフェースを設定
          configureSerenaAdapter(serenaAdapter, agent);
          
          const searchResults = await serenaAdapter.searchInSerenaMemories(query);
          globalProgressReporter.completeTask(true);
          
          console.log(chalk.cyan(`🔍 検索結果: "${query}" (${searchResults.length}件)`));
          console.log('');
          
          if (searchResults.length === 0) {
            console.log(chalk.gray('検索結果が見つかりません。'));
            return;
          }
          
          const limit = parseInt(options.limit, 10);
          const displayResults = searchResults.slice(0, limit);
          
          for (const result of displayResults) {
            const doc = result.document;
            const similarity = (result.similarity * 100).toFixed(1);
            
            console.log(chalk.green(`📄 ${doc.frontMatter.title}`));
            console.log(chalk.gray(`  ID: ${doc.frontMatter.doc_id}`));
            console.log(chalk.gray(`  タイプ: ${doc.frontMatter.type}`));
            console.log(chalk.gray(`  類似度: ${similarity}%`));
            console.log('');
          }
          
          if (searchResults.length > limit) {
            console.log(chalk.gray(`  ... 他${searchResults.length - limit}件`));
          }
          
        } catch (error) {
          globalProgressReporter.completeTask(false);
          globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
          console.error(chalk.red('❌ ドキュメント検索に失敗しました'));
          logger.error('Document search failed:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('stats')
      .description('ドキュメント統計を表示')
      .action(async () => {
        const { globalProgressReporter } = await import('./ui/progress.js');
        
        try {
          globalProgressReporter.startTask('統計取得', ['設定読み込み', 'Serena初期化', '統計計算']);
          
          // 設定読み込み
          globalProgressReporter.updateSubtask(0);
          const configManager = ConfigManager.getInstance();
          const config = await configManager.load();
          
          // Serena初期化
          globalProgressReporter.updateSubtask(1);
          const agent = new AgentCore(config);
          const mcpManager = MCPManager.fromUnifiedConfig(config);
          await mcpManager.initialize();
          await agent.setupMCPTools(mcpManager);
          
          // 統計計算
          globalProgressReporter.updateSubtask(2);
          const { DocumentManager } = await import('./core/document-manager.js');
          const { SerenaDocumentAdapter } = await import('./core/serena-document-adapter.js');
          const { configureSerenaAdapter } = await import('./utils/serena-helper.js');
          const docManager = new DocumentManager();
          const serenaAdapter = new SerenaDocumentAdapter(docManager);
          
          // SerenaAdapterにMCPインターフェースを設定
          configureSerenaAdapter(serenaAdapter, agent);
          
          const memoryList = await serenaAdapter.listAllDocuments();
          const stats = docManager.getDocumentStats();
          
          globalProgressReporter.completeTask(true);
          
          console.log(chalk.cyan('📊 ドキュメント統計'));
          console.log('');
          console.log(chalk.blue('全体統計:'));
          console.log(chalk.gray(`  Serenaメモリ数: ${memoryList.length}件`));
          console.log(chalk.gray(`  メモリ内ドキュメント数: ${stats.total}件`));
          console.log('');
          console.log(chalk.blue('タイプ別:'));
          for (const [type, count] of Object.entries(stats.byType)) {
            if (count > 0) {
              console.log(chalk.gray(`  ${type.toUpperCase()}: ${count}件`));
            }
          }
          console.log('');
          console.log(chalk.blue('ステータス別:'));
          for (const [status, count] of Object.entries(stats.byStatus)) {
            if (count > 0) {
              console.log(chalk.gray(`  ${status}: ${count}件`));
            }
          }
          console.log('');
          console.log(chalk.blue('その他:'));
          console.log(chalk.gray(`  期限切れレビュー: ${stats.expiredReviews}件`));
          console.log(chalk.gray(`  最近の更新: ${stats.recentUpdates}件`));
          
        } catch (error) {
          globalProgressReporter.completeTask(false);
          globalProgressReporter.showError(error instanceof Error ? error.message : String(error));
          console.error(chalk.red('❌ 統計取得に失敗しました'));
          logger.error('Statistics failed:', error);
          process.exit(1);
        }
      })
  );

// REPLコマンドを追加
program
  .command('repl')
  .description('対話モードを開始')
  .option('--continue', '前回のセッションを継続')
  .action(async (options) => {
    await startREPLMode(options.continue);
  });

// Arguments解析とREPL起動の判定
console.log('Process argv:', process.argv);

// 引数なしの場合は新しいセッション
if (process.argv.length === 2) {
  console.log('No args, starting new session');
  await startREPLMode(false);
} else if (process.argv.includes('-c') || process.argv.includes('--continue')) {
  // -c または --continue が指定された場合の直接処理
  if (process.argv.length === 3 && (process.argv[2] === '-c' || process.argv[2] === '--continue')) {
    console.log('Continue option detected, starting REPL with session continuation');
    await startREPLMode(true);
  }
} else {
  // その他のコマンドの場合は通常の処理
  try {
    program.parse(process.argv);
    const opts = program.opts();
    const args = program.args;
    
    console.log('Parsed opts:', opts);
    console.log('Parsed args:', args);

    // コマンドが指定されていない場合は対話モードを開始
    if (args.length === 0) {
      console.log('No commands, starting REPL with continue:', opts.continue);
      await startREPLMode(opts.continue || false);
    }
  } catch (error) {
    console.error('Error parsing command line arguments:', error);
    process.exit(1);
  }
}

// REPLモード開始関数
async function startREPLMode(continueSession: boolean = false) {
  // REPLモードでは環境変数でログを無効化
  process.env.AGENTS_SILENT = 'true';
  
  // デバッグ用ログ
  console.log(`Starting REPL with continueSession: ${continueSession}`);
  
  try {
    const configManager = ConfigManager.getInstance();
    const config = await configManager.load();
    const agent = new AgentCore(config, continueSession); // セッション継続フラグを渡す
    const mcpManager = MCPManager.fromUnifiedConfig(config);

    // REPL即座起動 - MCPは遅延初期化
    const replPromise = startREPL(agent, mcpManager);
    
    // MCP初期化をバックグラウンドで実行
    if (config.mcp?.enabled) {
      logger.debug('Loading MCP tools in background...');
      
      // 初期化進捗イベントをリスニング（ログレベルに変更）
      mcpManager.on('initialization-started', (progress) => {
        logger.debug(`Starting initialization of ${progress.total} servers...`);
      });

      mcpManager.on('server-initialized', (data) => {
        logger.debug(`${data.serverName} initialized (${data.toolCount} tools)`);
        // サーバーが初期化されたらすぐにツールを更新
        agent.setupMCPTools(mcpManager)
          .catch((error) => {
            logger.debug(`Failed to update MCP tools after ${data.serverName} initialization: ${error.message}`);
          });
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
          return agent.setupMCPTools(mcpManager);
        })
        .then(() => {
          const progress = mcpManager.getInitializationProgress();
          const functionCount = agent.getAvailableFunctionCount();
          // 成功時はログのみ
          logger.debug(`MCP Ready: ${progress.completed}/${progress.total} servers, ${functionCount} functions available`);
        })
        .catch((error) => {
          logger.debug('MCP initialization failed:', error.message);
        });
    } else {
      logger.debug('MCP disabled in configuration');
    }

    await replPromise;
  } catch (error) {
    console.error(chalk.red('Error:'), error);
    process.exit(1);
  }
}

import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import type { AgentCore } from '../core/agent.js';
import type { MCPManager } from '../mcp/manager.js';
import { logger } from '../utils/logger.js';

export async function startREPL(agent: AgentCore, mcpManager: MCPManager): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('agents> '),
  });

  // スラッシュコマンドハンドラー
  const handleSlashCommand = async (command: string, args: string): Promise<boolean> => {
    switch (command) {
      case '/help':
        console.log(chalk.cyan('利用可能なコマンド:'));
        console.log('  /help        - ヘルプを表示');
        console.log('  /exit        - 終了');
        console.log('  /clear       - 画面をクリア');
        console.log('  /history     - 履歴を表示');
        console.log('  /save <file> - 会話を保存');
        console.log('  /load <file> - 会話を読み込み');
        console.log('  /tools       - 利用可能なツールを表示');
        console.log('  /mcp         - MCPサーバーのステータス表示');
        console.log('  /mcptools    - MCPツール一覧を表示');
        console.log('  /model <name>- モデルを変更');
        console.log('  /parallel    - 並列実行モードを切り替え');
        console.log('  /verbose     - 詳細モードを切り替え');
        return true;

      case '/exit':
        console.log(chalk.yellow('さようなら！'));
        rl.close();
        process.exit(0);
        break;

      case '/clear':
        console.clear();
        return true;

      case '/history':
        const history = agent.getHistory();
        history.forEach((entry, index) => {
          console.log(chalk.gray(`[${index + 1}]`), entry.role + ':', entry.content);
        });
        return true;

      case '/save':
        if (!args) {
          console.log(chalk.red('ファイル名を指定してください'));
          return true;
        }
        try {
          await agent.saveSession(args);
          console.log(chalk.green(`セッションを保存しました: ${args}`));
        } catch (error) {
          console.log(chalk.red('保存に失敗しました:', error));
        }
        return true;

      case '/load':
        if (!args) {
          console.log(chalk.red('ファイル名を指定してください'));
          return true;
        }
        try {
          await agent.loadSession(args);
          console.log(chalk.green(`セッションを読み込みました: ${args}`));
        } catch (error) {
          console.log(chalk.red('読み込みに失敗しました:', error));
        }
        return true;

      case '/tools':
        const tools = await mcpManager.listTools();
        console.log(chalk.cyan('利用可能なツール:'));
        tools.forEach((tool) => {
          console.log(`  - ${tool.name}: ${tool.description}`);
        });
        return true;

      case '/mcp':
        const serverStatus = agent.getMCPServerStatus();
        if (!serverStatus) {
          console.log(chalk.red('MCPツールが初期化されていません'));
          return true;
        }
        console.log(chalk.cyan('MCPサーバーステータス:'));
        for (const [name, status] of serverStatus) {
          const statusText = status ? chalk.green('接続済み') : chalk.red('切断');
          console.log(`  - ${name}: ${statusText}`);
        }
        return true;

      case '/mcptools':
        try {
          const mcpTools = await agent.getAvailableMCPTools();
          if (mcpTools.length === 0) {
            console.log(chalk.yellow('利用可能なMCPツールがありません'));
            return true;
          }
          console.log(chalk.cyan('利用可能なMCPツール:'));
          mcpTools.forEach((tool) => {
            console.log(`  - ${chalk.green(tool.name)}: ${tool.description}`);
          });
        } catch (error) {
          console.log(chalk.red('MCPツール一覧の取得に失敗しました:', error));
        }
        return true;

      case '/model':
        if (!args) {
          console.log(chalk.yellow(`現在のモデル: ${agent.getCurrentModel()}`));
        } else {
          agent.setModel(args);
          console.log(chalk.green(`モデルを変更しました: ${args}`));
        }
        return true;

      case '/parallel':
        const isParallel = agent.toggleParallelMode();
        console.log(chalk.yellow(`並列実行モード: ${isParallel ? '有効' : '無効'}`));
        return true;

      case '/verbose':
        const isVerbose = agent.toggleVerboseMode();
        console.log(chalk.yellow(`詳細モード: ${isVerbose ? '有効' : '無効'}`));
        return true;

      default:
        console.log(chalk.red(`不明なコマンド: ${command}`));
        console.log(chalk.gray('/help でコマンド一覧を表示'));
        return true;
    }
  };

  // 入力処理
  rl.on('line', async (input) => {
    const trimmedInput = input.trim();

    // 空行はスキップ
    if (!trimmedInput) {
      rl.prompt();
      return;
    }

    // スラッシュコマンドのチェック
    if (trimmedInput.startsWith('/')) {
      const parts = trimmedInput.split(' ');
      const command = parts[0];
      if (!command) return;
      const args = parts.slice(1);
      await handleSlashCommand(command, args.join(' '));
      rl.prompt();
      return;
    }

    // タスク実行
    const spinner = ora('考え中...').start();
    try {
      const response = await agent.chat(trimmedInput);
      spinner.stop();
      console.log(chalk.green('エージェント:'), response);
    } catch (error) {
      spinner.fail(chalk.red('エラーが発生しました'));
      logger.error('Chat error:', error);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\n終了します'));
    process.exit(0);
  });

  // ウェルカムメッセージ
  console.log(chalk.cyan('━'.repeat(50)));
  console.log(chalk.cyan.bold('  AI Coding Agent - 対話モード'));
  console.log(chalk.gray('  /help でコマンド一覧を表示'));
  console.log(chalk.cyan('━'.repeat(50)));

  rl.prompt();
}
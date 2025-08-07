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

  // スラッシュCommandハンドラー
  const handleSlashCommand = async (command: string, args: string): Promise<boolean> => {
    switch (command) {
      case '/help': {
        console.log(chalk.cyan('Available commands:'));
        console.log('  /help        - Show help');
        console.log('  /exit        - Exit');
        console.log('  /clear       - Clear screen');
        console.log('  /history     - Show history');
        console.log('  /save <file> - Save conversation');
        console.log('  /load <file> - Load conversation');
        console.log('  /tools       - Show available tools');
        console.log('  /mcp         - Show MCP server status');
        console.log('  /mcptools    - Show MCP tools list');
        console.log('  /model <name>- Change model');
        console.log('  /parallel    - Toggle parallel execution mode');
        console.log('  /verbose     - Toggle verbose mode');
        return true;
      }

      case '/exit': {
        console.log(chalk.yellow('Goodbye!'));
        rl.close();
        process.exit(0);
        break;
      }

      case '/clear': {
        console.clear();
        return true;
      }

      case '/history': {
        const history = agent.getHistory();
        history.forEach((entry, index) => {
          console.log(chalk.gray(`[${index + 1}]`), entry.role + ':', entry.content);
        });
        return true;
      }

      case '/save': {
        if (!args) {
          console.log(chalk.red('ファイル名を指定してplease'));
          return true;
        }
        try {
          await agent.saveSession(args);
          console.log(chalk.green(`セッションをSavedone: ${args}`));
        } catch (error) {
          console.log(chalk.red('SaveにFaileddone:', error));
        }
        return true;
      }

      case '/load': {
        if (!args) {
          console.log(chalk.red('ファイル名を指定してplease'));
          return true;
        }
        try {
          await agent.loadSession(args);
          console.log(chalk.green(`セッションをLoadました: ${args}`));
        } catch (error) {
          console.log(chalk.red('LoadにFaileddone:', error));
        }
        return true;
      }

      case '/tools': {
        const tools = await mcpManager.listTools();
        console.log(chalk.cyan('利用可能なTool:'));
        tools.forEach((tool) => {
          console.log(`  - ${tool.name}: ${tool.description}`);
        });
        return true;
      }

      case '/mcp': {
        const serverStatus = agent.getMCPServerStatus();
        if (!serverStatus) {
          console.log(chalk.red('MCPToolがInitializenot initialized'));
          return true;
        }
        console.log(chalk.cyan('MCPServerステータス:'));
        for (const [name, status] of serverStatus) {
          const statusText = status ? chalk.green('Connected') : chalk.red('Disconnected');
          console.log(`  - ${name}: ${statusText}`);
        }
        return true;
      }

      case '/mcptools': {
        try {
          const mcpTools = await agent.getAvailableMCPTools();
          if (mcpTools.length === 0) {
            console.log(chalk.yellow('No MCP tools available'));
            return true;
          }
          console.log(chalk.cyan('Available MCP tools:'));
          mcpTools.forEach((tool) => {
            console.log(`  - ${chalk.green(tool.name)}: ${tool.description}`);
          });
        } catch (error) {
          console.log(chalk.red('Failed to get MCP tools list:', error));
        }
        return true;
      }

      case '/model': {
        if (!args) {
          console.log(chalk.yellow(`Current model: ${agent.getCurrentModel()}`));
        } else {
          agent.setModel(args);
          console.log(chalk.green(`Model changed: ${args}`));
        }
        return true;
      }

      case '/parallel': {
        const isParallel = agent.toggleParallelMode();
        console.log(chalk.yellow(`Parallel execution mode: ${isParallel ? 'Enabled' : 'Disabled'}`));
        return true;
      }

      case '/verbose': {
        const isVerbose = agent.toggleVerboseMode();
        console.log(chalk.yellow(`Verbose mode: ${isVerbose ? 'Enabled' : 'Disabled'}`));
        return true;
      }

      default: {
        console.log(chalk.red(`Unknown command: ${command}`));
        console.log(chalk.gray('Type /help to show commands'));
        return true;
      }
    }
  };

  // 入力Processing
  rl.on('line', (input) => {
    void (async () => {
      const trimmedInput = input.trim();

      // 空行はスキップ
      if (!trimmedInput) {
        rl.prompt();
        return;
      }

      // スラッシュCommandのチェック
      if (trimmedInput.startsWith('/')) {
        const parts = trimmedInput.split(' ');
        const command = parts[0];
        if (!command) return;
        const args = parts.slice(1);
        await handleSlashCommand(command, args.join(' '));
        rl.prompt();
        return;
      }

      // TaskExecute
      const spinner = ora('Thinking...').start();
      try {
        const response = await agent.chatWithTaskDecomposition(trimmedInput);
        spinner.stop();
        console.log(chalk.green('Agent:'), response);
      } catch (error) {
        spinner.fail(chalk.red('An error occurred'));
        logger.error('Chat error:', error);
      }

      rl.prompt();
    })();
  });

  rl.on('close', () => {
    console.log(chalk.yellow('\nExiting...'));
    process.exit(0);
  });

  // ウェルカムMessage
  console.log(chalk.cyan('━'.repeat(50)));
  console.log(chalk.cyan.bold('  AI Coding Agent - Interactive Mode'));
  console.log(chalk.gray('  Type /help to show commands'));
  console.log(chalk.cyan('━'.repeat(50)));

  rl.prompt();
}

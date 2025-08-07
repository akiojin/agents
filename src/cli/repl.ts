import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import type { AgentCore } from '../core/agent.js';
import type { MCPManager } from '../mcp/manager.js';
import { logger } from '../utils/logger.js';

export async function startREPL(agent: AgentCore, mcpManager: MCPManager): Promise<void> {
  // Clear screen and show title
  console.clear();
  console.log('');
  console.log('   ' + chalk.cyan.bold('AGENTS'));
  console.log('');
  console.log(chalk.gray('Tips for getting started:'));
  console.log(chalk.gray('1. Ask questions or give instructions'));
  console.log(chalk.gray('2. Type /help for available commands'));
  console.log(chalk.gray('3. Type /exit to quit'));
  console.log('');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.gray('> '),
    terminal: true,
  });

  // Fix for multi-byte character handling (Japanese text)
  // Enable proper UTF-8 support
  process.stdin.setEncoding('utf8');

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
          console.log(chalk.red('Please specify a filename'));
          return true;
        }
        try {
          await agent.saveSession(args);
          console.log(chalk.green(`Session saved: ${args}`));
        } catch (error) {
          console.log(chalk.red('Failed to save:', error));
        }
        return true;
      }

      case '/load': {
        if (!args) {
          console.log(chalk.red('Please specify a filename'));
          return true;
        }
        try {
          await agent.loadSession(args);
          console.log(chalk.green(`Session loaded: ${args}`));
        } catch (error) {
          console.log(chalk.red('Failed to load:', error));
        }
        return true;
      }

      case '/tools': {
        const tools = await mcpManager.listTools();
        console.log(chalk.cyan('Available tools:'));
        tools.forEach((tool) => {
          console.log(`  - ${tool.name}: ${tool.description}`);
        });
        return true;
      }

      case '/mcp': {
        const serverStatus = agent.getMCPServerStatus();
        if (!serverStatus) {
          console.log(chalk.red('MCP tools not initialized'));
          return true;
        }
        console.log(chalk.cyan('MCP server status:'));
        if (serverStatus.size === 0) {
          console.log(chalk.yellow('  No MCP servers configured'));
        } else {
          for (const [name, status] of serverStatus) {
            const statusText = status ? chalk.green('Connected') : chalk.red('Disconnected');
            console.log(`  - ${name}: ${statusText}`);
          }
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
      const spinner = ora({
        text: 'Thinking',
        spinner: 'dots',
        color: 'gray'
      }).start();
      
      try {
        const response = await agent.chatWithTaskDecomposition(trimmedInput);
        spinner.stop();
        console.log('\n' + response + '\n');
      } catch (error) {
        spinner.stop();
        console.log(chalk.red('Error: ') + (error instanceof Error ? error.message : 'Unknown error'));
      }

      rl.prompt();
    })();
  });

  rl.on('close', () => {
    process.exit(0);
  });

  // ウェルカムMessage

  rl.prompt();
}
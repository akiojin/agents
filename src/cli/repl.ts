import readline from 'readline';
import chalk from 'chalk';
// import ora from 'ora'; // Removed to fix REPL response display issue
import type { AgentCore } from '../core/agent.js';
import type { MCPManager } from '../mcp/manager.js';
import { logger } from '../utils/logger.js';
import { TokenCounter } from '../utils/token-counter.js';

export async function startREPL(agent: AgentCore, mcpManager: MCPManager): Promise<void> {
  // Initialize token counter
  const tokenCounter = new TokenCounter();
  
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
  
  // Simple prompt
  const getPrompt = (): string => chalk.gray('> ');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPrompt(),
    terminal: true,
  });

  // Fix for multi-byte character handling (Japanese text)
  // Enable proper UTF-8 support
  process.stdin.setEncoding('utf8');
  
  // Ensure clean state on errors
  process.stdin.on('error', (err) => {
    console.error('Input stream error:', err);
    rl.close();
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
        // Show token statistics before exit
        console.log('');
        console.log(tokenCounter.formatStats());
        console.log('');
        process.exit(0);  // rl.close() will trigger the close event, so exit directly
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

      case '/stats': {
        const stats = tokenCounter.getStats();
        const contextUsage = Math.min(100, Math.round((stats.totalTokens / 200000) * 100));
        console.log(chalk.cyan('\nToken Usage Statistics:'));
        console.log(chalk.gray('───────────────────────'));
        console.log(`Turns:          ${stats.turns}`);
        console.log(`Input Tokens:   ${stats.totalInputTokens.toLocaleString()}`);
        console.log(`Output Tokens:  ${stats.totalOutputTokens.toLocaleString()}`);
        console.log(`Total Tokens:   ${stats.totalTokens.toLocaleString()}`);
        console.log(`Context Usage:  ${contextUsage}% (200k max)`);
        console.log(`API Time:       ${(stats.apiDuration / 1000).toFixed(1)}s`);
        console.log(`Session Time:   ${(stats.wallDuration / 1000).toFixed(1)}s`);
        console.log('');
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
      handleSlashCommand(command, args.join(' ')).then(() => {
        rl.prompt();
      });
      return;
    }

    // TaskExecute
    // Process asynchronously but handle readline synchronously
    (async () => {
      // Show simple processing indicator
      const dots = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
      let dotIndex = 0;
      const indicatorInterval = setInterval(() => {
        process.stdout.write(`\r${chalk.gray(dots[dotIndex])} ${chalk.gray('Thinking...')}`);
        dotIndex = (dotIndex + 1) % dots.length;
      }, 80);
      
      try {
        // Count input tokens
        tokenCounter.addInput(trimmedInput);
        tokenCounter.incrementTurn();
        
        const apiStartTime = Date.now();
        const response = await agent.chatWithTaskDecomposition(trimmedInput);
        const apiDuration = Date.now() - apiStartTime;
        
        // Count output tokens and API duration
        tokenCounter.addOutput(response);
        tokenCounter.addApiDuration(apiDuration);
        
        // Clear the indicator line
        clearInterval(indicatorInterval);
        process.stdout.write('\r' + ' '.repeat(20) + '\r');
        
        // Format response with bullet and indentation
        const formattedResponse = response.split('\n').map((line, index) => {
          if (index === 0) {
            return chalk.cyan('● ') + line;
          }
          return '  ' + line; // 2 spaces for indentation
        }).join('\n');
        console.log(formattedResponse);
        
        // Show context usage below response
        const stats = tokenCounter.getStats();
        const contextUsage = Math.round((stats.totalTokens / 200000) * 100);
        const remaining = 100 - Math.min(100, contextUsage);
        console.log(chalk.gray(`\n[Context: ${remaining}% remaining | ${stats.totalTokens.toLocaleString()} tokens used]`))
        console.log(); // Add blank line before prompt
      } catch (error) {
        // Clear the indicator
        clearInterval(indicatorInterval);
        process.stdout.write('\r' + ' '.repeat(20) + '\r');
        console.log(chalk.red('Error: ') + (error instanceof Error ? error.message : 'Unknown error'));
        console.log(); // Add newline for clarity
      } finally {
        // Always show prompt after processing
        rl.prompt();
      }
    })();
  });

  rl.on('close', () => {
    // Clean up before exit
    try {
      // Reset terminal state
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      // Show token statistics on close
      console.log('');
      console.log(tokenCounter.formatStats());
      console.log('');
    } catch (err) {
      // Ignore cleanup errors
    }
    process.exit(0);
  });

  // ウェルカムMessage

  rl.prompt();
}
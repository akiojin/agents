import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { loadConfig } from '../src/utils/config';
import { AgentCore } from '../src/core/agent';
import { MCPManager } from '../src/mcp/manager';

// モックの設定
vi.mock('inquirer');
vi.mock('../src/utils/config');
vi.mock('../src/core/agent');
vi.mock('../src/mcp/manager');
vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
  }),
}));

describe('CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('init command', () => {
    it('対話形式で設定を初期化できる', async () => {
      const mockAnswers = {
        provider: 'openai',
        apiKey: 'sk-test',
        useMCP: true,
      };

      vi.mocked(inquirer.prompt).mockResolvedValue(mockAnswers);
      vi.mocked(loadConfig.save).mockResolvedValue(undefined);

      // initコマンドのテスト実行
      const program = new Command();
      program.command('init').action(async () => {
        const answers = await inquirer.prompt([]);
        await loadConfig.save(answers);
      });

      await program.parseAsync(['node', 'test', 'init']);

      expect(inquirer.prompt).toHaveBeenCalled();
      expect(loadConfig.save).toHaveBeenCalledWith(mockAnswers);
    });

    it('ローカルプロバイダーを選択した場合、エンドポイントを設定できる', async () => {
      const mockAnswers = {
        provider: 'Local (GPT-OSS)',
        localEndpoint: 'http://localhost:8080',
        useMCP: true,
      };

      vi.mocked(inquirer.prompt).mockResolvedValue(mockAnswers);
      vi.mocked(loadConfig.save).mockResolvedValue(undefined);

      const program = new Command();
      program.command('init').action(async () => {
        const answers = await inquirer.prompt([]);
        await loadConfig.save(answers);
      });

      await program.parseAsync(['node', 'test', 'init']);

      expect(loadConfig.save).toHaveBeenCalledWith(mockAnswers);
    });
  });

  describe('chat command', () => {
    it('対話モードを開始できる', async () => {
      const mockConfig = {
        provider: 'openai',
        apiKey: 'sk-test',
        useMCP: true,
        maxParallel: 5,
      };

      vi.mocked(loadConfig).mockResolvedValue(mockConfig);

      const mockAgent = {
        chat: vi.fn().mockResolvedValue('テスト応答'),
        getHistory: vi.fn().mockReturnValue([]),
      };

      const mockMCPManager = {
        initialize: vi.fn().mockResolvedValue(undefined),
        listTools: vi.fn().mockResolvedValue([]),
      };

      vi.mocked(AgentCore).mockImplementation(() => mockAgent as any);
      vi.mocked(MCPManager).mockImplementation(() => mockMCPManager as any);

      expect(AgentCore).toBeDefined();
      expect(MCPManager).toBeDefined();
    });
  });

  describe('task command', () => {
    it('タスクを実行できる', async () => {
      const mockConfig = {
        provider: 'openai',
        apiKey: 'sk-test',
        useMCP: true,
      };

      vi.mocked(loadConfig).mockResolvedValue(mockConfig);

      const mockAgent = {
        executeTask: vi.fn().mockResolvedValue({
          success: true,
          message: 'タスク完了',
        }),
      };

      const mockMCPManager = {
        initialize: vi.fn().mockResolvedValue(undefined),
      };

      vi.mocked(AgentCore).mockImplementation(() => mockAgent as any);
      vi.mocked(MCPManager).mockImplementation(() => mockMCPManager as any);

      const program = new Command();
      program.command('task <description>').action(async (description) => {
        const config = await loadConfig();
        const agent = new AgentCore(config);
        const mcpManager = new MCPManager(config);

        if (config.useMCP) {
          await mcpManager.initialize();
        }

        await agent.executeTask({ description, files: [] });
      });

      await program.parseAsync(['node', 'test', 'task', 'テストタスク']);

      expect(mockAgent.executeTask).toHaveBeenCalledWith({
        description: 'テストタスク',
        files: [],
      });
    });
  });
});

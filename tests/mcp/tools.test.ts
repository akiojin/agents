import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { MCPToolsHelper, MCPTaskPlanner } from '../../src/mcp/tools.js';
import type { MCPManager, Tool } from '../../src/mcp/manager.js';

// MCPManagerのモック
const mockMCPManager = {
  listTools: vi.fn(),
  invokeTool: vi.fn(),
  getServerStatus: vi.fn(),
} as unknown as MCPManager;

describe('MCPToolsHelper', () => {
  let toolsHelper: MCPToolsHelper;

  beforeEach(() => {
    vi.clearAllMocks();
    toolsHelper = new MCPToolsHelper(mockMCPManager);
  });

  describe('selectToolsForTask', () => {
    const mockTools: Tool[] = [
      { name: 'filesystem:read_file', description: 'ファイルを読み取り' },
      { name: 'filesystem:write_file', description: 'ファイルに書き込み' },
      { name: 'git:commit', description: 'Gitコミット' },
      { name: 'brave-search:search', description: 'Web検索' },
      { name: 'shell:run_command', description: 'シェルコマンド実行' },
      { name: 'sqlite:execute', description: 'SQLクエリ実行' },
    ];

    beforeEach(() => {
      (mockMCPManager.listTools as MockedFunction<any>).mockResolvedValue(mockTools);
    });

    it('ファイル操作系のタスクに対して適切なツールを選択する', async () => {
      const selectedTools =
        await toolsHelper.selectToolsForTask('ファイルを読み取って内容を確認したい');

      expect(selectedTools).toHaveLength(2);
      expect(selectedTools.map((t) => t.name)).toContain('filesystem:read_file');
      expect(selectedTools.map((t) => t.name)).toContain('filesystem:write_file');
    });

    it('Git操作系のタスクに対して適切なツールを選択する', async () => {
      const selectedTools = await toolsHelper.selectToolsForTask('gitコミットを実行する');

      // "実行"という文字が含まれるため、実行系のツールも選択される
      expect(selectedTools).toHaveLength(3);
      expect(selectedTools.some(t => t.name === 'git:commit')).toBe(true);
      expect(selectedTools.some(t => t.name === 'shell:run_command')).toBe(true);
    });

    it('検索系のタスクに対して適切なツールを選択する', async () => {
      const selectedTools = await toolsHelper.selectToolsForTask('最新の情報を検索したい');

      expect(selectedTools).toHaveLength(1);
      expect(selectedTools[0]?.name).toBe('brave-search:search');
    });

    it('実行系のタスクに対して適切なツールを選択する', async () => {
      const selectedTools = await toolsHelper.selectToolsForTask('テストを実行する');

      // "テスト"と"実行"の両方が含まれるため、複数のツールが選択される
      expect(selectedTools).toHaveLength(2);
      expect(selectedTools.some(t => t.name === 'shell:run_command')).toBe(true);
    });

    it('データベース系のタスクに対して適切なツールを選択する', async () => {
      const selectedTools = await toolsHelper.selectToolsForTask('データベースを確認する');

      expect(selectedTools).toHaveLength(1);
      expect(selectedTools[0]?.name).toBe('sqlite:execute');
    });

    it('複数のカテゴリーにマッチするタスクの場合、重複を除去する', async () => {
      const selectedTools =
        await toolsHelper.selectToolsForTask('ファイルを読み取ってgitコミットする');

      // ファイル操作(2つ) + Git操作(1つ) = 3つ
      expect(selectedTools).toHaveLength(3);
    });
  });

  describe('executeTool', () => {
    it('正常にツールを実行する', async () => {
      const mockResult = 'ツール実行結果';
      (mockMCPManager.invokeTool as MockedFunction<any>).mockResolvedValue(mockResult);

      const result = await toolsHelper.executeTool('test:tool', { param: 'value' });

      expect(result).toBe(mockResult);
      expect(mockMCPManager.invokeTool).toHaveBeenCalledWith('test:tool', { param: 'value' });
    });

    it('エラー時に適切にエラーをスローする', async () => {
      const mockError = new Error('ツール実行エラー');
      (mockMCPManager.invokeTool as MockedFunction<any>).mockRejectedValue(mockError);

      await expect(toolsHelper.executeTool('test:tool', {})).rejects.toThrow('ツール実行エラー');
    });
  });

  describe('executeToolChain', () => {
    it('複数のツールを順次実行する', async () => {
      const mockResults = ['結果1', '結果2'];
      (mockMCPManager.invokeTool as MockedFunction<any>)
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1]);

      const toolCalls = [
        { name: 'tool1', params: { param1: 'value1' } },
        { name: 'tool2', params: { param2: 'value2' } },
      ];

      const results = await toolsHelper.executeToolChain(toolCalls);

      expect(results).toEqual(mockResults);
      expect(mockMCPManager.invokeTool).toHaveBeenCalledTimes(2);
    });

    it('一部のツールでエラーが発生した場合、エラー情報を含む結果を返す', async () => {
      const mockError = new Error('ツール2エラー');
      (mockMCPManager.invokeTool as MockedFunction<any>)
        .mockResolvedValueOnce('結果1')
        .mockRejectedValueOnce(mockError);

      const toolCalls = [
        { name: 'tool1', params: {} },
        { name: 'tool2', params: {} },
      ];

      const results = await toolsHelper.executeToolChain(toolCalls);

      expect(results).toHaveLength(2);
      expect(results[0]).toBe('結果1');
      expect(results[1]).toEqual({ error: 'ツール2エラー' });
    });
  });

  describe('便利メソッド', () => {
    it('readFile - ファイル読み取り', async () => {
      const mockContent = 'ファイル内容';
      (mockMCPManager.invokeTool as MockedFunction<any>).mockResolvedValue(mockContent);

      const result = await toolsHelper.readFile('/path/to/file.txt');

      expect(result).toBe(mockContent);
      expect(mockMCPManager.invokeTool).toHaveBeenCalledWith('filesystem:read_file', {
        path: '/path/to/file.txt',
      });
    });

    it('writeFile - ファイル書き込み', async () => {
      (mockMCPManager.invokeTool as MockedFunction<any>).mockResolvedValue(undefined);

      await toolsHelper.writeFile('/path/to/file.txt', 'コンテンツ');

      expect(mockMCPManager.invokeTool).toHaveBeenCalledWith('filesystem:write_file', {
        path: '/path/to/file.txt',
        content: 'コンテンツ',
      });
    });

    it('gitCommit - Gitコミット', async () => {
      const mockResult = 'コミット完了';
      (mockMCPManager.invokeTool as MockedFunction<any>).mockResolvedValue(mockResult);

      const result = await toolsHelper.gitCommit('テストコミット');

      expect(result).toBe(mockResult);
      expect(mockMCPManager.invokeTool).toHaveBeenCalledWith('git:commit', {
        message: 'テストコミット',
      });
    });

    it('webSearch - Web検索', async () => {
      const mockSearchResults = { results: [] };
      (mockMCPManager.invokeTool as MockedFunction<any>).mockResolvedValue(mockSearchResults);

      const result = await toolsHelper.webSearch('検索クエリ');

      expect(result).toBe(mockSearchResults);
      expect(mockMCPManager.invokeTool).toHaveBeenCalledWith('brave-search:search', {
        query: '検索クエリ',
      });
    });
  });

  describe('getServerStatus', () => {
    it('MCPサーバーのステータスを返す', () => {
      const mockStatus = new Map([
        ['server1', true],
        ['server2', false],
      ]);
      (mockMCPManager.getServerStatus as MockedFunction<any>).mockReturnValue(mockStatus);

      const result = toolsHelper.getServerStatus();

      expect(result).toBe(mockStatus);
    });
  });
});

describe('MCPTaskPlanner', () => {
  let taskPlanner: MCPTaskPlanner;
  let toolsHelper: MCPToolsHelper;

  beforeEach(() => {
    vi.clearAllMocks();
    toolsHelper = new MCPToolsHelper(mockMCPManager);
    taskPlanner = new MCPTaskPlanner(toolsHelper);
  });

  describe('createExecutionPlan', () => {
    const mockTools: Tool[] = [
      { name: 'filesystem:read_file', description: 'ファイルを読み取り' },
      { name: 'shell:run_command', description: 'シェルコマンド実行' },
      { name: 'brave-search:search', description: 'Web検索' },
    ];

    beforeEach(() => {
      (mockMCPManager.listTools as MockedFunction<any>).mockResolvedValue(mockTools);
    });

    it('読み取りタスクの実行プランを作成する', async () => {
      const plan = await taskPlanner.createExecutionPlan('ファイルを読み取り確認する');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?.tool).toBe('filesystem:read_file');
      expect(plan.steps[0]?.description).toBe('ファイル内容を読み取り');
      expect(plan.estimatedDuration).toBe(5000); // 1ステップ × 5秒
    });

    it('実行タスクの実行プランを作成する', async () => {
      const plan = await taskPlanner.createExecutionPlan('テストを実行する');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?.tool).toBe('shell:run_command');
      expect(plan.steps[0]?.description).toBe('コマンドを実行');
      expect(plan.estimatedDuration).toBe(5000);
    });

    it('検索タスクの実行プランを作成する', async () => {
      const plan = await taskPlanner.createExecutionPlan('最新情報を検索して調べる');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0]?.tool).toBe('brave-search:search');
      expect(plan.steps[0]?.description).toBe('Web検索を実行');
      expect(plan.estimatedDuration).toBe(5000);
    });

    it('複合タスクの実行プランを作成する', async () => {
      const plan = await taskPlanner.createExecutionPlan('ファイルを読み取ってテストを実行する');

      // 実際の実装では"読み取り"/"確認"と"実行"/"テスト"で異なるステップを作成する
      expect(plan.steps.length).toBeGreaterThanOrEqual(1);
      expect(plan.estimatedDuration).toBeGreaterThan(0);
    });

    it('空のタスクでも適切にプランを返す', async () => {
      const plan = await taskPlanner.createExecutionPlan('');

      expect(plan.steps).toHaveLength(0);
      expect(plan.estimatedDuration).toBe(0);
    });
  });
});

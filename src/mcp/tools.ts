import type { MCPManager, Tool } from './manager.js';
import { logger } from '../utils/logger.js';

/**
 * MCPツールの自動選択と実行を行うヘルパークラス
 */
export class MCPToolsHelper {
  constructor(private mcpManager: MCPManager) {}

  /**
   * タスクに応じて適切なツールを自動選択
   */
  async selectToolsForTask(taskDescription: string): Promise<Tool[]> {
    const availableTools = await this.mcpManager.listTools();
    const selectedTools: Tool[] = [];

    // タスク内容を解析してツールを選択
    const lowerTask = taskDescription.toLowerCase();

    // ファイル操作系
    if (
      lowerTask.includes('ファイル') ||
      lowerTask.includes('読み') ||
      lowerTask.includes('書き')
    ) {
      const fileTools = availableTools.filter(
        (t) => t.name.includes('read') || t.name.includes('write') || t.name.includes('file'),
      );
      selectedTools.push(...fileTools);
    }

    // Git操作系
    if (
      lowerTask.includes('git') ||
      lowerTask.includes('コミット') ||
      lowerTask.includes('プッシュ')
    ) {
      const gitTools = availableTools.filter(
        (t) => t.name.includes('git') || t.name.includes('commit'),
      );
      selectedTools.push(...gitTools);
    }

    // Web検索系
    if (lowerTask.includes('検索') || lowerTask.includes('調べ') || lowerTask.includes('情報')) {
      const searchTools = availableTools.filter(
        (t) => t.name.includes('search') || t.name.includes('web'),
      );
      selectedTools.push(...searchTools);
    }

    // コード実行系
    if (
      lowerTask.includes('実行') ||
      lowerTask.includes('テスト') ||
      lowerTask.includes('ビルド')
    ) {
      const execTools = availableTools.filter(
        (t) => t.name.includes('shell') || t.name.includes('exec') || t.name.includes('run'),
      );
      selectedTools.push(...execTools);
    }

    // データベース系
    if (lowerTask.includes('データ') || lowerTask.includes('db') || lowerTask.includes('sql')) {
      const dbTools = availableTools.filter(
        (t) => t.name.includes('sqlite') || t.name.includes('db') || t.name.includes('query'),
      );
      selectedTools.push(...dbTools);
    }

    return [...new Set(selectedTools)]; // 重複を除去
  }

  /**
   * ツールを実行して結果を取得
   */
  async executeTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    try {
      logger.info(`MCPツールを実行中: ${toolName}`, { params });
      const result = await this.mcpManager.invokeTool(toolName, params);
      logger.info(`MCPツール実行完了: ${toolName}`);
      return result;
    } catch (error) {
      logger.error(`MCPツール実行エラー: ${toolName}`, error);
      throw error;
    }
  }

  /**
   * 複数のツールを順次実行
   */
  async executeToolChain(
    toolCalls: Array<{ name: string; params: Record<string, unknown> }>,
  ): Promise<unknown[]> {
    const results: unknown[] = [];

    for (const toolCall of toolCalls) {
      try {
        const result = await this.executeTool(toolCall.name, toolCall.params);
        results.push(result);
      } catch (error) {
        logger.error(`ツールチェーンエラー: ${toolCall.name}`, error);
        results.push({ error: error instanceof Error ? error.message : String(error) });
      }
    }

    return results;
  }

  /**
   * ファイル操作の便利メソッド
   */
  async readFile(filePath: string): Promise<string> {
    const result = await this.executeTool('filesystem:read_file', { path: filePath });
    return result as string;
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await this.executeTool('filesystem:write_file', {
      path: filePath,
      content,
    });
  }

  async listDirectory(dirPath: string): Promise<string[]> {
    const result = await this.executeTool('filesystem:list_directory', { path: dirPath });
    return result as string[];
  }

  /**
   * Git操作の便利メソッド
   */
  async gitStatus(): Promise<string> {
    const result = await this.executeTool('git:status', {});
    return result as string;
  }

  async gitCommit(message: string): Promise<string> {
    const result = await this.executeTool('git:commit', { message });
    return result as string;
  }

  async gitPush(): Promise<string> {
    const result = await this.executeTool('git:push', {});
    return result as string;
  }

  /**
   * Web検索の便利メソッド
   */
  async webSearch(query: string): Promise<unknown> {
    const result = await this.executeTool('brave-search:search', { query });
    return result;
  }

  /**
   * コード実行の便利メソッド
   */
  async runCommand(command: string, args: string[] = []): Promise<string> {
    const result = await this.executeTool('shell:run_command', {
      command,
      args,
    });
    return result as string;
  }

  /**
   * SQLクエリ実行の便利メソッド
   */
  async executeQuery(query: string): Promise<unknown> {
    const result = await this.executeTool('sqlite:execute', { query });
    return result;
  }

  /**
   * 利用可能なツールの一覧を取得
   */
  async getAvailableTools(): Promise<Tool[]> {
    return this.mcpManager.listTools();
  }

  /**
   * ツールの詳細情報を取得
   */
  async getToolInfo(toolName: string): Promise<Tool | undefined> {
    const tools = await this.getAvailableTools();
    return tools.find((t) => t.name === toolName);
  }

  /**
   * MCPサーバーのステータスを確認
   */
  getServerStatus(): Map<string, boolean> {
    return this.mcpManager.getServerStatus();
  }
}

/**
 * タスクに基づいてMCPツールを使用した実行プランを生成
 */
export class MCPTaskPlanner {
  // @ts-expect-error 将来的に使用予定
  constructor(private _toolsHelper: MCPToolsHelper) {}

  /**
   * タスクを解析して実行プランを作成
   */
  async createExecutionPlan(taskDescription: string): Promise<{
    steps: Array<{
      description: string;
      tool: string;
      params: Record<string, unknown>;
    }>;
    estimatedDuration: number;
  }> {
    // 将来的にtoolsHelperを使用してツール選択の自動化を行う予定
    // const tools = await this._toolsHelper.selectToolsForTask(taskDescription);
    const lowerTask = taskDescription.toLowerCase();
    const steps: Array<{ description: string; tool: string; params: Record<string, unknown> }> = [];

    // ファイル読み取りタスク
    if (lowerTask.includes('読み取り') || lowerTask.includes('確認')) {
      steps.push({
        description: 'ファイル内容を読み取り',
        tool: 'filesystem:read_file',
        params: { path: this.extractFilePath(taskDescription) },
      });
    }

    // コード実行タスク
    if (lowerTask.includes('実行') || lowerTask.includes('テスト')) {
      steps.push({
        description: 'コマンドを実行',
        tool: 'shell:run_command',
        params: { command: this.extractCommand(taskDescription) },
      });
    }

    // 情報検索タスク
    if (lowerTask.includes('検索') || lowerTask.includes('調べ')) {
      steps.push({
        description: 'Web検索を実行',
        tool: 'brave-search:search',
        params: { query: this.extractSearchQuery(taskDescription) },
      });
    }

    return {
      steps,
      estimatedDuration: steps.length * 5000, // 1ステップあたり5秒の見積もり
    };
  }

  private extractFilePath(task: string): string {
    // 簡単な正規表現でファイルパスを抽出
    const match = task.match(/([/\w\-.]+\.\w+)/);
    return match?.[1] ?? './';
  }

  private extractCommand(task: string): string {
    // コマンドを抽出する簡単なロジック
    if (task.includes('テスト')) return 'bun test';
    if (task.includes('ビルド')) return 'bun run build';
    if (task.includes('型チェック')) return 'bun run typecheck';
    return 'echo "実行可能なコマンドが見つかりません"';
  }

  private extractSearchQuery(task: string): string {
    // 検索クエリを抽出
    const match = task.match(/(?:検索|調べ)[：:]\s*(.+)/);
    return match?.[1]?.trim() ?? task;
  }
}

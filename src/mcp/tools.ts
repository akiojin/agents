import type { MCPManager, Tool } from './manager.js';
import { logger } from '../utils/logger.js';
import { ParallelExecutor, ParallelTask } from '../core/parallel-executor.js';

/**
 * MCPツールの自動選択と実行を行うヘルパークラス
 */
export class MCPToolsHelper {
  private parallelExecutor: ParallelExecutor;

  constructor(private mcpManager: MCPManager) {
    this.parallelExecutor = new ParallelExecutor(5); // デフォルトで最大5並列
  }

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
   * 複数のツールを並列実行
   */
  async executeToolsInParallel(
    toolCalls: Array<{ name: string; params: Record<string, unknown>; description?: string }>,
    onProgress?: (completed: number, total: number, currentTool?: string) => void
  ): Promise<Array<{ success: boolean; result?: unknown; error?: string; toolName: string; duration: number }>> {
    // ツール呼び出しをParallelTaskに変換
    const parallelTasks: ParallelTask<unknown>[] = toolCalls.map((toolCall, index) => ({
      id: `tool-${index}-${toolCall.name}`,
      description: toolCall.description || `Execute ${toolCall.name}`,
      priority: 5,
      task: () => this.executeTool(toolCall.name, toolCall.params),
    }));

    // 独立したツールを識別して並列実行
    const independentTools = this.identifyIndependentTools(parallelTasks, toolCalls);
    const dependentTools = parallelTasks.filter(t => 
      !independentTools.some(it => it.id === t.id)
    );

    const results: Array<{ success: boolean; result?: unknown; error?: string; toolName: string; duration: number }> = [];

    // 独立したツールを並列実行
    if (independentTools.length > 0) {
      logger.info(`${independentTools.length}個のツールを並列実行中...`);
      
      const parallelResults = await this.parallelExecutor.executeParallelWithDetails(
        independentTools,
        onProgress
      );

      const parallelFormattedResults = parallelResults.map((pr) => {
        // ParallelTaskのIDからツール名を抽出
        const toolName = pr.taskId?.split('-').slice(2).join('-') || 'unknown';
        return {
          success: pr.success,
          result: pr.data,
          error: pr.error?.message,
          toolName,
          duration: pr.duration,
        };
      });

      results.push(...parallelFormattedResults);
    }

    // 依存関係のあるツールを順次実行
    if (dependentTools.length > 0) {
      logger.info(`${dependentTools.length}個のツールを順次実行中...`);
      
      for (const dependentTask of dependentTools) {
        const startTime = Date.now();
        try {
          const result = await dependentTask.task();
          const duration = Date.now() - startTime;
          
          results.push({
            success: true,
            result,
            toolName: dependentTask.id?.split('-').slice(2).join('-') || 'unknown',
            duration,
          });

          onProgress?.(results.length, toolCalls.length, dependentTask.description);
        } catch (error) {
          const duration = Date.now() - startTime;
          
          results.push({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            toolName: dependentTask.id?.split('-').slice(2).join('-') || 'unknown',
            duration,
          });

          onProgress?.(results.length, toolCalls.length, `${dependentTask.description} (Error)`);
        }
      }
    }

    return results;
  }

  /**
   * 独立したツールを識別
   */
  private identifyIndependentTools(
    tasks: ParallelTask<unknown>[],
    originalToolCalls: Array<{ name: string; params: Record<string, unknown> }>
  ): ParallelTask<unknown>[] {
    const independentTasks: ParallelTask<unknown>[] = [];
    const usedResources = new Set<string>();

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      const toolCall = originalToolCalls[i];
      
      if (!toolCall) continue; // undefinedチェック
      
      // ツールの種類と操作対象を分析
      const resources = this.extractResourcesFromToolCall(toolCall);
      const hasConflict = resources.some(resource => usedResources.has(resource));

      // リソース競合がなく、読み取り専用操作の場合は並列実行可能
      if (!hasConflict && this.isReadOnlyOperation(toolCall.name)) {
        independentTasks.push(task);
        // forEach + asyncの問題を修正：for...ofループを使用
        for (const resource of resources) {
          usedResources.add(resource);
        }
      }
      // 書き込み操作でも、異なるリソースなら並列実行可能
      else if (!hasConflict) {
        independentTasks.push(task);
        // forEach + asyncの問題を修正：for...ofループを使用
        for (const resource of resources) {
          usedResources.add(resource);
        }
      }
    }

    // 最低でも1つのタスクは独立として扱う
    if (independentTasks.length === 0 && tasks.length > 0) {
      independentTasks.push(tasks[0]);
    }

    logger.debug(`${tasks.length}個中${independentTasks.length}個のツールが並列実行可能として識別されました`);
    return independentTasks;
  }

  /**
   * ツール呼び出しから操作対象リソースを抽出
   */
  private extractResourcesFromToolCall(toolCall: { name: string; params: Record<string, unknown> }): string[] {
    const resources: string[] = [];
    
    // ファイルシステム関連
    if (toolCall.name.includes('filesystem') || toolCall.name.includes('file')) {
      const path = toolCall.params.path as string;
      if (path) {
        resources.push(`file:${path}`);
      }
    }

    // Git関連（同一リポジトリを操作）
    if (toolCall.name.includes('git')) {
      resources.push('git:repository');
    }

    // データベース関連
    if (toolCall.name.includes('sqlite') || toolCall.name.includes('db')) {
      resources.push('database:main');
    }

    // ネットワーク関連は通常独立
    if (toolCall.name.includes('search') || toolCall.name.includes('web')) {
      resources.push(`network:${toolCall.name}`);
    }

    return resources;
  }

  /**
   * 読み取り専用操作かを判定
   */
  private isReadOnlyOperation(toolName: string): boolean {
    const readOnlyPatterns = [
      'read',
      'get',
      'list',
      'search',
      'status',
      'info',
      'show',
      'view',
    ];

    return readOnlyPatterns.some(pattern => toolName.toLowerCase().includes(pattern));
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

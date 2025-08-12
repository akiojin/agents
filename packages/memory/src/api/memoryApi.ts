/**
 * 記憶システムAPI
 * open-gemini-cliのツールシステムと統合するためのインターフェース
 */

import { IntegratedMemorySystem } from '../index.js';
import { SerenaMCPClient } from '../serena/serenaClient.js';

export interface MemoryEvent {
  type: 'error' | 'success' | 'discovery' | 'user_input' | 'tool_execution';
  content: any;
  context?: any;
  timestamp: Date;
}

export interface MemoryAPIConfig {
  enableAutoMemory?: boolean;
  sqlitePath?: string;
  projectName?: string;
}

export class MemoryAPI {
  private memorySystem: IntegratedMemorySystem;
  private serenaClient: SerenaMCPClient;
  private config: MemoryAPIConfig;
  private eventQueue: MemoryEvent[] = [];
  private isProcessing: boolean = false;

  constructor(config: MemoryAPIConfig = {}) {
    this.config = {
      enableAutoMemory: config.enableAutoMemory !== false,
      sqlitePath: config.sqlitePath || '.agents/cache/memory.db',
      projectName: config.projectName || 'default'
    };

    this.memorySystem = new IntegratedMemorySystem({
      collectionName: 'agent_memories'
    });
    
    this.serenaClient = new SerenaMCPClient();
  }

  /**
   * 初期化
   */
  async initialize(): Promise<void> {
    await this.memorySystem.initialize();
    await this.serenaClient.activateProject(this.config.projectName!);
    
    if (this.config.enableAutoMemory) {
      this.startEventProcessing();
    }
    
    // Memory API初期化済み
  }

  /**
   * イベントの記録
   */
  async recordEvent(event: MemoryEvent): Promise<void> {
    this.eventQueue.push(event);
    
    if (!this.isProcessing && this.config.enableAutoMemory) {
      await this.processEventQueue();
    }
  }

  /**
   * エラーの記録と解決策の検索
   */
  async handleError(
    error: string,
    context: any = {}
  ): Promise<{ solution?: string; confidence?: number; memoryId?: string }> {
    // 既知のエラー解決策を検索
    const solution = await this.memorySystem.findErrorSolution(error, context);
    
    if (solution && solution.confidence > 0.7) {
      console.log(`Found solution with confidence ${solution.confidence}: ${solution.solution}`);
      return solution;
    }
    
    // 解決策が見つからない場合は記録のみ
    const memoryId = await this.memorySystem.store({
      type: 'unresolved_error',
      error,
      context,
      timestamp: new Date()
    }, ['error', 'unresolved']);
    
    return { memoryId };
  }

  /**
   * エラー解決の記録
   */
  async recordErrorResolution(
    error: string,
    solution: string,
    context: any = {}
  ): Promise<string> {
    return await this.memorySystem.storeErrorPattern(error, solution, context);
  }

  /**
   * タスク成功の記録
   */
  async recordSuccess(
    task: string,
    steps: string[],
    result: any = {}
  ): Promise<string> {
    return await this.memorySystem.storeSuccessPattern(task, steps, result);
  }

  /**
   * プロジェクト固有情報の記録
   */
  async recordProjectInfo(type: string, value: any): Promise<void> {
    await this.serenaClient.writeMemory(type, value);
  }

  /**
   * コンテキスト認識検索
   */
  async search(
    query: string,
    includeProjectInfo: boolean = true
  ): Promise<any[]> {
    const results: any[] = [];
    
    // SQLiteから検索
    const memories = await this.memorySystem.recall(query);
    results.push(...memories);
    
    // プロジェクト情報も含める
    if (includeProjectInfo) {
      const projectInfo = await this.serenaClient.readMemory();
      if (this.matchesQuery(query, projectInfo)) {
        results.push({
          type: 'project_info',
          content: projectInfo
        });
      }
    }
    
    return results;
  }

  /**
   * 汎用記憶保存（ツール用）
   */
  async storeGeneral(content: any, tags: string[] = []): Promise<string> {
    return await this.memorySystem.store(content, tags);
  }

  /**
   * 記憶の使用とフィードバック
   */
  async useMemory(memoryId: string): Promise<void> {
    await this.memorySystem.use(memoryId);
  }

  async provideFeedback(
    memoryId: string,
    success: boolean
  ): Promise<void> {
    await this.memorySystem.feedback(memoryId, success);
  }

  /**
   * 統計情報の取得
   */
  async getStatistics(): Promise<any> {
    const stats = await this.memorySystem.getStatistics();
    const projects = this.serenaClient.getAllProjects();
    
    return {
      ...stats,
      activeProject: this.config.projectName,
      totalProjects: projects.length,
      projects
    };
  }

  /**
   * 重要な記憶の取得
   */
  async getImportantMemories(limit: number = 10): Promise<any[]> {
    return await this.memorySystem.getImportantMemories(limit);
  }

  /**
   * ツール実行の記録
   */
  async recordToolExecution(
    toolName: string,
    params: any,
    result: any,
    duration: number
  ): Promise<void> {
    await this.recordEvent({
      type: 'tool_execution',
      content: {
        toolName,
        params,
        result,
        duration
      },
      timestamp: new Date()
    });
  }

  /**
   * ユーザー入力の記録
   */
  async recordUserInput(input: string, context: any = {}): Promise<void> {
    await this.recordEvent({
      type: 'user_input',
      content: {
        input,
        context
      },
      timestamp: new Date()
    });
  }

  /**
   * イベントキューの処理
   */
  private async processEventQueue(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      
      // イベントが記憶すべきか判断
      const shouldRemember = await this.memorySystem.checkMemoryRelevance(event);
      
      if (shouldRemember) {
        await this.memorySystem.store(event.content, [event.type]);
        console.log(`Memorized event: ${event.type}`);
      }
    }
    
    this.isProcessing = false;
  }

  /**
   * イベント処理の自動開始
   */
  private startEventProcessing(): void {
    setInterval(async () => {
      if (!this.isProcessing && this.eventQueue.length > 0) {
        await this.processEventQueue();
      }
    }, 5000);  // 5秒ごとにチェック
  }

  /**
   * クエリマッチング（簡易版）
   */
  private matchesQuery(query: string, data: any): boolean {
    const queryLower = query.toLowerCase();
    const dataStr = JSON.stringify(data).toLowerCase();
    
    // 単語分割してすべて含まれているかチェック
    const words = queryLower.split(/\s+/);
    return words.every(word => dataStr.includes(word));
  }

  /**
   * クリーンアップ
   */
  async cleanup(): Promise<void> {
    await this.memorySystem.cleanup();
  }
}

// シングルトンインスタンス
let memoryAPIInstance: MemoryAPI | null = null;

/**
 * Memory APIのシングルトンインスタンスを取得
 */
export function getMemoryAPI(config?: MemoryAPIConfig): MemoryAPI {
  if (!memoryAPIInstance) {
    memoryAPIInstance = new MemoryAPI(config);
  }
  return memoryAPIInstance;
}
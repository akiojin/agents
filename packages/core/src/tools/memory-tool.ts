/**
 * 記憶システムツール
 * LLMが直接記憶の保存・検索・活用ができるようにする
 */

import { BaseTool, ToolResult } from './tools.js';
import { FunctionDeclaration, Type } from '@google/genai';
import { MemoryAPI, getMemoryAPI } from '@agents/memory';

// 記憶保存ツール
const saveMemorySchema: FunctionDeclaration = {
  name: 'save_memory',
  description: `記憶システムに情報を保存します。エラー解決策、成功パターン、重要な発見などを永続的に記憶します。

使用する場面:
- エラーを解決した時（エラーメッセージと解決策をセットで保存）
- タスクを成功させた時（手順と結果を保存）
- 重要な情報を発見した時
- ユーザーから「覚えておいて」と言われた時`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      type: {
        type: Type.STRING,
        enum: ['error_solution', 'success_pattern', 'discovery', 'user_request', 'general'],
        description: '記憶のタイプ'
      },
      content: {
        type: Type.OBJECT,
        description: '記憶する内容（構造化データ）',
        properties: {
          title: { type: Type.STRING, description: '記憶のタイトル' },
          description: { type: Type.STRING, description: '詳細な説明' },
          error: { type: Type.STRING, description: 'エラーメッセージ（error_solutionの場合）' },
          solution: { type: Type.STRING, description: '解決策（error_solutionの場合）' },
          steps: { 
            type: Type.ARRAY, 
            items: { type: Type.STRING },
            description: '手順（success_patternの場合）' 
          },
          context: { type: Type.OBJECT, description: '文脈情報' }
        }
      },
      tags: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'タグ（検索用）'
      }
    },
    required: ['type', 'content']
  }
};

// 記憶検索ツール
const searchMemorySchema: FunctionDeclaration = {
  name: 'search_memory',
  description: `記憶システムから関連情報を検索します。過去のエラー解決策、成功パターン、プロジェクト情報などを取得できます。

使用する場面:
- エラーが発生した時（過去の解決策を検索）
- 似たようなタスクを実行する時（成功パターンを検索）
- プロジェクト固有の情報が必要な時
- 「前にやったことがある」と思った時`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: '検索クエリ（自然言語）'
      },
      type: {
        type: Type.STRING,
        enum: ['all', 'error', 'success', 'project', 'user_memory'],
        description: '検索対象の記憶タイプ'
      },
      limit: {
        type: Type.NUMBER,
        description: '取得する記憶の最大数',
        default: 5
      }
    },
    required: ['query']
  }
};

// 記憶フィードバックツール
const memoryFeedbackSchema: FunctionDeclaration = {
  name: 'memory_feedback',
  description: `使用した記憶に対してフィードバックを提供します。記憶の有用性を学習し、次回の検索精度を向上させます。`,
  parameters: {
    type: Type.OBJECT,
    properties: {
      memoryId: {
        type: Type.STRING,
        description: '記憶のID'
      },
      success: {
        type: Type.BOOLEAN,
        description: '記憶が役立ったかどうか'
      },
      comment: {
        type: Type.STRING,
        description: 'オプショナルなコメント'
      }
    },
    required: ['memoryId', 'success']
  }
};

// 記憶保存ツールクラス
export class SaveMemoryTool extends BaseTool<any, ToolResult> {
  private memoryAPI: MemoryAPI;
  
  constructor() {
    super(
      'save_memory',
      'Save Memory',
      saveMemorySchema.description!,
      saveMemorySchema.parameters as Record<string, unknown>
    );
    this.memoryAPI = getMemoryAPI();
  }

  async execute(params: any): Promise<ToolResult> {
    try {
      let memoryId: string;
      
      switch (params.type) {
        case 'error_solution':
          memoryId = await this.memoryAPI.recordErrorResolution(
            params.content.error,
            params.content.solution,
            params.content.context || {}
          );
          break;
        
        case 'success_pattern':
          memoryId = await this.memoryAPI.recordSuccess(
            params.content.title,
            params.content.steps || [],
            params.content.context || {}
          );
          break;
        
        default:
          memoryId = await this.memoryAPI.storeGeneral(
            params.content,
            params.tags || [params.type]
          );
      }
      
      return {
        llmContent: `記憶を保存しました (ID: ${memoryId})`,
        returnDisplay: `✅ Memory saved: ${params.content.title || params.type}\nID: ${memoryId}`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `記憶の保存に失敗: ${errorMessage}`,
        returnDisplay: `❌ Failed to save memory: ${errorMessage}`
      };
    }
  }
}

// 記憶検索ツールクラス
export class SearchMemoryTool extends BaseTool<any, ToolResult> {
  private memoryAPI: MemoryAPI;
  
  constructor() {
    super(
      'search_memory',
      'Search Memory',
      searchMemorySchema.description!,
      searchMemorySchema.parameters as Record<string, unknown>
    );
    this.memoryAPI = getMemoryAPI();
  }

  async execute(params: any): Promise<ToolResult> {
    try {
      const memories = await this.memoryAPI.search(
        params.query,
        params.type !== 'project'
      );
      
      const limitedMemories = memories.slice(0, params.limit || 5);
      
      if (limitedMemories.length === 0) {
        return {
          llmContent: '関連する記憶が見つかりませんでした',
          returnDisplay: '🔍 No relevant memories found'
        };
      }
      
      // 記憶を整形
      const formattedMemories = limitedMemories.map((memory, index) => {
        const content = memory.content || memory;
        return {
          index: index + 1,
          id: memory.id,
          type: content.type || 'unknown',
          summary: this.summarizeMemory(content),
          relevance: memory.metadata?.success_rate || 0,
          accessCount: memory.metadata?.access_count || 0
        };
      });
      
      const display = formattedMemories.map(m => 
        `${m.index}. [${m.type}] ${m.summary}\n   📊 Relevance: ${(m.relevance * 100).toFixed(0)}% | Uses: ${m.accessCount}`
      ).join('\n\n');
      
      return {
        llmContent: JSON.stringify(formattedMemories, null, 2),
        returnDisplay: `🔍 Found ${limitedMemories.length} memories:\n\n${display}`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `記憶の検索に失敗: ${errorMessage}`,
        returnDisplay: `❌ Failed to search memory: ${errorMessage}`
      };
    }
  }
  
  private summarizeMemory(content: any): string {
    if (typeof content === 'string') {
      return content.substring(0, 100);
    }
    
    if (content.title) {
      return content.title;
    }
    
    if (content.error && content.solution) {
      return `Error: ${content.error.substring(0, 50)}... → ${content.solution.substring(0, 50)}...`;
    }
    
    if (content.task) {
      return content.task;
    }
    
    return JSON.stringify(content).substring(0, 100);
  }
}

// 記憶フィードバックツールクラス
export class MemoryFeedbackTool extends BaseTool<any, ToolResult> {
  private memoryAPI: MemoryAPI;
  
  constructor() {
    super(
      'memory_feedback',
      'Memory Feedback',
      memoryFeedbackSchema.description!,
      memoryFeedbackSchema.parameters as Record<string, unknown>
    );
    this.memoryAPI = getMemoryAPI();
  }

  async execute(params: any): Promise<ToolResult> {
    try {
      await this.memoryAPI.provideFeedback(params.memoryId, params.success);
      
      const feedbackType = params.success ? '有用' : '無用';
      
      return {
        llmContent: `記憶へのフィードバックを記録しました (${feedbackType})`,
        returnDisplay: `✅ Feedback recorded: ${feedbackType}\nMemory ID: ${params.memoryId}${params.comment ? `\nComment: ${params.comment}` : ''}`
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `フィードバックの記録に失敗: ${errorMessage}`,
        returnDisplay: `❌ Failed to record feedback: ${errorMessage}`
      };
    }
  }
}

// 記憶統計ツール
const memoryStatsSchema: FunctionDeclaration = {
  name: 'memory_stats',
  description: '記憶システムの統計情報を取得します',
  parameters: {
    type: Type.OBJECT,
    properties: {},
    required: []
  }
};

export class MemoryStatsTool extends BaseTool<any, ToolResult> {
  private memoryAPI: MemoryAPI;
  
  constructor() {
    super(
      'memory_stats',
      'Memory Statistics',
      memoryStatsSchema.description!,
      memoryStatsSchema.parameters as Record<string, unknown>
    );
    this.memoryAPI = getMemoryAPI();
  }

  async execute(_params: any): Promise<ToolResult> {
    try {
      const stats = await this.memoryAPI.getStatistics();
      
      const display = `📊 Memory System Statistics:
      
Total Memories: ${stats.totalMemories}
Average Access Count: ${stats.averageAccessCount.toFixed(1)}
Average Success Rate: ${(stats.averageSuccessRate * 100).toFixed(1)}%
Active Project: ${stats.activeProject}
Total Projects: ${stats.totalProjects}

Most Accessed Memories:
${stats.mostAccessedMemories.slice(0, 3).map((m: any, i: number) => 
  `${i + 1}. ${this.summarizeMemory(m.content)} (${m.metadata.access_count} uses)`
).join('\n')}

Recent Memories:
${stats.recentMemories.slice(0, 3).map((m: any, i: number) => 
  `${i + 1}. ${this.summarizeMemory(m.content)}`
).join('\n')}`;
      
      return {
        llmContent: JSON.stringify(stats, null, 2),
        returnDisplay: display
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        llmContent: `統計情報の取得に失敗: ${errorMessage}`,
        returnDisplay: `❌ Failed to get statistics: ${errorMessage}`
      };
    }
  }
  
  private summarizeMemory(content: any): string {
    if (typeof content === 'string') {
      return content.substring(0, 50);
    }
    if (content.title) {
      return content.title.substring(0, 50);
    }
    return JSON.stringify(content).substring(0, 50);
  }
}
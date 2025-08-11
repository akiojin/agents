/**
 * 既存ツールとIntelligentFileSystemの統合層
 * 後方互換性を維持しながら段階的に移行
 */

import { IntelligentFileSystem, IntelligentReadResult, SemanticEditOptions, SecurityConfig } from './intelligent-filesystem.js';

// ロガー（簡易実装）
const logger = {
  debug: (message: string, data?: any) => console.debug(message, data),
  info: (message: string, data?: any) => console.info(message, data),
  warn: (message: string, data?: any) => console.warn(message, data),
  error: (message: string, data?: any) => console.error(message, data)
};

/**
 * 内部関数インターフェース（registryとの循環参照を回避）
 */
export interface InternalFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      default?: any;
    }>;
    required?: string[];
  };
  handler: (params: any) => Promise<any>;
}

/**
 * IntelligentFileSystemのシングルトンインスタンス
 */
let intelligentFS: IntelligentFileSystem | null = null;
let isInitialized = false;

/**
 * IntelligentFileSystemを初期化
 */
export async function initializeIntelligentFS(securityConfig: SecurityConfig): Promise<void> {
  if (!intelligentFS) {
    intelligentFS = new IntelligentFileSystem(securityConfig);
    await intelligentFS.initialize();
    isInitialized = true;
    logger.info('IntelligentFileSystem initialized for tool integration');
  }
}

/**
 * 拡張Read関数を作成
 * 既存のReadFileと互換性を保ちながら、追加情報を提供
 */
export function createIntelligentReadFunctions(): InternalFunction[] {
  const functions: InternalFunction[] = [];

  // 拡張ReadFile関数
  functions.push({
    name: 'ReadFileIntelligent',
    description: 'ファイルを読み取り、シンボル情報と依存関係を含む詳細情報を提供',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'ファイルパス'
        },
        includeSymbols: {
          type: 'boolean',
          description: 'シンボル情報を含めるか（デフォルト: true）'
        },
        includeDependencies: {
          type: 'boolean',
          description: '依存関係情報を含めるか（デフォルト: true）'
        },
        useCache: {
          type: 'boolean',
          description: 'キャッシュを使用するか（デフォルト: true）'
        }
      },
      required: ['path']
    },
    handler: async (params) => {
      if (!intelligentFS || !isInitialized) {
        return {
          success: false,
          error: 'IntelligentFileSystem not initialized'
        };
      }

      try {
        const result = await intelligentFS.readFile(params.path, {
          includeSymbols: params.includeSymbols !== false,
          includeDependencies: params.includeDependencies !== false,
          useCache: params.useCache !== false
        });

        if (!result.success) {
          return result;
        }

        // 拡張情報を整形
        const response: any = {
          success: true,
          content: result.content,
          metadata: result.fileMetadata
        };

        // シンボル情報を追加
        if (result.symbols && result.symbols.length > 0) {
          response.symbols = result.symbols.map(s => ({
            name: s.name,
            kind: s.kind,
            line: s.startLine + 1,
            character: s.startCharacter + 1,
            container: s.containerName
          }));
          response.symbolCount = result.symbols.length;
        }

        // 依存関係情報を追加
        if (result.imports || result.exports) {
          response.dependencies = {
            imports: result.imports || [],
            exports: result.exports || [],
            total: result.dependencies?.length || 0
          };
        }

        // キャッシュ情報
        if (result.cachedInIndex) {
          response.cached = true;
        }

        return response;
      } catch (error) {
        logger.error('Intelligent read failed', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  });

  // シンボル検索関数
  functions.push({
    name: 'FindSymbolInFile',
    description: 'ファイル内の特定のシンボルを検索',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'ファイルパス'
        },
        symbolName: {
          type: 'string',
          description: '検索するシンボル名'
        },
        symbolKind: {
          type: 'string',
          description: 'シンボルの種類（class, function, variable等）'
        }
      },
      required: ['path', 'symbolName']
    },
    handler: async (params) => {
      if (!intelligentFS) {
        return {
          success: false,
          error: 'IntelligentFileSystem not initialized'
        };
      }

      const result = await intelligentFS.readFile(params.path, {
        includeSymbols: true,
        includeDependencies: false,
        useCache: true
      });

      if (!result.success || !result.symbols) {
        return {
          success: false,
          error: 'Failed to read file or no symbols found'
        };
      }

      // シンボルをフィルタリング
      const matchingSymbols = result.symbols.filter(s => {
        const nameMatch = s.name.includes(params.symbolName);
        const kindMatch = !params.symbolKind || 
          s.kind.toLowerCase() === params.symbolKind.toLowerCase();
        return nameMatch && kindMatch;
      });

      return {
        success: true,
        symbols: matchingSymbols.map(s => ({
          name: s.name,
          kind: s.kind,
          location: {
            line: s.startLine + 1,
            character: s.startCharacter + 1
          },
          container: s.containerName,
          signature: s.signature
        })),
        count: matchingSymbols.length
      };
    }
  });

  return functions;
}

/**
 * 拡張Edit関数を作成
 * セマンティック編集機能を提供
 */
export function createIntelligentEditFunctions(): InternalFunction[] {
  const functions: InternalFunction[] = [];

  // リファクタリング関数
  functions.push({
    name: 'RefactorSymbol',
    description: 'シンボルをリファクタリング（名前変更）し、全参照を自動更新',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'ファイルパス'
        },
        oldName: {
          type: 'string',
          description: '現在のシンボル名'
        },
        newName: {
          type: 'string',
          description: '新しいシンボル名'
        },
        updateReferences: {
          type: 'boolean',
          description: '全参照を更新するか（デフォルト: true）'
        }
      },
      required: ['path', 'oldName', 'newName']
    },
    handler: async (params) => {
      if (!intelligentFS) {
        return {
          success: false,
          error: 'IntelligentFileSystem not initialized'
        };
      }

      try {
        const result = await intelligentFS.semanticEdit(params.path, {
          mode: 'refactor',
          symbol: params.oldName,
          newName: params.newName,
          updateReferences: params.updateReferences !== false
        });

        if (!result.success) {
          return result;
        }

        return {
          success: true,
          message: `Successfully refactored ${params.oldName} to ${params.newName}`,
          updatedFiles: result.data?.updatedFiles || [],
          affectedSymbols: result.data?.affectedSymbols || []
        };
      } catch (error) {
        logger.error('Refactor failed', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  });

  // インテリジェント挿入関数
  functions.push({
    name: 'InsertCodeIntelligent',
    description: '指定されたシンボルの前後にコードを挿入し、必要なimportを自動追加',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'ファイルパス'
        },
        content: {
          type: 'string',
          description: '挿入するコード'
        },
        afterSymbol: {
          type: 'string',
          description: 'このシンボルの後に挿入'
        },
        beforeSymbol: {
          type: 'string',
          description: 'このシンボルの前に挿入'
        },
        updateImports: {
          type: 'boolean',
          description: '必要なimportを自動追加（デフォルト: true）'
        }
      },
      required: ['path', 'content']
    },
    handler: async (params) => {
      if (!intelligentFS) {
        return {
          success: false,
          error: 'IntelligentFileSystem not initialized'
        };
      }

      if (!params.afterSymbol && !params.beforeSymbol) {
        return {
          success: false,
          error: 'Either afterSymbol or beforeSymbol must be specified'
        };
      }

      try {
        const result = await intelligentFS.semanticEdit(params.path, {
          mode: 'insert',
          content: params.content,
          afterSymbol: params.afterSymbol,
          beforeSymbol: params.beforeSymbol,
          updateImports: params.updateImports !== false
        });

        if (!result.success) {
          return result;
        }

        return {
          success: true,
          message: 'Code inserted successfully',
          updatedFiles: result.data?.updatedFiles || []
        };
      } catch (error) {
        logger.error('Insert failed', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  });

  // インテリジェント書き込み関数
  functions.push({
    name: 'WriteFileIntelligent',
    description: 'ファイルに書き込み、自動的にインデックスを更新',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'ファイルパス'
        },
        content: {
          type: 'string',
          description: 'ファイルの内容'
        },
        updateIndex: {
          type: 'boolean',
          description: 'インデックスを更新するか（デフォルト: true）'
        },
        trackHistory: {
          type: 'boolean',
          description: '編集履歴を記録するか（デフォルト: true）'
        }
      },
      required: ['path', 'content']
    },
    handler: async (params) => {
      if (!intelligentFS) {
        return {
          success: false,
          error: 'IntelligentFileSystem not initialized'
        };
      }

      try {
        const result = await intelligentFS.writeFile(
          params.path,
          params.content,
          {
            updateIndex: params.updateIndex !== false,
            trackHistory: params.trackHistory !== false
          }
        );

        if (!result.success) {
          return result;
        }

        // インデックス更新後の統計を取得
        const stats = intelligentFS.getStats();

        return {
          success: true,
          message: 'File written successfully',
          stats: {
            cacheHitRate: stats.cacheHitRate,
            totalWrites: stats.totalWrites
          }
        };
      } catch (error) {
        logger.error('Write failed', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  });

  return functions;
}

/**
 * プロジェクト管理関数を作成
 */
export function createProjectManagementFunctions(): InternalFunction[] {
  const functions: InternalFunction[] = [];

  // プロジェクトインデックス関数
  functions.push({
    name: 'IndexProjectIntelligent',
    description: 'プロジェクト全体をインデックス化し、高速検索を可能にする',
    parameters: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description: '強制的に再インデックス化するか'
        }
      },
      required: []
    },
    handler: async (params) => {
      if (!intelligentFS) {
        return {
          success: false,
          error: 'IntelligentFileSystem not initialized'
        };
      }

      try {
        const stats = await intelligentFS.indexProject(params.force || false);
        
        return {
          success: true,
          message: 'Project indexed successfully',
          stats: {
            filesIndexed: stats?.filesIndexed || 0,
            success: stats?.success || false,
            error: stats?.error || undefined
          }
        };
      } catch (error) {
        logger.error('Project indexing failed', { error });
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
  });

  // パフォーマンス統計関数
  functions.push({
    name: 'GetPerformanceStats',
    description: 'IntelligentFileSystemのパフォーマンス統計を取得',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    },
    handler: async () => {
      if (!intelligentFS) {
        return {
          success: false,
          error: 'IntelligentFileSystem not initialized'
        };
      }

      const stats = intelligentFS.getStats();
      
      return {
        success: true,
        stats: {
          cacheHitRate: `${(stats.cacheHitRate * 100).toFixed(2)}%`,
          totalReads: stats.totalReads,
          totalWrites: stats.totalWrites,
          cacheHits: stats.cacheHits,
          cacheMisses: stats.cacheMisses,
          averageIndexingTime: `${stats.averageIndexingTime.toFixed(2)}ms`
        }
      };
    }
  });

  // 編集履歴関数
  functions.push({
    name: 'GetEditHistory',
    description: '最近の編集履歴を取得',
    parameters: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: '取得する履歴の数（デフォルト: 10）'
        }
      },
      required: []
    },
    handler: async (params) => {
      if (!intelligentFS) {
        return {
          success: false,
          error: 'IntelligentFileSystem not initialized'
        };
      }

      const history = intelligentFS.getEditHistory(params.limit || 10);
      
      return {
        success: true,
        history: history.map(entry => ({
          timestamp: entry.timestamp.toISOString(),
          file: entry.filePath,
          operation: entry.operation,
          affectedSymbols: entry.affectedSymbols,
          success: entry.success
        })),
        count: history.length
      };
    }
  });

  return functions;
}

/**
 * シンボル種別名を取得
 */
function getSymbolKindName(kind: number): string {
  const kinds: Record<number, string> = {
    1: 'File',
    2: 'Module',
    3: 'Namespace',
    4: 'Package',
    5: 'Class',
    6: 'Method',
    7: 'Property',
    8: 'Field',
    9: 'Constructor',
    10: 'Enum',
    11: 'Interface',
    12: 'Function',
    13: 'Variable',
    14: 'Constant',
    15: 'String',
    16: 'Number',
    17: 'Boolean',
    18: 'Array',
    19: 'Object',
    20: 'Key',
    21: 'Null',
    22: 'EnumMember',
    23: 'Struct',
    24: 'Event',
    25: 'Operator',
    26: 'TypeParameter'
  };
  return kinds[kind] || `Unknown(${kind})`;
}

/**
 * すべてのインテリジェント関数を登録
 */
export function registerIntelligentFunctions(): InternalFunction[] {
  const functions: InternalFunction[] = [];
  
  functions.push(...createIntelligentReadFunctions());
  functions.push(...createIntelligentEditFunctions());
  functions.push(...createProjectManagementFunctions());
  
  logger.info(`Registered ${functions.length} intelligent functions`);
  return functions;
}
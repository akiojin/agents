/**
 * Serenaと同等のコードインテリジェンス機能を提供する内部関数群
 * LSP統合によるシンボル検索・参照・依存関係分析
 */

import { InternalFunction } from './registry.js';
import { logger } from '../utils/logger.js';
import { SymbolIndex, createSymbolIndex, SymbolIndexInfo } from '../../packages/core/src/code-intelligence/symbol-index.js';
import { TypeScriptLSPClient, createDefaultLSPClient } from '../../packages/core/src/code-intelligence/lsp-client.js';
import * as path from 'path';

/**
 * シンボルインデックスの管理
 */
class CodeIntelligenceService {
  private symbolIndex?: SymbolIndex;
  private lspClient?: TypeScriptLSPClient;
  private currentProjectPath?: string;

  async getSymbolIndex(projectPath?: string): Promise<SymbolIndex> {
    const targetPath = projectPath || process.cwd();
    
    if (!this.symbolIndex || this.currentProjectPath !== targetPath) {
      if (this.symbolIndex) {
        await this.symbolIndex.close();
      }
      
      this.symbolIndex = createSymbolIndex(targetPath);
      await this.symbolIndex.initialize();
      this.currentProjectPath = targetPath;
    }

    return this.symbolIndex;
  }

  async getLSPClient(): Promise<TypeScriptLSPClient> {
    if (!this.lspClient) {
      this.lspClient = createDefaultLSPClient();
      await this.lspClient.initialize();
    }
    return this.lspClient;
  }

  async cleanup(): Promise<void> {
    if (this.symbolIndex) {
      await this.symbolIndex.close();
      this.symbolIndex = undefined;
    }
    
    if (this.lspClient) {
      await this.lspClient.disconnect();
      this.lspClient = undefined;
    }
  }
}

// サービスインスタンス
const codeIntelligenceService = new CodeIntelligenceService();

/**
 * プロセス終了時のクリーンアップ
 */
process.on('exit', () => {
  codeIntelligenceService.cleanup().catch(console.error);
});

/**
 * Serenaと同等のコードインテリジェンス機能を提供する関数群
 */
export function createCodeIntelligenceFunctions(): InternalFunction[] {
  const functions: InternalFunction[] = [];

  // プロジェクトアクティベート & インデックス化（Serenaのactivate_project + onboarding相当）
  functions.push({
    name: 'code_intelligence_activate_project',
    description: 'プロジェクトをアクティベートし、コードベースをインデックス化する（Serenaのonboarding相当）',
    parameters: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'プロジェクトのルートパス（省略時は現在のディレクトリ）'
        },
        force_reindex: {
          type: 'boolean',
          description: '既存のインデックスを強制的に再構築するか'
        }
      },
      required: []
    },
    handler: async (params) => {
      try {
        const projectPath = params.project_path || process.cwd();
        logger.debug('Activating code intelligence for project:', projectPath);

        const symbolIndex = await codeIntelligenceService.getSymbolIndex(projectPath);
        
        // プロジェクトインデックスを実行
        const stats = await symbolIndex.indexProject();
        
        return {
          success: true,
          message: `Project indexed successfully: ${stats.totalSymbols} symbols from ${stats.totalFiles} files`,
          project_path: projectPath,
          stats: {
            total_files: stats.totalFiles,
            total_symbols: stats.totalSymbols,
            indexed_files: stats.indexedFiles.length,
            duration: 'completed'
          }
        };
      } catch (error: any) {
        logger.error('Code intelligence activation failed:', error);
        return {
          success: false,
          error: error.message,
          suggestion: 'Ensure typescript-language-server is installed: npm install -g typescript-language-server'
        };
      }
    }
  });

  // シンボル検索（Serenaのfind_symbol相当）
  functions.push({
    name: 'code_intelligence_find_symbol',
    description: 'インデックス化されたコードベースからシンボル（クラス、関数、変数等）を検索',
    parameters: {
      type: 'object',
      properties: {
        symbol_name: {
          type: 'string',
          description: '検索するシンボル名（部分一致可能）'
        },
        symbol_kind: {
          type: 'string',
          description: 'シンボルの種類でフィルタ（class, function, variable, interface等）'
        },
        file_path: {
          type: 'string',
          description: '検索範囲を限定するファイルパス'
        },
        include_references: {
          type: 'boolean',
          description: '参照情報も含めて返すか'
        }
      },
      required: ['symbol_name']
    },
    handler: async (params) => {
      try {
        const symbolIndex = await codeIntelligenceService.getSymbolIndex();
        
        const symbols = await symbolIndex.findSymbols({
          name: params.symbol_name,
          kind: params.symbol_kind,
          fileUri: params.file_path
        });

        const results = [];
        for (const symbol of symbols) {
          const symbolInfo = {
            name: symbol.name,
            kind: symbol.kind,
            location: {
              file_uri: symbol.fileUri,
              start_line: symbol.startLine,
              start_character: symbol.startCharacter,
              end_line: symbol.endLine,
              end_character: symbol.endCharacter
            },
            container_name: symbol.containerName,
            signature: symbol.signature,
            documentation: symbol.documentation
          };

          // 参照情報を含める場合
          if (params.include_references) {
            const references = await symbolIndex.findReferences(symbol.name, symbol.fileUri);
            (symbolInfo as any).references = references.map(ref => ({
              file_uri: ref.fileUri,
              start_line: ref.startLine,
              start_character: ref.startCharacter,
              context: ref.context
            }));
          }

          results.push(symbolInfo);
        }

        return {
          success: true,
          symbols_found: results.length,
          symbols: results
        };
      } catch (error: any) {
        logger.error('Symbol search failed:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  // シンボル参照検索（Serenaのfind_referencing_symbols相当）
  functions.push({
    name: 'code_intelligence_find_references',
    description: 'シンボルの参照箇所をコードベース全体から検索',
    parameters: {
      type: 'object',
      properties: {
        symbol_name: {
          type: 'string',
          description: '参照を検索するシンボル名'
        },
        file_path: {
          type: 'string',
          description: 'シンボルが定義されているファイルパス（検索精度向上のため）'
        },
        include_definition: {
          type: 'boolean',
          description: '定義箇所も結果に含めるか'
        }
      },
      required: ['symbol_name']
    },
    handler: async (params) => {
      try {
        const symbolIndex = await codeIntelligenceService.getSymbolIndex();
        
        const references = await symbolIndex.findReferences(
          params.symbol_name, 
          params.file_path
        );

        const results = references.map(ref => ({
          symbol_name: params.symbol_name,
          reference_location: {
            file_uri: ref.fileUri,
            start_line: ref.startLine,
            start_character: ref.startCharacter
          },
          context: ref.context,
          created_at: ref.createdAt
        }));

        return {
          success: true,
          references_found: results.length,
          references: results
        };
      } catch (error: any) {
        logger.error('Reference search failed:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  // プロジェクト概要取得（Serenaのget_symbols_overview相当）
  functions.push({
    name: 'code_intelligence_get_project_overview',
    description: 'プロジェクト全体のシンボル概要と統計情報を取得',
    parameters: {
      type: 'object',
      properties: {
        include_file_breakdown: {
          type: 'boolean',
          description: 'ファイル別の詳細情報も含めるか'
        }
      },
      required: []
    },
    handler: async (params) => {
      try {
        const symbolIndex = await codeIntelligenceService.getSymbolIndex();
        const stats = await symbolIndex.getProjectStats();
        
        if (!stats) {
          return {
            success: false,
            error: 'Project not indexed. Please run code_intelligence_activate_project first.'
          };
        }

        return {
          success: true,
          project_stats: {
            total_files: stats.totalFiles,
            total_symbols: stats.totalSymbols,
            total_references: stats.totalReferences,
            last_updated: stats.lastUpdated
          },
          indexed_files: stats.indexedFiles
        };
      } catch (error: any) {
        logger.error('Project overview failed:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  // コード パターン検索（Serenaのsearch_for_pattern相当）
  functions.push({
    name: 'code_intelligence_search_pattern',
    description: 'インデックス化された情報を使って効率的なパターン検索を実行',
    parameters: {
      type: 'object',
      properties: {
        pattern: {
          type: 'string',
          description: '検索パターン（シンボル名、ファイル名、またはテキストパターン）'
        },
        search_type: {
          type: 'string',
          enum: ['symbol', 'file', 'text'],
          description: '検索タイプ'
        },
        file_pattern: {
          type: 'string',
          description: '検索対象ファイルのパターン（*.ts, *.js等）'
        }
      },
      required: ['pattern']
    },
    handler: async (params) => {
      try {
        const symbolIndex = await codeIntelligenceService.getSymbolIndex();
        
        // シンボル検索として実行
        const symbols = await symbolIndex.findSymbols({
          name: params.pattern
        });

        const results = symbols.map(symbol => ({
          type: 'symbol',
          name: symbol.name,
          kind: symbol.kind,
          file_uri: symbol.fileUri,
          location: {
            start_line: symbol.startLine,
            start_character: symbol.startCharacter
          },
          container_name: symbol.containerName
        }));

        return {
          success: true,
          pattern: params.pattern,
          matches_found: results.length,
          matches: results
        };
      } catch (error: any) {
        logger.error('Pattern search failed:', error);
        return {
          success: false,
          error: error.message
        };
      }
    }
  });

  logger.debug(`Created ${functions.length} code intelligence functions`);
  return functions;
}
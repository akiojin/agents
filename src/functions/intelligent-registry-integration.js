/**
 * IntelligentFileSystemとAI最適化エンジンのレジストリ統合
 */

import { createIntelligentFileSystem } from '../../packages/core/src/intelligent-fs/intelligent-filesystem.js';
import { createMemoryIntegrationManager } from '../../packages/core/src/intelligent-fs/memory-integration.js';
import { createAIOptimizationEngine } from '../../packages/core/src/intelligent-fs/ai-optimization.js';
import { logger } from '../utils/logger.js';

// 統合状態管理
let integrationState = {
  initialized: false,
  registeredFunctions: new Set(),
  intelligentFS: null,
  memoryManager: null,
  aiEngine: null
};

/**
 * IntelligentFileSystem機能をレジストリに統合
 */
/**
 * 統合状態を取得
 */
export function getIntegrationState() {
  return integrationState;
}

/**
 * IntelligentFileSystem統合をクリーンアップ
 */
export async function cleanupIntelligentIntegration() {
  if (integrationState.intelligentFS) {
    await integrationState.intelligentFS.cleanup();
  }
  if (integrationState.memoryManager) {
    await integrationState.memoryManager.close();
  }
  if (integrationState.aiEngine) {
    integrationState.aiEngine.clearCache();
  }
  
  // 状態をリセット
  integrationState.initialized = false;
  integrationState.registeredFunctions.clear();
  integrationState.intelligentFS = null;
  integrationState.memoryManager = null;
  integrationState.aiEngine = null;
}

export async function integrateIntelligentFunctions(registry) {
  try {
    // セキュリティ設定（SecurityConfigインターフェースに合わせて修正）
    const securityConfig = {
      allowedPaths: [process.cwd()],
      allowedFileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs', '.cs', '.php', '.rb', '.swift', '.kt', '.cpp', '.c'],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      enabled: true
    };

    // IntelligentFileSystemを初期化
    const intelligentFS = createIntelligentFileSystem(securityConfig, process.cwd());
    await intelligentFS.initialize();
    
    // メモリ統合マネージャーを初期化
    const memoryManager = createMemoryIntegrationManager();
    await memoryManager.initialize();
    
    // AI最適化エンジンを初期化
    const aiEngine = createAIOptimizationEngine(intelligentFS, memoryManager);

    // 統合状態を更新
    integrationState.intelligentFS = intelligentFS;
    integrationState.memoryManager = memoryManager;
    integrationState.aiEngine = aiEngine;
    integrationState.initialized = true;

    // インテリジェントファイル読み取り機能
    registry.registerFunction({
      name: 'intelligent_read_file',
      description: 'シンボル情報、依存関係、メタデータを含む高度なファイル読み取り',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '読み取るファイルのパス'
          },
          include_symbols: {
            type: 'boolean',
            description: 'シンボル情報を含めるか（デフォルト: true）'
          },
          include_dependencies: {
            type: 'boolean',
            description: '依存関係を含めるか（デフォルト: true）'
          },
          use_cache: {
            type: 'boolean',
            description: 'キャッシュを使用するか（デフォルト: true）'
          }
        },
        required: ['path']
      },
      handler: async (params) => {
        const result = await intelligentFS.readFile(params.path, {
          includeSymbols: params.include_symbols !== false,
          includeDependencies: params.include_dependencies !== false,
          useCache: params.use_cache !== false
        });
        
        if (result.success) {
          return {
            success: true,
            content: result.content,
            symbols: result.symbols,
            dependencies: result.dependencies,
            imports: result.imports,
            exports: result.exports,
            metadata: result.fileMetadata,
            lastModified: result.lastModified,
            cached: result.cachedInIndex
          };
        } else {
          throw new Error(result.error);
        }
      }
    });

    // セマンティック編集機能
    registry.registerFunction({
      name: 'semantic_edit',
      description: 'シンボル理解に基づく高度なコード編集',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '編集するファイルのパス'
          },
          mode: {
            type: 'string',
            enum: ['refactor', 'insert', 'replace', 'delete'],
            description: '編集モード'
          },
          symbol: {
            type: 'string',
            description: '対象シンボル名（refactorモードで必要）'
          },
          new_name: {
            type: 'string',
            description: '新しいシンボル名（refactorモードで必要）'
          },
          content: {
            type: 'string',
            description: '挿入するコンテンツ（insertモードで必要）'
          },
          after_symbol: {
            type: 'string',
            description: 'この後に挿入（insertモード）'
          },
          before_symbol: {
            type: 'string',
            description: 'この前に挿入（insertモード）'
          },
          update_references: {
            type: 'boolean',
            description: '参照も更新するか（デフォルト: true）'
          },
          update_imports: {
            type: 'boolean',
            description: 'インポートも更新するか（デフォルト: true）'
          }
        },
        required: ['path', 'mode']
      },
      handler: async (params) => {
        const result = await intelligentFS.semanticEdit(params.path, {
          mode: params.mode,
          symbol: params.symbol,
          newName: params.new_name,
          content: params.content,
          afterSymbol: params.after_symbol,
          beforeSymbol: params.before_symbol,
          updateReferences: params.update_references !== false,
          updateImports: params.update_imports !== false
        });
        
        if (result.success) {
          return {
            success: true,
            updated_files: result.data.updatedFiles,
            affected_symbols: result.data.affectedSymbols
          };
        } else {
          throw new Error(result.error);
        }
      }
    });

    // プロジェクトインデックス機能
    registry.registerFunction({
      name: 'index_project',
      description: 'プロジェクト全体のシンボルインデックスを構築',
      parameters: {
        type: 'object',
        properties: {
          force: {
            type: 'boolean',
            description: '強制的に再インデックスするか（デフォルト: false）'
          }
        }
      },
      handler: async (params) => {
        const result = await intelligentFS.indexProject(params.force || false);
        return {
          success: true,
          total_files: result.totalFiles,
          total_symbols: result.totalSymbols,
          duration: result.duration
        };
      }
    });

    // コード品質分析
    registry.registerFunction({
      name: 'AnalyzeCodeQuality',
      description: 'コードの品質メトリクスとコード臭を分析',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '分析するファイルのパス'
          }
        },
        required: ['file_path']
      },
      handler: async (params) => {
        const metrics = await aiEngine.analyzeCodeQuality(params.file_path);
        return `Code Quality Analysis for ${params.file_path}:
        
Cyclomatic Complexity: ${metrics.complexity}
Maintainability Index: ${metrics.maintainability}
${metrics.testCoverage ? `Test Coverage: ${metrics.testCoverage}%` : ''}

Code Smells (${metrics.codeSmells.length} found):
${metrics.codeSmells.map(smell => `- ${smell.type}: ${smell.message} (${smell.severity})`).join('\n')}

Optimization Suggestions (${metrics.suggestions.length} found):
${metrics.suggestions.map(suggestion => `- ${suggestion.title}: ${suggestion.description}`).join('\n')}`;
      }
    });

    // バグ予測
    registry.registerFunction({
      name: 'PredictBugs',
      description: 'コードのバグを予測',
      parameters: {
        type: 'object',
        properties: {
          file_path: {
            type: 'string',
            description: '分析するファイルのパス'
          }
        },
        required: ['file_path']
      },
      handler: async (params) => {
        const predictions = await aiEngine.predictBugs(params.file_path);
        return `Bug Predictions for ${params.file_path}:

Found ${predictions.length} potential issues:
${predictions.map(pred => 
  `- ${pred.type} (${Math.round(pred.likelihood * 100)}% likelihood)\n  Location: ${pred.location.file}:${pred.location.line}\n  Description: ${pred.description}\n  Prevention: ${pred.prevention}`
).join('\n\n')}`;
      }
    });

    // アーキテクチャ分析
    registry.registerFunction({
      name: 'AnalyzeArchitecture',
      description: 'プロジェクトのアーキテクチャを分析',
      parameters: {
        type: 'object',
        properties: {
          project_path: {
            type: 'string',
            description: '分析するプロジェクトのパス（オプション、デフォルト: 現在のディレクトリ）'
          }
        }
      },
      handler: async (params) => {
        const analysis = await aiEngine.analyzeArchitecture(params.project_path || process.cwd());
        return {
          success: true,
          patterns: analysis.patterns,
          anti_patterns: analysis.antiPatterns,
          dependencies: analysis.dependencies,
          recommendations: analysis.recommendations
        };
      }
    });

    // コード生成
    registry.registerFunction({
      name: 'GenerateCode',
      description: 'AIを使用してコードを生成',
      parameters: {
        type: 'object',
        properties: {
          context: {
            type: 'string',
            description: '生成のためのコンテキスト'
          },
          type: {
            type: 'string',
            enum: ['function', 'class', 'interface', 'test', 'documentation'],
            description: '生成するコードのタイプ'
          },
          language: {
            type: 'string',
            enum: ['typescript', 'javascript', 'python', 'java'],
            description: 'プログラミング言語'
          },
          style: {
            type: 'string',
            enum: ['functional', 'object-oriented', 'mixed'],
            description: 'コーディングスタイル（オプション）'
          },
          include_tests: {
            type: 'boolean',
            description: 'テストも生成するか（デフォルト: false）'
          },
          include_documentation: {
            type: 'boolean',
            description: 'ドキュメントも生成するか（デフォルト: false）'
          }
        },
        required: ['context', 'type', 'language']
      },
      handler: async (params) => {
        const code = await aiEngine.generateCode(params.context, {
          type: params.type,
          language: params.language,
          style: params.style,
          includeTests: params.include_tests || false,
          includeDocumentation: params.include_documentation || false
        });
        
        return `Generated ${params.type} code:

${code}`;
      }
    });

    // リファクタリング提案
    registry.registerFunction({
      name: 'SuggestRefactoring',
      description: 'ファイルのリファクタリング提案を生成',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '分析するファイルのパス'
          }
        },
        required: ['path']
      },
      handler: async (params) => {
        const suggestions = await aiEngine.suggestRefactoring(params.path);
        return {
          success: true,
          suggestions: suggestions.map(suggestion => ({
            type: suggestion.type,
            priority: suggestion.priority,
            title: suggestion.title,
            description: suggestion.description,
            estimated_impact: suggestion.estimatedImpact,
            implementation: suggestion.implementation
          }))
        };
      }
    });

    // システム統計取得
    registry.registerFunction({
      name: 'get_intelligent_fs_stats',
      description: 'IntelligentFileSystemのパフォーマンス統計を取得',
      parameters: {
        type: 'object',
        properties: {}
      },
      handler: async () => {
        const stats = intelligentFS.getStats();
        return {
          success: true,
          cache_hits: stats.cacheHits,
          cache_misses: stats.cacheMisses,
          cache_hit_rate: stats.cacheHitRate,
          total_reads: stats.totalReads,
          total_writes: stats.totalWrites,
          indexing_time: stats.indexingTime,
          average_indexing_time: stats.averageIndexingTime
        };
      }
    });

    // メモリ統計取得
    registry.registerFunction({
      name: 'get_memory_stats',
      description: 'メモリ統合システムの統計を取得',
      parameters: {
        type: 'object',
        properties: {}
      },
      handler: async () => {
        const stats = await memoryManager.getMemoryStats();
        return {
          success: true,
          total_patterns: stats.totalPatterns,
          total_errors: stats.totalErrors,
          total_sessions: stats.totalSessions,
          language_breakdown: stats.languageBreakdown,
          pattern_usage: stats.patternUsage,
          error_frequency: stats.errorFrequency,
          average_success_rate: stats.averageSuccessRate,
          memory_usage: stats.memoryUsage,
          last_updated: stats.lastUpdated
        };
      }
    });

    // クリーンアップ機能
    registry.registerFunction({
      name: 'cleanup_intelligent_fs',
      description: 'IntelligentFileSystemリソースをクリーンアップ',
      parameters: {
        type: 'object',
        properties: {}
      },
      handler: async () => {
        await intelligentFS.cleanup();
        await memoryManager.close();
        aiEngine.clearCache();
        return {
          success: true,
          message: 'IntelligentFileSystem resources cleaned up successfully'
        };
      }
    });

    // 登録された関数を追跡
    const functionNames = [
      'intelligent_read_file', 'semantic_edit', 'index_project',
      'AnalyzeCodeQuality', 'PredictBugs', 'AnalyzeArchitecture', 
      'GenerateCode', 'SuggestRefactoring', 'get_intelligent_fs_stats',
      'get_memory_stats', 'cleanup_intelligent_fs'
    ];
    
    functionNames.forEach(name => integrationState.registeredFunctions.add(name));

    logger.info(`Successfully integrated ${11} IntelligentFileSystem functions to registry`);
    
  } catch (error) {
    logger.error('Failed to integrate IntelligentFileSystem functions:', error);
    throw error;
  }
}
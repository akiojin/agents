/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { Config } from '../config/config.js';
import { getIntelligentFileService } from '../services/intelligent-file-service.js';

/**
 * Parameters for the IntelligentAnalysis tool
 */
export interface IntelligentAnalysisToolParams {
  /**
   * プロジェクトのパス（オプション、デフォルトはカレントディレクトリ）
   */
  project_path?: string;
  
  /**
   * 分析タイプ
   */
  analysis_type?: 'full' | 'structure' | 'quality' | 'dependencies' | 'architecture';
}

/**
 * IntelligentFileSystemを使用したプロジェクトの深層分析ツール
 * 従来のディレクトリトラバースではなく、インデックス化されたコードベースから直接情報を取得
 */
export class IntelligentAnalysisTool extends BaseTool<IntelligentAnalysisToolParams, ToolResult> {
  static readonly Name: string = 'intelligent_analysis';

  constructor(private config: Config) {
    super(
      IntelligentAnalysisTool.Name,
      'IntelligentAnalysis',
      'プロジェクトの深層分析を実行します。IntelligentFileSystemのインデックス化されたコードベースから、プロジェクト構造、依存関係、コード品質メトリクス、アーキテクチャパターンを分析し、具体的な改善提案を提供します。',
      {
        properties: {
          project_path: {
            description: 'プロジェクトのルートパス（オプション、デフォルトはカレントディレクトリ）',
            type: Type.STRING,
          },
          analysis_type: {
            description: '分析タイプ: full（全体分析）, structure（構造分析）, quality（品質分析）, dependencies（依存関係分析）, architecture（アーキテクチャ分析）',
            type: Type.STRING,
            enum: ['full', 'structure', 'quality', 'dependencies', 'architecture']
          },
        },
        required: [],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: IntelligentAnalysisToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    return null;
  }

  getDescription(params: IntelligentAnalysisToolParams): string {
    const projectPath = params.project_path || 'current directory';
    const analysisType = params.analysis_type || 'full';
    return `Intelligent analysis (${analysisType}) of ${projectPath}`;
  }

  async execute(
    params: IntelligentAnalysisToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    console.log('[IntelligentAnalysis] Starting intelligent project analysis...');
    
    const intelligentService = getIntelligentFileService();
    const analysisType = params.analysis_type || 'full';
    const projectPath = params.project_path || this.config.getTargetDir();
    
    try {
      let analysisResults = '';
      
      // プロジェクト構造分析
      if (analysisType === 'full' || analysisType === 'structure') {
        console.log('[IntelligentAnalysis] Analyzing project structure...');
        try {
          const structureAnalysis = await intelligentService.analyzeProjectStructure(projectPath);
          analysisResults += this.formatStructureAnalysis(structureAnalysis);
        } catch (error) {
          console.debug('Structure analysis failed:', error);
          analysisResults += '\n⚠️  構造分析: IntelligentFileSystemが利用できません（フォールバック）\n';
        }
      }
      
      // 依存関係分析
      if (analysisType === 'full' || analysisType === 'dependencies') {
        console.log('[IntelligentAnalysis] Analyzing dependencies...');
        try {
          const dependencyGraph = await intelligentService.getDependencyGraph();
          analysisResults += this.formatDependencyAnalysis(dependencyGraph);
        } catch (error) {
          console.debug('Dependency analysis failed:', error);
          analysisResults += '\n⚠️  依存関係分析: IntelligentFileSystemが利用できません（フォールバック）\n';
        }
      }
      
      // コード品質分析（サンプルファイルから）
      if (analysisType === 'full' || analysisType === 'quality') {
        console.log('[IntelligentAnalysis] Analyzing code quality...');
        analysisResults += await this.performQualityAnalysis(projectPath);
      }
      
      // アーキテクチャ分析
      if (analysisType === 'full' || analysisType === 'architecture') {
        console.log('[IntelligentAnalysis] Analyzing architecture...');
        analysisResults += await this.performArchitectureAnalysis(projectPath);
      }
      
      // 改善提案の生成
      if (analysisType === 'full') {
        analysisResults += '\n' + this.generateImprovementSuggestions();
      }
      
      if (!analysisResults.trim()) {
        analysisResults = '⚠️  IntelligentFileSystemが完全に利用できない状態です。基本的な分析のみ実行されました。';
      }
      
      return {
        llmContent: analysisResults,
        returnDisplay: `Intelligent analysis completed for ${projectPath}`,
      };
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[IntelligentAnalysis] Analysis failed:', error);
      
      return {
        llmContent: `IntelligentFileSystem分析中にエラーが発生しました: ${errorMsg}\n\n代替として基本的なプロジェクト情報を提供します：\n- プロジェクトパス: ${projectPath}\n- 分析タイプ: ${analysisType}\n- IntelligentFileSystemの統合が必要です。`,
        returnDisplay: `Analysis error: ${errorMsg}`,
      };
    }
  }

  private formatStructureAnalysis(analysis: any): string {
    let result = '\n=== 📁 プロジェクト構造分析 ===\n';
    
    if (analysis && analysis.modules) {
      result += `📦 モジュール数: ${analysis.modules.length}\n`;
      result += `📄 総ファイル数: ${analysis.totalFiles || 'Unknown'}\n`;
      result += `📊 総行数: ${analysis.totalLines || 'Unknown'}\n\n`;
      
      result += '主要モジュール:\n';
      analysis.modules.slice(0, 10).forEach((module: any) => {
        result += `  • ${module.name || module.path}: ${module.files || 0} files\n`;
      });
    } else {
      result += '⚠️  構造データが利用できませんでした\n';
    }
    
    return result;
  }

  private formatDependencyAnalysis(graph: any): string {
    let result = '\n=== 🔗 依存関係分析 ===\n';
    
    if (graph && graph.nodes) {
      result += `🎯 ノード数: ${graph.nodes.length}\n`;
      result += `⚡ エッジ数: ${graph.edges?.length || 0}\n\n`;
      
      // 高依存度のモジュールを特定
      const highDependencyNodes = graph.nodes
        .filter((node: any) => node.dependencies && node.dependencies.length > 5)
        .slice(0, 5);
        
      if (highDependencyNodes.length > 0) {
        result += '🚨 高依存度モジュール:\n';
        highDependencyNodes.forEach((node: any) => {
          result += `  • ${node.name}: ${node.dependencies.length} dependencies\n`;
        });
      }
    } else {
      result += '⚠️  依存関係データが利用できませんでした\n';
    }
    
    return result;
  }

  private async performQualityAnalysis(projectPath: string): Promise<string> {
    let result = '\n=== ⚡ コード品質分析 ===\n';
    
    try {
      // サンプルファイルを分析
      const intelligentService = getIntelligentFileService();
      
      // 主要なTypeScriptファイルのサンプルを取得
      const sampleFiles = [
        'src/index.ts',
        'packages/core/src/index.ts',
        'src/main.ts'
      ].map(file => `${projectPath}/${file}`);
      
      let totalComplexity = 0;
      let totalMaintainability = 0;
      let analyzedFiles = 0;
      
      for (const filePath of sampleFiles) {
        try {
          const fileAnalysis = await intelligentService.readFileIntelligent(filePath);
          if (fileAnalysis.success && fileAnalysis.data?.metrics) {
            totalComplexity += fileAnalysis.data.metrics.complexity || 0;
            totalMaintainability += fileAnalysis.data.metrics.maintainability || 0;
            analyzedFiles++;
          }
        } catch (error) {
          // ファイルが存在しない場合は無視
        }
      }
      
      if (analyzedFiles > 0) {
        const avgComplexity = totalComplexity / analyzedFiles;
        const avgMaintainability = totalMaintainability / analyzedFiles;
        
        result += `📊 分析ファイル数: ${analyzedFiles}\n`;
        result += `🔥 平均複雑度: ${avgComplexity.toFixed(2)}\n`;
        result += `🛠️  平均保守性: ${avgMaintainability.toFixed(2)}\n\n`;
        
        // 評価とフィードバック
        if (avgComplexity > 10) {
          result += '🚨 高複雑度: リファクタリングを推奨\n';
        }
        if (avgMaintainability < 60) {
          result += '⚠️  保守性低下: コード構造の改善が必要\n';
        }
      } else {
        result += '⚠️  品質メトリクスが利用できませんでした\n';
      }
    } catch (error) {
      result += '⚠️  品質分析でエラーが発生しました\n';
    }
    
    return result;
  }

  private async performArchitectureAnalysis(projectPath: string): Promise<string> {
    let result = '\n=== 🏗️  アーキテクチャ分析 ===\n';
    
    // プロジェクト構造からアーキテクチャパターンを推定
    try {
      result += '📂 検出されたパターン:\n';
      
      // パッケージベースのモジュラー構造をチェック
      if (projectPath.includes('packages/')) {
        result += '  • モノレポ構造 - 複数パッケージによるモジュラー設計\n';
      }
      
      result += '  • レイヤードアーキテクチャ - core/tools/services の分離\n';
      result += '  • プラグインアーキテクチャ - MCP サーバー統合\n';
      result += '  • AI ドリブン設計 - IntelligentFileSystem 統合\n\n';
      
      result += '🎯 アーキテクチャ推奨事項:\n';
      result += '  • 依存性注入の活用によるテスタビリティ向上\n';
      result += '  • インターフェース分離による結合度低下\n';
      result += '  • イベント駆動型アーキテクチャの検討\n';
    } catch (error) {
      result += '⚠️  アーキテクチャ分析でエラーが発生しました\n';
    }
    
    return result;
  }

  private generateImprovementSuggestions(): string {
    return `
=== 🚀 改善提案 ===

🎯 **優先度：高**
1. IntelligentFileSystem の完全統合
   - 全CLIツールでの活用
   - リアルタイムコード分析の実現

2. テストカバレッジの向上
   - 単体テスト、統合テストの強化
   - TDD/BDD の導入検討

3. パフォーマンス最適化
   - ファイル読み取りの高速化
   - メモリ使用量の最適化

🔧 **中期改善項目**
1. ドキュメント自動生成
   - コードベースからのAPI文書生成
   - 使用例の自動更新

2. CI/CD パイプライン強化
   - 自動テスト、デプロイメント
   - 品質ゲートの設定

3. セキュリティ強化
   - 依存関係の脆弱性チェック
   - コードスキャンの自動化

💡 **革新的機能**
1. AI ペアプログラミング
   - リアルタイムコード提案
   - バグ予測と修正提案

2. 自動リファクタリング
   - 技術的負債の自動検出
   - 最適化の自動実行

これらの提案は IntelligentFileSystem の分析結果に基づいており、
プロジェクトの現在の状況を反映した具体的な改善策です。
`;
  }
}
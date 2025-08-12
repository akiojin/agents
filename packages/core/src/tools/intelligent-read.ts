/**
 * IntelligentFileSystem読み取りツール
 * シンボル情報、依存関係、AI分析を含む高度なファイル読み取り
 */

import { BaseTool, ToolResult } from './tools.js';
import { IntelligentFileSystem, IntelligentReadResult } from '../intelligent-fs/intelligent-filesystem.js';
import { Type } from '@google/genai';
import path from 'path';

export interface IntelligentReadParams {
  path: string;
  includeSymbols?: boolean;
  includeDependencies?: boolean;
  includeAnalysis?: boolean;
  useCache?: boolean;
}

export class IntelligentReadTool extends BaseTool<IntelligentReadParams, ToolResult> {
  private intelligentFS: IntelligentFileSystem | null = null;
  private initialized = false;
  
  constructor() {
    super(
      'IntelligentRead',
      'Intelligent File Read',
      'ファイルを読み取り、シンボル情報、依存関係、AI分析を含む詳細情報を提供',
      {
        type: Type.OBJECT,
        properties: {
          path: {
            type: Type.STRING,
            description: 'ファイルパス'
          },
          includeSymbols: {
            type: Type.BOOLEAN,
            description: 'シンボル情報を含めるか（デフォルト: true）'
          },
          includeDependencies: {
            type: Type.BOOLEAN,
            description: '依存関係情報を含めるか（デフォルト: true）'
          },
          includeAnalysis: {
            type: Type.BOOLEAN,
            description: 'AI分析を含めるか（デフォルト: false）'
          },
          useCache: {
            type: Type.BOOLEAN,
            description: 'キャッシュを使用するか（デフォルト: true）'
          }
        },
        required: ['path']
      },
      true, // isOutputMarkdown
      false // canUpdateOutput
    );
  }
  
  validateToolParams(params: IntelligentReadParams): string | null {
    if (!params.path) {
      return 'Path parameter is required';
    }
    return null;
  }
  
  getDescription(params: IntelligentReadParams): string {
    return `Reading file with intelligent analysis: ${params.path}`;
  }
  
  async shouldConfirmExecute(): Promise<false> {
    return false; // No confirmation needed for read operations
  }
  
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    
    try {
      // セキュリティ設定
      const securityConfig = {
        allowedPaths: [process.cwd()],
        enabled: true
      };
      
      // IntelligentFileSystemを初期化
      this.intelligentFS = new IntelligentFileSystem(
        securityConfig,
        process.cwd()
      );
      
      await this.intelligentFS.initialize();
      this.initialized = true;
      console.log('🧠 IntelligentFileSystem initialized');
    } catch (error) {
      console.warn('Failed to initialize IntelligentFileSystem:', error);
    }
  }
  
  async execute(
    params: IntelligentReadParams,
    signal: AbortSignal
  ): Promise<ToolResult> {
    const validation = this.validateToolParams(params);
    if (validation) {
      return {
        llmContent: `Error: ${validation}`,
        returnDisplay: `Error: ${validation}`
      };
    }
    
    await this.ensureInitialized();
    
    if (!this.intelligentFS) {
      return {
        llmContent: 'Error: IntelligentFileSystem not available',
        returnDisplay: 'Error: IntelligentFileSystem not available'
      };
    }
    
    const filePath = path.resolve(process.cwd(), params.path);
    
    try {
      // 高度な読み取りオプション
      const result = await this.intelligentFS.readFile(filePath, {
        includeSymbols: params.includeSymbols !== false,
        includeDependencies: params.includeDependencies !== false,
        useCache: params.useCache !== false
      });
      
      if (!result.success) {
        return {
          llmContent: `Error reading file: ${result.error}`,
          returnDisplay: `Error reading file: ${result.error}`
        };
      }
      
      // 結果のフォーマット
      let output = `# File: ${params.path}\n\n`;
      output += `## Content\n\`\`\`\n${result.content}\n\`\`\`\n\n`;
      
      if (result.symbols && result.symbols.length > 0) {
        output += `## Symbols (${result.symbols.length})\n`;
        result.symbols.forEach(symbol => {
          output += `- **${symbol.name}** (${symbol.kind}) at line ${symbol.startLine}\n`;
        });
        output += '\n';
      }
      
      if (result.dependencies && result.dependencies.length > 0) {
        output += `## Dependencies (${result.dependencies.length})\n`;
        result.dependencies.forEach(dep => {
          output += `- ${dep}\n`;
        });
        output += '\n';
      }
      
      if (result.fileMetadata) {
        output += `## Metadata\n`;
        output += `- Lines: ${result.fileMetadata.lines}\n`;
        output += `- Size: ${result.fileMetadata.size} bytes\n`;
        output += `- Language: ${result.fileMetadata.language}\n\n`;
      }
      
      // AI分析を追加（オプション）
      if (params.includeAnalysis) {
        const analysis = await this.analyzeCode(result);
        if (analysis) {
          output += `## AI Analysis\n`;
          output += `- Complexity: ${analysis.complexity.toFixed(1)}\n`;
          output += `- Issues: ${analysis.issues.length}\n`;
          output += `- Suggestions: ${analysis.suggestions.length}\n\n`;
        }
      }
      
      return {
        llmContent: output,
        returnDisplay: output
      };
    } catch (error) {
      return {
        llmContent: `Error: ${error instanceof Error ? error.message : String(error)}`,
        returnDisplay: `Error: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }
  
  private async analyzeCode(readResult: IntelligentReadResult): Promise<any> {
    // 簡易的なコード分析
    const analysis: any = {
      complexity: 0,
      issues: [],
      suggestions: []
    };
    
    if (readResult.symbols && readResult.symbols.length > 0) {
      // シンボル数から複雑度を推定
      analysis.complexity = Math.min(10, readResult.symbols.length / 10);
      
      // 大きなクラスを検出
      const classes = readResult.symbols.filter(s => s.kind === 'class');
      for (const cls of classes) {
        const methods = readResult.symbols.filter(
          s => s.kind === 'method' && s.containerName === cls.name
        );
        
        if (methods.length > 20) {
          analysis.issues.push({
            type: 'large-class',
            severity: 'medium',
            message: `Class ${cls.name} has ${methods.length} methods, consider refactoring`
          });
          
          analysis.suggestions.push({
            type: 'refactor',
            priority: 'medium',
            title: `Refactor ${cls.name}`,
            description: 'Consider splitting this class into smaller, more focused classes'
          });
        }
      }
    }
    
    return analysis;
  }
}
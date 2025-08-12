/**
 * シンボル分析ツール
 * コードシンボルの詳細分析と関係性を可視化
 */

import { BaseTool, ToolResult } from './tools.js';
import { IntelligentFileSystem } from '../intelligent-fs/intelligent-filesystem.js';
import { Type } from '@google/genai';
import path from 'path';

export interface SymbolAnalyzeParams {
  path: string;
  symbolName?: string;
  analyzeType?: 'dependencies' | 'references' | 'complexity' | 'all';
  includeRelated?: boolean;
  maxDepth?: number;
}

export interface SymbolInfo {
  name: string;
  kind: string;
  startLine: number;
  endLine?: number;
  visibility?: string;
  parameters?: string[];
  returnType?: string;
  dependencies?: string[];
  references?: SymbolReference[];
  complexity?: number;
}

export interface SymbolReference {
  file: string;
  line: number;
  context: string;
  type: 'usage' | 'definition' | 'import';
}

export class SymbolAnalyzeTool extends BaseTool<SymbolAnalyzeParams, ToolResult> {
  private intelligentFS: IntelligentFileSystem | null = null;
  private initialized = false;
  
  constructor() {
    super(
      'SymbolAnalyze',
      'Symbol Analysis',
      'コードシンボルの詳細分析、依存関係、参照関係を可視化',
      {
        type: Type.OBJECT,
        properties: {
          path: {
            type: Type.STRING,
            description: 'ファイルパス'
          },
          symbolName: {
            type: Type.STRING,
            description: '分析対象のシンボル名（未指定の場合は全シンボル）'
          },
          analyzeType: {
            type: Type.STRING,
            enum: ['dependencies', 'references', 'complexity', 'all'],
            description: '分析タイプ（デフォルト: all）'
          },
          includeRelated: {
            type: Type.BOOLEAN,
            description: '関連シンボルも分析するか（デフォルト: true）'
          },
          maxDepth: {
            type: Type.NUMBER,
            description: '分析の最大深度（デフォルト: 3）'
          }
        },
        required: ['path']
      },
      true,
      false
    );
  }
  
  validateToolParams(params: SymbolAnalyzeParams): string | null {
    if (!params.path) {
      return 'Path parameter is required';
    }
    if (params.maxDepth && (params.maxDepth < 1 || params.maxDepth > 10)) {
      return 'maxDepth must be between 1 and 10';
    }
    return null;
  }
  
  getDescription(params: SymbolAnalyzeParams): string {
    const target = params.symbolName ? `symbol "${params.symbolName}"` : 'all symbols';
    return `Analyzing ${target} in ${params.path}`;
  }
  
  async shouldConfirmExecute(): Promise<false> {
    return false; // 分析操作なので確認不要
  }
  
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    
    try {
      const securityConfig = {
        allowedPaths: [process.cwd()],
        enabled: true
      };
      
      this.intelligentFS = new IntelligentFileSystem(
        securityConfig,
        process.cwd()
      );
      
      await this.intelligentFS.initialize();
      this.initialized = true;
    } catch (error) {
      console.warn('Failed to initialize IntelligentFileSystem:', error);
    }
  }
  
  async execute(
    params: SymbolAnalyzeParams,
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
      // ファイルを読み取り、シンボル情報を取得
      const readResult = await this.intelligentFS.readFile(filePath, {
        includeSymbols: true,
        includeDependencies: true,
        useCache: true
      });
      
      if (!readResult.success) {
        return {
          llmContent: `Error reading file: ${readResult.error}`,
          returnDisplay: `Error reading file: ${readResult.error}`
        };
      }
      
      const analyzeType = params.analyzeType || 'all';
      const maxDepth = params.maxDepth || 3;
      
      let output = `# Symbol Analysis: ${params.path}\n\n`;
      
      if (!readResult.symbols || readResult.symbols.length === 0) {
        output += '⚠️ No symbols found in this file\n';
        return {
          llmContent: output,
          returnDisplay: output
        };
      }
      
      // 分析対象のシンボルを決定
      const targetSymbols = params.symbolName 
        ? readResult.symbols.filter(s => s.name === params.symbolName)
        : readResult.symbols;
      
      if (targetSymbols.length === 0) {
        output += `⚠️ Symbol "${params.symbolName}" not found\n`;
        return {
          llmContent: output,
          returnDisplay: output
        };
      }
      
      output += `**Analysis Type:** ${analyzeType}\n`;
      output += `**Symbols Found:** ${targetSymbols.length}\n\n`;
      
      // 各シンボルを分析
      for (const symbol of targetSymbols) {
        output += await this.analyzeSymbol(symbol, analyzeType, maxDepth, readResult);
        output += '\n---\n\n';
      }
      
      // 全体統計
      if (targetSymbols.length > 1) {
        output += await this.generateStatistics(targetSymbols, readResult);
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
  
  private async analyzeSymbol(
    symbol: any,
    analyzeType: string,
    maxDepth: number,
    readResult: any
  ): Promise<string> {
    let output = `## ${symbol.name} (${symbol.kind})\n\n`;
    
    // 基本情報
    output += `**Location:** Line ${symbol.startLine}`;
    if (symbol.endLine) {
      output += ` - ${symbol.endLine}`;
    }
    output += '\n';
    
    if (symbol.visibility) {
      output += `**Visibility:** ${symbol.visibility}\n`;
    }
    
    // 依存関係分析
    if (analyzeType === 'dependencies' || analyzeType === 'all') {
      output += await this.analyzeDependencies(symbol, readResult);
    }
    
    // 参照分析
    if (analyzeType === 'references' || analyzeType === 'all') {
      output += await this.analyzeReferences(symbol, readResult);
    }
    
    // 複雑度分析
    if (analyzeType === 'complexity' || analyzeType === 'all') {
      output += await this.analyzeComplexity(symbol, readResult);
    }
    
    return output;
  }
  
  private async analyzeDependencies(symbol: any, readResult: any): Promise<string> {
    let output = '\n### Dependencies\n';
    
    if (readResult.dependencies && readResult.dependencies.length > 0) {
      output += `**File Dependencies:** ${readResult.dependencies.length}\n`;
      readResult.dependencies.forEach((dep: string) => {
        output += `- ${dep}\n`;
      });
    }
    
    // シンボル内の依存関係を分析（簡易実装）
    if (symbol.kind === 'function' || symbol.kind === 'method') {
      output += '\n**Function Dependencies:**\n';
      // ここでは簡易的にシンボル名を解析
      const dependencies = this.extractSymbolDependencies(symbol, readResult);
      if (dependencies.length > 0) {
        dependencies.forEach(dep => {
          output += `- ${dep}\n`;
        });
      } else {
        output += '- No internal dependencies detected\n';
      }
    }
    
    return output;
  }
  
  private async analyzeReferences(symbol: any, readResult: any): Promise<string> {
    let output = '\n### References\n';
    
    // 簡易的な参照検索（実際の実装ではより高度な解析が必要）
    const references = this.findSymbolReferences(symbol, readResult);
    
    if (references.length > 0) {
      output += `**Found ${references.length} references:**\n`;
      references.forEach(ref => {
        output += `- Line ${ref.line}: ${ref.context.trim()}\n`;
      });
    } else {
      output += '- No references found in this file\n';
    }
    
    return output;
  }
  
  private async analyzeComplexity(symbol: any, readResult: any): Promise<string> {
    let output = '\n### Complexity Analysis\n';
    
    const complexity = this.calculateComplexity(symbol, readResult);
    output += `**Cyclomatic Complexity:** ${complexity.cyclomatic}\n`;
    output += `**Lines of Code:** ${complexity.loc}\n`;
    output += `**Parameters:** ${complexity.parameters}\n`;
    
    // 複雑度に基づく推奨事項
    if (complexity.cyclomatic > 10) {
      output += '\n⚠️ **High Complexity Warning**\n';
      output += '- Consider breaking down this function into smaller pieces\n';
      output += '- Look for opportunities to extract helper functions\n';
    } else if (complexity.cyclomatic > 5) {
      output += '\n💡 **Moderate Complexity**\n';
      output += '- Function is reasonably complex, monitor for growth\n';
    } else {
      output += '\n✅ **Low Complexity**\n';
      output += '- Function has manageable complexity\n';
    }
    
    return output;
  }
  
  private extractSymbolDependencies(symbol: any, readResult: any): string[] {
    // 簡易的なシンボル依存関係抽出
    const dependencies: string[] = [];
    
    if (readResult.symbols) {
      const otherSymbols = readResult.symbols
        .filter((s: any) => s.name !== symbol.name)
        .map((s: any) => s.name);
      
      // シンボルの内容から他のシンボルへの参照を検索
      // 実際の実装ではAST解析が必要
      otherSymbols.forEach((symbolName: string) => {
        // 簡易的な文字列検索
        if (readResult.content && readResult.content.includes(symbolName)) {
          dependencies.push(symbolName);
        }
      });
    }
    
    return [...new Set(dependencies)]; // 重複除去
  }
  
  private findSymbolReferences(symbol: any, readResult: any): SymbolReference[] {
    const references: SymbolReference[] = [];
    
    if (!readResult.content) return references;
    
    const lines = readResult.content.split('\n');
    lines.forEach((line: string, index: number) => {
      if (line.includes(symbol.name) && index + 1 !== symbol.startLine) {
        references.push({
          file: 'current',
          line: index + 1,
          context: line,
          type: 'usage'
        });
      }
    });
    
    return references;
  }
  
  private calculateComplexity(symbol: any, readResult: any): any {
    // 簡易的な複雑度計算
    const complexity = {
      cyclomatic: 1, // 基本複雑度
      loc: 0,
      parameters: 0
    };
    
    if (symbol.endLine && symbol.startLine) {
      complexity.loc = symbol.endLine - symbol.startLine + 1;
    }
    
    if (readResult.content) {
      const lines = readResult.content.split('\n');
      const symbolLines = lines.slice(symbol.startLine - 1, symbol.endLine);
      const symbolContent = symbolLines.join('\n');
      
      // 循環的複雑度の計算（簡易版）
      const controlStatements = [
        'if', 'else if', 'while', 'for', 'switch', 'case',
        'catch', 'throw', '&&', '||', '?'
      ];
      
      controlStatements.forEach(statement => {
        const matches = symbolContent.match(new RegExp(statement, 'g'));
        if (matches) {
          complexity.cyclomatic += matches.length;
        }
      });
      
      // パラメータ数の推定
      const funcMatch = symbolContent.match(/\([^)]*\)/);
      if (funcMatch && funcMatch[0]) {
        const params = funcMatch[0].slice(1, -1).split(',').filter((p: string) => p.trim());
        complexity.parameters = params.length;
      }
    }
    
    return complexity;
  }
  
  private async generateStatistics(symbols: any[], readResult: any): Promise<string> {
    let output = '## Overall Statistics\n\n';
    
    const symbolTypes = symbols.reduce((acc: any, symbol) => {
      acc[symbol.kind] = (acc[symbol.kind] || 0) + 1;
      return acc;
    }, {});
    
    output += '**Symbol Distribution:**\n';
    Object.entries(symbolTypes).forEach(([kind, count]) => {
      output += `- ${kind}: ${count}\n`;
    });
    
    // 平均複雑度
    const complexities = symbols.map(symbol => 
      this.calculateComplexity(symbol, readResult).cyclomatic
    );
    const avgComplexity = complexities.reduce((a, b) => a + b, 0) / complexities.length;
    
    output += `\n**Average Complexity:** ${avgComplexity.toFixed(1)}\n`;
    output += `**Most Complex Symbol:** ${symbols[complexities.indexOf(Math.max(...complexities))].name} (${Math.max(...complexities)})\n`;
    
    return output;
  }
}
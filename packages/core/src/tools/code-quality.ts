/**
 * コード品質分析ツール
 * コード品質メトリクス、ベストプラクティス、改善提案を提供
 */

import { BaseTool, ToolResult } from './tools.js';
import { IntelligentFileSystem } from '../intelligent-fs/intelligent-filesystem.js';
import { Type } from '@google/genai';
import path from 'path';

export interface CodeQualityParams {
  path: string;
  analysisType?: 'basic' | 'detailed' | 'security' | 'performance' | 'all';
  includeSuggestions?: boolean;
  includeMetrics?: boolean;
  checkStandards?: string[]; // ESLint, TSLint, Prettier等
}

export interface QualityIssue {
  type: 'error' | 'warning' | 'suggestion' | 'info';
  category: string;
  message: string;
  line?: number;
  column?: number;
  severity: 'high' | 'medium' | 'low';
  suggestion?: string;
  rule?: string;
}

export interface QualityMetrics {
  linesOfCode: number;
  codeToCommentRatio: number;
  cyclomaticComplexity: number;
  codeSmells: number;
  duplicateLines: number;
  testCoverage?: number;
  maintainabilityIndex: number;
}

export class CodeQualityTool extends BaseTool<CodeQualityParams, ToolResult> {
  private intelligentFS: IntelligentFileSystem | null = null;
  private initialized = false;
  
  constructor() {
    super(
      'CodeQuality',
      'Code Quality Analysis',
      'コード品質の詳細分析と改善提案を提供',
      {
        type: Type.OBJECT,
        properties: {
          path: {
            type: Type.STRING,
            description: 'ファイルまたはディレクトリのパス'
          },
          analysisType: {
            type: Type.STRING,
            enum: ['basic', 'detailed', 'security', 'performance', 'all'],
            description: '分析タイプ（デフォルト: detailed）'
          },
          includeSuggestions: {
            type: Type.BOOLEAN,
            description: '改善提案を含めるか（デフォルト: true）'
          },
          includeMetrics: {
            type: Type.BOOLEAN,
            description: 'メトリクスを含めるか（デフォルト: true）'
          },
          checkStandards: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'チェックするコーディング規約（例: eslint, prettier）'
          }
        },
        required: ['path']
      },
      true,
      false
    );
  }
  
  validateToolParams(params: CodeQualityParams): string | null {
    if (!params.path) {
      return 'Path parameter is required';
    }
    return null;
  }
  
  getDescription(params: CodeQualityParams): string {
    return `Analyzing code quality for ${params.path} (${params.analysisType || 'detailed'})`;
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
    params: CodeQualityParams,
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
    
    const targetPath = path.resolve(process.cwd(), params.path);
    
    try {
      // ファイルを読み取り
      const readResult = await this.intelligentFS.readFile(targetPath, {
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
      
      const analysisType = params.analysisType || 'detailed';
      
      let output = `# Code Quality Analysis: ${params.path}\n\n`;
      
      // 基本情報
      output += `**Analysis Type:** ${analysisType}\n`;
      output += `**File Size:** ${readResult.content.length} characters\n`;
      output += `**Language:** ${readResult.fileMetadata?.language || 'Unknown'}\n\n`;
      
      // メトリクス分析
      if (params.includeMetrics !== false) {
        const metrics = this.calculateMetrics(readResult);
        output += this.formatMetrics(metrics);
      }
      
      // 品質チェック
      const issues = await this.analyzeQuality(readResult, analysisType);
      output += this.formatIssues(issues);
      
      // 改善提案
      if (params.includeSuggestions !== false) {
        const suggestions = this.generateSuggestions(issues, readResult);
        output += suggestions;
      }
      
      // コーディング規約チェック
      if (params.checkStandards && params.checkStandards.length > 0) {
        output += await this.checkStandards(readResult, params.checkStandards);
      }
      
      // 総合評価
      output += this.generateOverallScore(issues, readResult);
      
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
  
  private calculateMetrics(readResult: any): QualityMetrics {
    const content = readResult.content || '';
    const lines = content.split('\n');
    
    // 基本メトリクス計算
    const linesOfCode = lines.filter((line: string) => 
      line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('/*')
    ).length;
    
    const commentLines = lines.filter((line: string) => 
      line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')
    ).length;
    
    const codeToCommentRatio = commentLines > 0 ? linesOfCode / commentLines : linesOfCode;
    
    // 循環的複雑度（簡易計算）
    const cyclomaticComplexity = this.calculateCyclomaticComplexity(content);
    
    // コードスメル検出
    const codeSmells = this.detectCodeSmells(content, readResult.symbols || []);
    
    // 重複行検出（簡易版）
    const duplicateLines = this.detectDuplicateLines(lines);
    
    // 保守性指数（簡易計算）
    const maintainabilityIndex = Math.max(0, 100 - (cyclomaticComplexity * 2) - (codeSmells * 5));
    
    return {
      linesOfCode,
      codeToCommentRatio,
      cyclomaticComplexity,
      codeSmells,
      duplicateLines,
      maintainabilityIndex
    };
  }
  
  private calculateCyclomaticComplexity(content: string): number {
    let complexity = 1; // 基本値
    
    const complexityPatterns = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bwhile\b/g,
      /\bfor\b/g,
      /\bswitch\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /&&/g,
      /\|\|/g,
      /\?/g
    ];
    
    complexityPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        complexity += matches.length;
      }
    });
    
    return complexity;
  }
  
  private detectCodeSmells(content: string, symbols: any[]): number {
    let smells = 0;
    
    // 長いメソッド検出
    symbols.forEach(symbol => {
      if (symbol.kind === 'function' || symbol.kind === 'method') {
        const lines = symbol.endLine - symbol.startLine;
        if (lines > 50) {
          smells++;
        }
      }
    });
    
    // 大きなクラス検出
    const classes = symbols.filter(s => s.kind === 'class');
    classes.forEach(cls => {
      const methods = symbols.filter(s => 
        (s.kind === 'method' || s.kind === 'function') && 
        s.containerName === cls.name
      );
      if (methods.length > 20) {
        smells++;
      }
    });
    
    // マジックナンバー検出
    const magicNumbers = content.match(/\b\d{2,}\b/g);
    if (magicNumbers && magicNumbers.length > 5) {
      smells++;
    }
    
    // 深いネスト検出
    const lines = content.split('\n');
    lines.forEach(line => {
      const indentation = line.match(/^\s*/)?.[0].length || 0;
      if (indentation > 20) { // 5レベル以上のネスト
        smells++;
      }
    });
    
    return smells;
  }
  
  private detectDuplicateLines(lines: string[]): number {
    const lineCount = new Map<string, number>();
    let duplicates = 0;
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed && trimmed.length > 10) { // 短い行は無視
        const count = lineCount.get(trimmed) || 0;
        lineCount.set(trimmed, count + 1);
        if (count === 1) {
          duplicates++;
        }
      }
    });
    
    return duplicates;
  }
  
  private async analyzeQuality(readResult: any, analysisType: string): Promise<QualityIssue[]> {
    const issues: QualityIssue[] = [];
    const content = readResult.content || '';
    const lines = content.split('\n');
    
    // 基本品質チェック
    if (analysisType === 'basic' || analysisType === 'detailed' || analysisType === 'all') {
      issues.push(...this.basicQualityChecks(content, lines, readResult.symbols || []));
    }
    
    // セキュリティチェック
    if (analysisType === 'security' || analysisType === 'all') {
      issues.push(...this.securityChecks(content, lines));
    }
    
    // パフォーマンスチェック
    if (analysisType === 'performance' || analysisType === 'all') {
      issues.push(...this.performanceChecks(content, lines, readResult.symbols || []));
    }
    
    return issues;
  }
  
  private basicQualityChecks(content: string, lines: string[], symbols: any[]): QualityIssue[] {
    const issues: QualityIssue[] = [];
    
    // 長い行チェック
    lines.forEach((line, index) => {
      if (line.length > 120) {
        issues.push({
          type: 'warning',
          category: 'readability',
          message: 'Line too long (>120 characters)',
          line: index + 1,
          severity: 'low',
          suggestion: 'Consider breaking this line into multiple lines',
          rule: 'max-line-length'
        });
      }
    });
    
    // コメント不足チェック
    const commentRatio = this.calculateCommentRatio(content);
    if (commentRatio < 0.1) {
      issues.push({
        type: 'suggestion',
        category: 'documentation',
        message: 'Low comment ratio detected',
        severity: 'medium',
        suggestion: 'Consider adding more comments to improve code readability',
        rule: 'comment-ratio'
      });
    }
    
    // 複雑な関数チェック
    symbols.forEach(symbol => {
      if (symbol.kind === 'function' || symbol.kind === 'method') {
        const lines = symbol.endLine - symbol.startLine;
        if (lines > 50) {
          issues.push({
            type: 'warning',
            category: 'complexity',
            message: `Function '${symbol.name}' is too long (${lines} lines)`,
            line: symbol.startLine,
            severity: 'medium',
            suggestion: 'Consider breaking this function into smaller functions',
            rule: 'max-function-length'
          });
        }
      }
    });
    
    // TODO/FIXME検出
    lines.forEach((line, index) => {
      if (line.includes('TODO') || line.includes('FIXME')) {
        issues.push({
          type: 'info',
          category: 'maintenance',
          message: 'TODO/FIXME comment found',
          line: index + 1,
          severity: 'low',
          suggestion: 'Consider addressing this TODO/FIXME item',
          rule: 'no-todo'
        });
      }
    });
    
    return issues;
  }
  
  private securityChecks(content: string, lines: string[]): QualityIssue[] {
    const issues: QualityIssue[] = [];
    
    // 危険な関数使用チェック
    const dangerousFunctions = ['eval', 'exec', 'innerHTML', 'document.write'];
    dangerousFunctions.forEach(func => {
      if (content.includes(func)) {
        const lineNumbers = lines
          .map((line, index) => line.includes(func) ? index + 1 : -1)
          .filter(num => num !== -1);
        
        lineNumbers.forEach(lineNum => {
          issues.push({
            type: 'error',
            category: 'security',
            message: `Potentially dangerous function '${func}' detected`,
            line: lineNum,
            severity: 'high',
            suggestion: `Avoid using '${func}' as it can introduce security vulnerabilities`,
            rule: 'no-dangerous-functions'
          });
        });
      }
    });
    
    // ハードコードされたパスワード/API key検出
    const secretPatterns = [
      /password\s*=\s*['"]\w+['"]/i,
      /api[_-]?key\s*=\s*['"]\w+['"]/i,
      /secret\s*=\s*['"]\w+['"]/i
    ];
    
    lines.forEach((line, index) => {
      secretPatterns.forEach(pattern => {
        if (pattern.test(line)) {
          issues.push({
            type: 'error',
            category: 'security',
            message: 'Potential hardcoded secret detected',
            line: index + 1,
            severity: 'high',
            suggestion: 'Move secrets to environment variables or secure configuration',
            rule: 'no-hardcoded-secrets'
          });
        }
      });
    });
    
    return issues;
  }
  
  private performanceChecks(content: string, lines: string[], symbols: any[]): QualityIssue[] {
    const issues: QualityIssue[] = [];
    
    // N+1 クエリパターン検出
    if (content.includes('for') && content.includes('query')) {
      issues.push({
        type: 'warning',
        category: 'performance',
        message: 'Potential N+1 query pattern detected',
        severity: 'medium',
        suggestion: 'Consider using batch queries or eager loading',
        rule: 'no-n-plus-one'
      });
    }
    
    // 大きなループ検出
    lines.forEach((line, index) => {
      if (line.includes('for') && line.includes('.length')) {
        issues.push({
          type: 'suggestion',
          category: 'performance',
          message: 'Consider caching array length in loops',
          line: index + 1,
          severity: 'low',
          suggestion: 'Cache array.length in a variable before the loop',
          rule: 'cache-array-length'
        });
      }
    });
    
    return issues;
  }
  
  private calculateCommentRatio(content: string): number {
    const lines = content.split('\n');
    const codeLines = lines.filter(line => 
      line.trim() && !line.trim().startsWith('//') && !line.trim().startsWith('/*')
    ).length;
    const commentLines = lines.filter(line => 
      line.trim().startsWith('//') || line.trim().startsWith('/*') || line.trim().startsWith('*')
    ).length;
    
    return codeLines > 0 ? commentLines / codeLines : 0;
  }
  
  private formatMetrics(metrics: QualityMetrics): string {
    let output = '## Quality Metrics\n\n';
    
    output += `**Lines of Code:** ${metrics.linesOfCode}\n`;
    output += `**Code to Comment Ratio:** ${metrics.codeToCommentRatio.toFixed(2)}\n`;
    output += `**Cyclomatic Complexity:** ${metrics.cyclomaticComplexity}\n`;
    output += `**Code Smells:** ${metrics.codeSmells}\n`;
    output += `**Duplicate Lines:** ${metrics.duplicateLines}\n`;
    output += `**Maintainability Index:** ${metrics.maintainabilityIndex.toFixed(1)}/100\n\n`;
    
    // 評価
    if (metrics.maintainabilityIndex >= 80) {
      output += '✅ **Excellent maintainability**\n\n';
    } else if (metrics.maintainabilityIndex >= 60) {
      output += '💡 **Good maintainability**\n\n';
    } else if (metrics.maintainabilityIndex >= 40) {
      output += '⚠️ **Moderate maintainability - consider refactoring**\n\n';
    } else {
      output += '❌ **Poor maintainability - refactoring recommended**\n\n';
    }
    
    return output;
  }
  
  private formatIssues(issues: QualityIssue[]): string {
    let output = '## Issues Found\n\n';
    
    if (issues.length === 0) {
      output += '✅ No issues found!\n\n';
      return output;
    }
    
    const groupedIssues = issues.reduce((groups: any, issue) => {
      const key = `${issue.type}-${issue.severity}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(issue);
      return groups;
    }, {});
    
    // 重要度順に表示
    const priorityOrder = ['error-high', 'error-medium', 'warning-high', 'warning-medium', 'warning-low', 'suggestion-medium', 'suggestion-low', 'info-low'];
    
    priorityOrder.forEach(key => {
      if (groupedIssues[key]) {
        const [type, severity] = key.split('-');
        const icon = type === 'error' ? '❌' : type === 'warning' ? '⚠️' : type === 'suggestion' ? '💡' : 'ℹ️';
        
        output += `### ${icon} ${type.charAt(0).toUpperCase() + type.slice(1)}s (${severity})\n\n`;
        
        groupedIssues[key].forEach((issue: QualityIssue) => {
          output += `**${issue.category}:** ${issue.message}`;
          if (issue.line) {
            output += ` (Line ${issue.line})`;
          }
          output += '\n';
          if (issue.suggestion) {
            output += `  💡 *${issue.suggestion}*\n`;
          }
          output += '\n';
        });
      }
    });
    
    return output;
  }
  
  private generateSuggestions(issues: QualityIssue[], readResult: any): string {
    let output = '## Improvement Suggestions\n\n';
    
    const suggestions = new Set<string>();
    
    // 問題から提案を収集
    issues.forEach(issue => {
      if (issue.suggestion) {
        suggestions.add(issue.suggestion);
      }
    });
    
    // メトリクスベースの提案
    const metrics = this.calculateMetrics(readResult);
    
    if (metrics.cyclomaticComplexity > 10) {
      suggestions.add('Consider refactoring complex functions to reduce cyclomatic complexity');
    }
    
    if (metrics.codeToCommentRatio > 10) {
      suggestions.add('Add more comments to improve code documentation');
    }
    
    if (metrics.codeSmells > 5) {
      suggestions.add('Address identified code smells to improve maintainability');
    }
    
    if (suggestions.size === 0) {
      output += '✅ No specific suggestions - code quality looks good!\n\n';
    } else {
      Array.from(suggestions).forEach((suggestion, index) => {
        output += `${index + 1}. ${suggestion}\n`;
      });
      output += '\n';
    }
    
    return output;
  }
  
  private async checkStandards(readResult: any, standards: string[]): Promise<string> {
    let output = '## Coding Standards Check\n\n';
    
    standards.forEach(standard => {
      output += `**${standard}:** `;
      
      // 簡易的な標準チェック（実際の実装ではESLint等のAPIを使用）
      switch (standard.toLowerCase()) {
        case 'eslint':
          output += 'Would require ESLint integration\n';
          break;
        case 'prettier':
          output += 'Would require Prettier integration\n';
          break;
        case 'tslint':
          output += 'Would require TSLint integration\n';
          break;
        default:
          output += `Unknown standard: ${standard}\n`;
      }
    });
    
    output += '\n*Note: Full standard checking requires integration with respective linting tools*\n\n';
    
    return output;
  }
  
  private generateOverallScore(issues: QualityIssue[], readResult: any): string {
    let output = '## Overall Quality Score\n\n';
    
    let score = 100;
    
    // 問題による減点
    issues.forEach(issue => {
      switch (issue.severity) {
        case 'high':
          score -= issue.type === 'error' ? 15 : 10;
          break;
        case 'medium':
          score -= issue.type === 'error' ? 8 : 5;
          break;
        case 'low':
          score -= 2;
          break;
      }
    });
    
    score = Math.max(0, score);
    
    output += `**Quality Score:** ${score}/100\n\n`;
    
    if (score >= 90) {
      output += '🏆 **Excellent** - High quality code with minimal issues\n';
    } else if (score >= 75) {
      output += '✅ **Good** - Generally good quality with minor improvements needed\n';
    } else if (score >= 60) {
      output += '⚠️ **Acceptable** - Moderate quality, several improvements recommended\n';
    } else if (score >= 40) {
      output += '❌ **Poor** - Low quality, significant refactoring needed\n';
    } else {
      output += '💀 **Critical** - Very poor quality, major issues need immediate attention\n';
    }
    
    return output;
  }
}
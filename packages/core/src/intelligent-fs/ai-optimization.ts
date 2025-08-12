/**
 * AI駆動の最適化機能
 * コード生成、バグ予測、アーキテクチャ提案を実現
 */

import { IntelligentFileSystem, IntelligentReadResult } from './intelligent-filesystem.js';
import { MemoryIntegrationManager } from './memory-integration.js';
import { TreeSitterSymbolInfo } from '../code-intelligence/tree-sitter-symbol-index.js';
import { TypeScriptLSPClient } from '../code-intelligence/lsp-client.js';
import * as path from 'path';

// ロガー
const logger = {
  debug: (msg: string, data?: any) => console.debug(msg, data),
  info: (msg: string, data?: any) => console.info(msg, data),
  warn: (msg: string, data?: any) => console.warn(msg, data),
  error: (msg: string, data?: any) => console.error(msg, data)
};

/**
 * コード品質メトリクス
 */
export interface CodeQualityMetrics {
  complexity: number;
  maintainability: number;
  testCoverage?: number;
  codeSmells: CodeSmell[];
  suggestions: OptimizationSuggestion[];
}

/**
 * コードの問題点
 */
export interface CodeSmell {
  type: 'long-method' | 'large-class' | 'duplicate-code' | 'complex-condition' | 'god-class' | 'dead-code';
  severity: 'low' | 'medium' | 'high' | 'critical';
  location: {
    file: string;
    line: number;
    column: number;
  };
  message: string;
  suggestion?: string;
}

/**
 * 最適化提案
 */
export interface OptimizationSuggestion {
  type: 'refactor' | 'performance' | 'security' | 'maintainability' | 'testing';
  priority: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  estimatedImpact: string;
  implementation?: string;
}

/**
 * バグ予測結果
 */
export interface BugPrediction {
  likelihood: number; // 0-1の確率
  type: string;
  description: string;
  location: {
    file: string;
    line: number;
    symbol?: string;
  };
  prevention: string;
  severity?: 'low' | 'medium' | 'high';
}

/**
 * アーキテクチャ分析結果
 */
export interface ArchitectureAnalysis {
  patterns: DesignPattern[];
  antiPatterns: AntiPattern[];
  dependencies: DependencyIssue[];
  recommendations: ArchitectureRecommendation[];
}

export interface DesignPattern {
  name: string;
  type: 'creational' | 'structural' | 'behavioral';
  location: string;
  quality: 'good' | 'acceptable' | 'needs-improvement';
}

export interface AntiPattern {
  name: string;
  severity: 'low' | 'medium' | 'high';
  location: string;
  impact: string;
  solution: string;
}

export interface DependencyIssue {
  type: 'circular' | 'unstable' | 'unused' | 'outdated';
  from: string;
  to: string;
  severity: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface ArchitectureRecommendation {
  category: 'structure' | 'modularity' | 'coupling' | 'cohesion';
  title: string;
  description: string;
  benefit: string;
  implementation: string[];
}

/**
 * コード生成オプション
 */
export interface CodeGenerationOptions {
  type: 'function' | 'class' | 'interface' | 'test' | 'documentation';
  language: 'typescript' | 'javascript' | 'python' | 'java';
  style?: 'functional' | 'object-oriented' | 'mixed';
  includeTests?: boolean;
  includeDocumentation?: boolean;
  name?: string;
  description?: string;
}

/**
 * AI最適化エンジン
 */
export class AIOptimizationEngine {
  private intelligentFS: IntelligentFileSystem;
  private memoryManager: MemoryIntegrationManager;
  private metricsCache: Map<string, CodeQualityMetrics>;
  private predictionsCache: Map<string, BugPrediction[]>;

  constructor(
    intelligentFS: IntelligentFileSystem,
    memoryManager: MemoryIntegrationManager
  ) {
    this.intelligentFS = intelligentFS;
    this.memoryManager = memoryManager;
    this.metricsCache = new Map();
    this.predictionsCache = new Map();
  }

  /**
   * コード品質を分析（文字列またはIntelligentReadResult対応）
   */
  async analyzeCodeQuality(
    input: string | IntelligentReadResult
  ): Promise<CodeQualityMetrics> {
    let readResult: IntelligentReadResult;
    let filePath: string;

    // 入力がファイルパスの場合
    if (typeof input === 'string') {
      filePath = input;
      
      // キャッシュチェック
      if (this.metricsCache.has(filePath)) {
        return this.metricsCache.get(filePath)!;
      }

      readResult = await this.intelligentFS.readFileIntelligent(filePath);
      if (!readResult.success) {
        throw new Error(`Failed to read file: ${filePath}`);
      }
    } else {
      // 入力がIntelligentReadResultの場合
      readResult = input;
      filePath = readResult.path;
      
      if (!readResult.success) {
        throw new Error(`Failed to read file: ${readResult.path}`);
      }
    }

    const metrics = await this.calculateMetrics(readResult);
    
    // 記憶システムに保存（メソッドが存在する場合のみ）
    try {
      if ('saveCodePattern' in this.memoryManager) {
        await (this.memoryManager as any).saveCodePattern(
          filePath,
          'quality-metrics',
          metrics
        );
      }
    } catch (error) {
      console.warn('Failed to save code pattern to memory:', error);
    }

    this.metricsCache.set(filePath, metrics);
    return metrics;
  }

  /**
   * バグを予測（文字列またはIntelligentReadResult対応）
   */
  async predictBugs(
    input: string | IntelligentReadResult
  ): Promise<BugPrediction[]> {
    let readResult: IntelligentReadResult;
    let filePath: string;

    // 入力がファイルパスの場合
    if (typeof input === 'string') {
      filePath = input;
      
      // キャッシュチェック
      if (this.predictionsCache.has(filePath)) {
        return this.predictionsCache.get(filePath)!;
      }

      readResult = await this.intelligentFS.readFileIntelligent(filePath);
      if (!readResult.success) {
        throw new Error(`Failed to read file: ${filePath}`);
      }
    } else {
      // 入力がIntelligentReadResultの場合
      readResult = input;
      filePath = readResult.path;
      
      if (!readResult.success) {
        throw new Error(`Failed to read file: ${readResult.path}`);
      }
    }

    const predictions = await this.analyzeBugPatterns(readResult);
    
    // 過去のエラーパターンと照合
    const historicalErrors = await this.memoryManager.recallSimilarErrors(
      predictions.map(p => p.description).join(' ')
    );

    // 予測を補強
    const enhancedPredictions = this.enhancePredictions(predictions, historicalErrors);

    this.predictionsCache.set(filePath, enhancedPredictions);
    return enhancedPredictions;
  }

  /**
   * アーキテクチャを分析
   */
  async analyzeArchitecture(projectPath: string): Promise<ArchitectureAnalysis> {
    const files = await this.intelligentFS.listProjectFiles(projectPath);
    const analysis: ArchitectureAnalysis = {
      patterns: [],
      antiPatterns: [],
      dependencies: [],
      recommendations: []
    };

    // 各ファイルのシンボル情報を収集
    for (const file of files) {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        const readResult = await this.intelligentFS.readFileIntelligent(file);
        if (readResult.success) {
          const fileAnalysis = await this.analyzeFileArchitecture(readResult);
          analysis.patterns.push(...fileAnalysis.patterns);
          analysis.antiPatterns.push(...fileAnalysis.antiPatterns);
        }
      }
    }

    // 依存関係を分析
    analysis.dependencies = await this.analyzeDependencies(projectPath);

    // 推奨事項を生成
    analysis.recommendations = this.generateArchitectureRecommendations(analysis);

    return analysis;
  }

  /**
   * コードを生成
   */
  async generateCode(
    context: string,
    options: CodeGenerationOptions
  ): Promise<string> {
    logger.info(`Generating ${options.type} code`, options);

    // 類似パターンを記憶から取得
    const similarPatterns = await this.memoryManager.recallCodePatterns(
      options.type,
      5
    );

    // コンテキストを解析
    const contextAnalysis = await this.analyzeContext(context);

    // コード生成
    const generatedCode = await this.generateCodeInternal(
      contextAnalysis,
      options,
      similarPatterns
    );

    // テスト生成（必要な場合）
    if (options.includeTests) {
      const tests = await this.generateTests(generatedCode, options);
      return `${generatedCode}\n\n${tests}`;
    }

    return generatedCode;
  }

  /**
   * 高度なリファクタリング提案を生成（文字列またはIntelligentReadResult対応）
   */
  async suggestRefactoring(
    input: string | IntelligentReadResult
  ): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    let readResult: IntelligentReadResult;
    let filePath: string;

    // 入力がファイルパスの場合
    if (typeof input === 'string') {
      filePath = input;
      readResult = await this.intelligentFS.readFileIntelligent(filePath);
      if (!readResult.success) {
        throw new Error(`Failed to read file: ${filePath}`);
      }
    } else {
      // 入力がIntelligentReadResultの場合
      readResult = input;
      filePath = readResult.path;
      
      if (!readResult.success) {
        throw new Error(`Failed to read file: ${readResult.path}`);
      }
    }
    
    // 各種分析を並列実行
    const [quality, bugPredictions] = await Promise.all([
      this.analyzeCodeQuality(readResult),
      this.predictBugs(readResult)
    ]);
    
    // Extract Method リファクタリング提案
    suggestions.push(...await this.suggestExtractMethod(readResult));
    
    // Extract Class リファクタリング提案
    suggestions.push(...await this.suggestExtractClass(readResult));
    
    // Rename リファクタリング提案
    suggestions.push(...await this.suggestRename(readResult));
    
    // Dead Code 除去提案
    suggestions.push(...await this.suggestRemoveDeadCode(readResult));
    
    // コードの臭いに基づく提案
    suggestions.push(...this.generateSmellBasedSuggestions(quality.codeSmells));
    
    // バグ予測に基づく提案
    suggestions.push(...this.generateBugPreventionSuggestions(bugPredictions));
    
    // パフォーマンス最適化の提案
    suggestions.push(...await this.suggestPerformanceOptimizations(filePath));
    
    // セキュリティ改善の提案
    suggestions.push(...await this.suggestSecurityImprovements(filePath));
    
    // 設計パターン適用提案
    suggestions.push(...await this.suggestDesignPatterns(readResult));
    
    // 提案を優先度でソート
    suggestions.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
    
    return suggestions;
  }
  
  /**
   * Extract Method リファクタリング提案
   */
  private async suggestExtractMethod(data: IntelligentReadResult): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    const methods = this.extractMethods(data.content);
    
    for (const method of methods) {
      if (method.lineCount > 20) {
        const complexBlocks = this.identifyComplexBlocks(data.content, method);
        
        for (const block of complexBlocks) {
          suggestions.push({
            type: 'refactor',
            priority: method.lineCount > 50 ? 'high' : 'medium',
            title: `Extract method from ${method.name}`,
            description: `Extract ${block.description} into a separate method`,
            estimatedImpact: 'Improves code readability and reusability',
            implementation: `
Create new method:
\`\`\`
private ${block.suggestedName}() {
  ${block.code}
}
\`\`\`

Replace original code with:
\`\`\`
this.${block.suggestedName}();
\`\`\`
`
          });
        }
      }
    }
    
    return suggestions;
  }
  
  /**
   * Extract Class リファクタリング提案
   */
  private async suggestExtractClass(data: IntelligentReadResult): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    const classes = this.extractClasses(data.content);
    
    for (const cls of classes) {
      if (cls.methodCount > 15 || cls.lineCount > 200) {
        const cohesionGroups = this.analyzeCohesion(data.content, cls);
        
        for (const group of cohesionGroups) {
          if (group.methods.length >= 3) {
            suggestions.push({
              type: 'refactor',
              priority: cls.methodCount > 25 ? 'high' : 'medium',
              title: `Extract class from ${cls.name}`,
              description: `Extract ${group.responsibility} functionality into a separate class`,
              estimatedImpact: 'Improves Single Responsibility Principle adherence',
              implementation: `
Create new class:
\`\`\`
class ${group.suggestedClassName} {
  ${group.methods.map(m => `${m.signature} { ... }`).join('\n  ')}
}
\`\`\`

Update original class to use the new class:
\`\`\`
private ${group.suggestedClassName.toLowerCase()}: ${group.suggestedClassName};
\`\`\`
`
            });
          }
        }
      }
    }
    
    return suggestions;
  }
  
  /**
   * Rename リファクタリング提案
   */
  private async suggestRename(data: IntelligentReadResult): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    const lines = data.content.split('\n');
    
    // 不適切な命名を検出
    const namingIssues = this.detectNamingIssues(data.content);
    
    for (const issue of namingIssues) {
      suggestions.push({
        type: 'refactor',
        priority: 'medium',
        title: `Rename ${issue.type}: ${issue.currentName}`,
        description: `${issue.reason}`,
        estimatedImpact: 'Improves code readability and maintainability',
        implementation: `Rename '${issue.currentName}' to '${issue.suggestedName}'`
      });
    }
    
    return suggestions;
  }
  
  /**
   * Dead Code 除去提案
   */
  private async suggestRemoveDeadCode(data: IntelligentReadResult): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    
    // デッドコードを検出
    const deadCodeBlocks = this.detectDeadCode(data.content, data.path);
    const unusedVariables = this.detectUnusedVariables(data.content, data.path);
    const unreachableCode = this.detectUnreachableCode(data.content, data.path);
    
    // デッドコードブロック
    for (const deadBlock of deadCodeBlocks) {
      suggestions.push({
        type: 'refactor',
        priority: 'low',
        title: `Remove dead code`,
        description: deadBlock.description,
        estimatedImpact: 'Reduces code complexity and improves maintainability',
        implementation: `Remove lines ${deadBlock.line} containing unused code`
      });
    }
    
    // 未使用変数
    for (const unusedVar of unusedVariables) {
      suggestions.push({
        type: 'refactor',
        priority: 'low',
        title: `Remove unused variable: ${unusedVar.name}`,
        description: `Variable '${unusedVar.name}' is declared but never used`,
        estimatedImpact: 'Reduces memory usage and code clutter',
        implementation: `Remove variable declaration at line ${unusedVar.line}`
      });
    }
    
    // 到達不能コード
    for (const unreachable of unreachableCode) {
      suggestions.push({
        type: 'refactor',
        priority: 'medium',
        title: `Remove unreachable code`,
        description: `Code at line ${unreachable.line} is unreachable`,
        estimatedImpact: 'Prevents confusion and improves code clarity',
        implementation: `Remove unreachable code block starting at line ${unreachable.line}`
      });
    }
    
    return suggestions;
  }
  
  /**
   * 設計パターン適用提案
   */
  private async suggestDesignPatterns(data: IntelligentReadResult): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    const content = data.content;
    
    // Singleton パターンの適用提案
    if (this.shouldApplySingleton(content)) {
      suggestions.push({
        type: 'refactor',
        priority: 'medium',
        title: 'Apply Singleton Pattern',
        description: 'Class appears to be used as a single instance throughout the application',
        estimatedImpact: 'Ensures single instance and global access point',
        implementation: `
Add private constructor and static getInstance method:
\`\`\`
private static instance: ClassName;
private constructor() { }
static getInstance(): ClassName {
  if (!ClassName.instance) {
    ClassName.instance = new ClassName();
  }
  return ClassName.instance;
}
\`\`\`
`
      });
    }
    
    // Strategy パターンの適用提案
    if (this.shouldApplyStrategy(content)) {
      suggestions.push({
        type: 'refactor',
        priority: 'medium',
        title: 'Apply Strategy Pattern',
        description: 'Large switch/if-else blocks detected that could benefit from Strategy pattern',
        estimatedImpact: 'Improves extensibility and reduces complexity',
        implementation: `
Create strategy interface:
\`\`\`
interface ProcessingStrategy {
  process(data: any): any;
}
\`\`\`

Implement concrete strategies and use context class.
`
      });
    }
    
    // Observer パターンの適用提案
    if (this.shouldApplyObserver(content)) {
      suggestions.push({
        type: 'refactor',
        priority: 'medium',
        title: 'Apply Observer Pattern',
        description: 'Event handling code could benefit from Observer pattern',
        estimatedImpact: 'Improves loose coupling between components',
        implementation: `
Implement Observer interface:
\`\`\`
interface Observer {
  update(event: any): void;
}
\`\`\`

Add observer management to subject class.
`
      });
    }
    
    return suggestions;
  }
  
  // Helper methods for refactoring suggestions
  
  private identifyComplexBlocks(content: string, method: any): Array<{
    code: string;
    description: string;
    suggestedName: string;
    startLine: number;
    endLine: number;
  }> {
    const blocks: Array<{
      code: string;
      description: string;
      suggestedName: string;
      startLine: number;
      endLine: number;
    }> = [];
    
    const lines = content.split('\n');
    const methodLines = lines.slice(method.startLine - 1, method.endLine);
    
    // ループブロックを検出
    let inLoop = false;
    let loopStart = -1;
    let braceDepth = 0;
    
    for (let i = 0; i < methodLines.length; i++) {
      const line = methodLines[i];
      
      if (line.match(/\b(for|while|do)\b/) && !inLoop) {
        inLoop = true;
        loopStart = i;
        braceDepth = 0;
      }
      
      if (inLoop) {
        braceDepth += (line.match(/\{/g) || []).length;
        braceDepth -= (line.match(/\}/g) || []).length;
        
        if (braceDepth === 0 && i - loopStart > 5) {
          blocks.push({
            code: methodLines.slice(loopStart, i + 1).join('\n'),
            description: 'complex loop logic',
            suggestedName: 'processLoop',
            startLine: method.startLine + loopStart,
            endLine: method.startLine + i
          });
          inLoop = false;
        }
      }
    }
    
    return blocks;
  }
  
  private analyzeCohesion(content: string, cls: any): Array<{
    responsibility: string;
    methods: Array<{ signature: string; name: string }>;
    suggestedClassName: string;
  }> {
    const groups: Array<{
      responsibility: string;
      methods: Array<{ signature: string; name: string }>;
      suggestedClassName: string;
    }> = [];
    
    // 簡単な凝集度分析（実際の実装ではより高度な分析が必要）
    const methods = this.extractMethods(content);
    const classContent = content.substring(
      content.indexOf(cls.name),
      content.lastIndexOf('}') // 簡易的な終了位置検出
    );
    
    // データアクセス関連メソッドをグループ化
    const dataAccessMethods = methods.filter(m => 
      m.name.includes('get') || m.name.includes('set') || 
      m.name.includes('find') || m.name.includes('save')
    );
    
    if (dataAccessMethods.length >= 3) {
      groups.push({
        responsibility: 'data access',
        methods: dataAccessMethods.map(m => ({ signature: `${m.name}()`, name: m.name })),
        suggestedClassName: `${cls.name}Repository`
      });
    }
    
    // バリデーション関連メソッドをグループ化
    const validationMethods = methods.filter(m => 
      m.name.includes('validate') || m.name.includes('check') || 
      m.name.includes('verify')
    );
    
    if (validationMethods.length >= 2) {
      groups.push({
        responsibility: 'validation',
        methods: validationMethods.map(m => ({ signature: `${m.name}()`, name: m.name })),
        suggestedClassName: `${cls.name}Validator`
      });
    }
    
    return groups;
  }
  
  private detectNamingIssues(content: string): Array<{
    type: 'variable' | 'function' | 'class';
    currentName: string;
    suggestedName: string;
    reason: string;
    line: number;
  }> {
    const issues: Array<{
      type: 'variable' | 'function' | 'class';
      currentName: string;
      suggestedName: string;
      reason: string;
      line: number;
    }> = [];
    
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // 短すぎる変数名
      const shortVarMatches = line.match(/\b(const|let|var)\s+([a-z])\b/g);
      if (shortVarMatches) {
        shortVarMatches.forEach(match => {
          const varName = match.split(/\s+/)[1];
          if (varName.length === 1 && !['i', 'j', 'k'].includes(varName)) {
            issues.push({
              type: 'variable',
              currentName: varName,
              suggestedName: this.generateBetterVariableName(line, varName),
              reason: 'Variable name is too short and unclear',
              line: i + 1
            });
          }
        });
      }
      
      // 短すぎるメソッド名
      const shortMethodMatches = line.match(/\b(public|private|protected)?\s*(static)?\s*([a-z])\s*\(/g);
      if (shortMethodMatches) {
        shortMethodMatches.forEach(match => {
          const methodName = match.match(/\b([a-z])\s*\(/)?.[1];
          if (methodName && methodName.length === 1) {
            issues.push({
              type: 'function',
              currentName: methodName,
              suggestedName: this.generateBetterMethodName(line, methodName),
              reason: 'Method name is too short and unclear',
              line: i + 1
            });
          }
        });
      }
      
      // ハンガリアン記法
      const hungarianMatches = line.match(/\b(str|int|bool|arr|obj)([A-Z]\w+)/g);
      if (hungarianMatches) {
        hungarianMatches.forEach(match => {
          const newName = match.replace(/^(str|int|bool|arr|obj)/, '').toLowerCase();
          issues.push({
            type: 'variable',
            currentName: match,
            suggestedName: newName,
            reason: 'Avoid Hungarian notation in favor of descriptive names',
            line: i + 1
          });
        });
      }
      
      // 関数名の動詞不足
      const functionMatches = line.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g);
      if (functionMatches) {
        functionMatches.forEach(match => {
          const funcName = match.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/)?.[1];
          if (funcName && !this.startsWithVerb(funcName)) {
            issues.push({
              type: 'function',
              currentName: funcName,
              suggestedName: this.suggestVerbPrefix(funcName),
              reason: 'Function names should start with a verb to indicate action',
              line: i + 1
            });
          }
        });
      }
    }
    
    return issues;
  }
  
  private detectUnusedVariables(content: string, filePath: string): Array<{
    name: string;
    line: number;
    type: string;
  }> {
    const unused: Array<{
      name: string;
      line: number;
      type: string;
    }> = [];
    
    const lines = content.split('\n');
    const variableDeclarations = new Map<string, { line: number; type: string }>();
    
    // 変数宣言を収集
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const varMatches = line.match(/\b(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g);
      if (varMatches) {
        varMatches.forEach(match => {
          const parts = match.split(/\s+/);
          if (parts.length >= 2) {
            const varType = parts[0];
            const varName = parts[1].replace('=', '');
            variableDeclarations.set(varName, { line: i + 1, type: varType });
          }
        });
      }
    }
    
    // 使用状況をチェック
    for (const [varName, info] of variableDeclarations.entries()) {
      let usageCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        if (i + 1 === info.line) continue; // 宣言行はスキップ
        
        const line = lines[i];
        const regex = new RegExp(`\\b${varName}\\b`, 'g');
        const matches = line.match(regex);
        if (matches) {
          usageCount += matches.length;
        }
      }
      
      if (usageCount === 0) {
        unused.push({
          name: varName,
          line: info.line,
          type: info.type
        });
      }
    }
    
    return unused;
  }
  
  private detectUnreachableCode(content: string, filePath: string): Array<{
    line: number;
    description: string;
  }> {
    const unreachable: Array<{
      line: number;
      description: string;
    }> = [];
    
    const lines = content.split('\n');
    let afterReturn = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line).trim();
      
      if (!cleanLine) continue;
      
      // return, throw, break, continue の後のコードは到達不能
      if (cleanLine.match(/^\s*(return|throw|break|continue)\b/) && !cleanLine.endsWith('{')) {
        afterReturn = true;
        continue;
      }
      
      // ブロックの終了でリセット
      if (cleanLine.includes('}')) {
        afterReturn = false;
      }
      
      // 新しいブロックの開始でリセット
      if (cleanLine.includes('{') || cleanLine.match(/^\s*(if|else|while|for|function|class)/)) {
        afterReturn = false;
      }
      
      // 到達不能コードを検出
      if (afterReturn && !cleanLine.match(/^\s*[})]/) && cleanLine.length > 0) {
        unreachable.push({
          line: i + 1,
          description: `Code after return/throw statement: ${cleanLine.substring(0, 50)}${cleanLine.length > 50 ? '...' : ''}`
        });
      }
    }
    
    return unreachable;
  }
  
  private generateSmellBasedSuggestions(codeSmells: CodeSmell[]): OptimizationSuggestion[] {
    return codeSmells.map(smell => ({
      type: 'refactor' as const,
      priority: smell.severity === 'high' ? 'high' as const : 
               smell.severity === 'medium' ? 'medium' as const : 'low' as const,
      title: `Fix ${smell.type}`,
      description: smell.message,
      estimatedImpact: 'Improves code maintainability and reduces technical debt',
      implementation: smell.suggestion || 'Apply appropriate refactoring technique'
    }));
  }
  
  private generateBugPreventionSuggestions(bugPredictions: BugPrediction[]): OptimizationSuggestion[] {
    return bugPredictions
      .filter(bug => bug.likelihood > 0.5)
      .map(bug => ({
        type: 'refactor' as const,
        priority: bug.likelihood > 0.8 ? 'high' as const : 'medium' as const,
        title: `Prevent ${bug.type}`,
        description: bug.description,
        estimatedImpact: 'Reduces potential bugs and improves reliability',
        implementation: bug.prevention
      }));
  }
  
  // Design pattern application helpers
  private shouldApplySingleton(content: string): boolean {
    const hasStaticMethods = content.includes('static ');
    const hasGlobalUsage = content.includes('new ') && 
                          (content.match(/new \w+/g) || []).length === 1;
    return hasStaticMethods || hasGlobalUsage;
  }
  
  private shouldApplyStrategy(content: string): boolean {
    const hasSwitchStatement = content.includes('switch (');
    const hasLongIfElse = (content.match(/else if/g) || []).length > 3;
    return hasSwitchStatement || hasLongIfElse;
  }
  
  private shouldApplyObserver(content: string): boolean {
    const hasEventHandling = content.includes('addEventListener') ||
                           content.includes('on(') ||
                           content.includes('emit(');
    const hasCallbacks = (content.match(/callback|cb/g) || []).length > 2;
    return hasEventHandling || hasCallbacks;
  }
  
  private generateBetterVariableName(context: string, currentName: string): string {
    // コンテキストから適切な変数名を推測
    if (context.includes('user')) return 'userData';
    if (context.includes('config')) return 'configuration';
    if (context.includes('result')) return 'processingResult';
    if (context.includes('data')) return 'inputData';
    return `${currentName}Value`;
  }
  
  private generateBetterMethodName(context: string, currentName: string): string {
    // コンテキストから適切なメソッド名を推測
    if (context.includes('number') || context.includes('*') || context.includes('multiply')) return 'multiplyBy';
    if (context.includes('return') && context.includes('2')) return 'doubleValue';
    if (context.includes('calculate')) return 'calculate';
    if (context.includes('process')) return 'process';
    if (context.includes('data')) return 'processData';
    return `perform${currentName.toUpperCase()}`;
  }
  
  private startsWithVerb(name: string): boolean {
    const verbs = [
      'get', 'set', 'is', 'has', 'can', 'should', 'will',
      'create', 'update', 'delete', 'remove', 'add', 'insert',
      'find', 'search', 'filter', 'sort', 'map', 'reduce',
      'validate', 'verify', 'check', 'test', 'ensure',
      'parse', 'format', 'convert', 'transform', 'process',
      'handle', 'manage', 'control', 'execute', 'run',
      'load', 'save', 'read', 'write', 'open', 'close'
    ];
    
    return verbs.some(verb => name.toLowerCase().startsWith(verb));
  }
  
  private suggestVerbPrefix(name: string): string {
    // 名前の種類に基づいて適切な動詞を提案
    if (name.toLowerCase().includes('data')) return `get${name}`;
    if (name.toLowerCase().includes('config')) return `load${name}`;
    if (name.toLowerCase().includes('user')) return `fetch${name}`;
    if (name.toLowerCase().includes('result')) return `calculate${name}`;
    return `process${name}`;
  }

  // Private methods

  private async calculateMetrics(data: IntelligentReadResult): Promise<CodeQualityMetrics> {
    const complexity = this.calculateCyclomaticComplexity(data.content);
    const maintainability = this.calculateMaintainabilityIndex(data.content, complexity);
    const codeSmells = await this.detectCodeSmells(data);
    const suggestions = await this.generateOptimizationSuggestions(data, codeSmells);

    return {
      complexity,
      maintainability,
      codeSmells,
      suggestions
    };
  }

  private calculateCyclomaticComplexity(content: string): number {
    // 高度なサイクロマティック複雑度計算
    let complexity = 1;
    const lines = content.split('\n');
    let inComment = false;
    let inString = false;
    let stringChar = '';
    
    // 複雑度に影響するキーワードと演算子
    const decisionPoints = [
      'if', 'else if', 'while', 'for', 'do', 'switch', 'case', 
      'catch', '&&', '||', '?:', '??', '?.', 'try', 'finally'
    ];
    
    const functionPatterns = [
      /\bfunction\s+\w+\s*\(/g,
      /\b\w+\s*:\s*function\s*\(/g,
      /\b\w+\s*=>\s*/g,
      /\basync\s+function\s+\w+\s*\(/g,
      /\basync\s+\w+\s*=>\s*/g
    ];
    
    // 各行を詳細に解析
    for (const line of lines) {
      let cleanLine = line;
      
      // コメントと文字列を除外
      cleanLine = this.removeCommentsAndStrings(line);
      if (!cleanLine.trim()) continue;
      
      // 関数定義（各関数は基本複雑度1を持つ）
      for (const pattern of functionPatterns) {
        const matches = cleanLine.match(pattern);
        if (matches) {
          complexity += matches.length;
        }
      }
      
      // 条件分岐とループ（より精密な検出）
      if (this.containsKeyword(cleanLine, 'if') && !this.containsKeyword(cleanLine, 'else if')) {
        complexity += 2; // ifステートメントにより多くのポイントを付与
      }
      if (this.containsKeyword(cleanLine, 'else if')) {
        complexity += 2;
      }
      if (this.containsKeyword(cleanLine, 'else') && !this.containsKeyword(cleanLine, 'else if')) {
        complexity += 1;
      }
      if (this.containsKeyword(cleanLine, 'while')) {
        complexity += 2;
      }
      if (this.containsKeyword(cleanLine, 'for')) {
        complexity += 2;
      }
      if (this.containsKeyword(cleanLine, 'do')) {
        complexity += 2;
      }
      
      // switch文のcase
      const caseMatches = cleanLine.match(/\bcase\s+/g);
      if (caseMatches) {
        complexity += caseMatches.length * 2;
      }
      
      // try-catch-finally
      if (this.containsKeyword(cleanLine, 'try')) {
        complexity += 1;
      }
      if (this.containsKeyword(cleanLine, 'catch')) {
        complexity += 2;
      }
      if (this.containsKeyword(cleanLine, 'finally')) {
        complexity += 1;
      }
      
      // 論理演算子（同じ行に複数ある場合を考慮）
      const andMatches = cleanLine.match(/&&/g);
      if (andMatches) {
        complexity += andMatches.length;
      }
      
      const orMatches = cleanLine.match(/\|\|/g);
      if (orMatches) {
        complexity += orMatches.length;
      }
      
      // 三項演算子とNull合体演算子
      const ternaryMatches = cleanLine.match(/\?[^.]|\?:/g);
      if (ternaryMatches) {
        complexity += ternaryMatches.length;
      }
      
      const nullishMatches = cleanLine.match(/\?\?/g);
      if (nullishMatches) {
        complexity += nullishMatches.length;
      }
    }
    
    return Math.max(1, complexity);
  }
  
  private removeCommentsAndStrings(line: string): string {
    let result = '';
    let inSingleComment = false;
    let inMultiComment = false;
    let inString = false;
    let stringChar = '';
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = i < line.length - 1 ? line[i + 1] : '';
      
      if (!inString && !inSingleComment && !inMultiComment) {
        if (char === '/' && nextChar === '/') {
          inSingleComment = true;
          i++; // skip next char
          continue;
        }
        if (char === '/' && nextChar === '*') {
          inMultiComment = true;
          i++; // skip next char
          continue;
        }
        if (char === '"' || char === "'" || char === '`') {
          inString = true;
          stringChar = char;
          continue;
        }
      }
      
      if (inString && char === stringChar && (i === 0 || line[i - 1] !== '\\')) {
        inString = false;
        stringChar = '';
        continue;
      }
      
      if (inMultiComment && char === '*' && nextChar === '/') {
        inMultiComment = false;
        i++; // skip next char
        continue;
      }
      
      if (!inString && !inSingleComment && !inMultiComment) {
        result += char;
      }
    }
    
    return result;
  }
  
  private containsKeyword(line: string, keyword: string): boolean {
    const regex = new RegExp(`\\b${keyword}\\b`);
    return regex.test(line);
  }

  private calculateMaintainabilityIndex(content: string, complexity: number): number {
    // Microsoft Maintainability Index の高精度版
    const metrics = this.calculateDetailedMetrics(content);
    const lines = metrics.linesOfCode;
    const volume = metrics.halsteadVolume;
    
    // MI = 171 - 5.2 * ln(HalsteadVolume) - 0.23 * CC - 16.2 * ln(LOC) + 50 * sin(sqrt(2.4 * PercentComments))
    const commentPercent = metrics.commentLines / Math.max(1, lines);
    const commentFactor = commentPercent > 0 ? 50 * Math.sin(Math.sqrt(2.4 * commentPercent * 100)) : 0;
    
    let mi = 171 - 5.2 * Math.log(volume) - 0.23 * complexity - 16.2 * Math.log(lines) + commentFactor;
    
    // 正規化 (0-100)
    mi = Math.max(0, Math.min(100, mi));
    
    return Math.round(mi);
  }
  
  private calculateDetailedMetrics(content: string): {
    linesOfCode: number;
    commentLines: number;
    halsteadVolume: number;
    operators: number;
    operands: number;
  } {
    const lines = content.split('\n');
    let linesOfCode = 0;
    let commentLines = 0;
    const operators = new Set<string>();
    const operands = new Set<string>();
    let totalOperators = 0;
    let totalOperands = 0;
    
    // TypeScript/JavaScript 演算子
    const operatorPatterns = [
      /[+\-*/%=<>!&|^~]/g,
      /\b(new|typeof|instanceof|in|delete|void)\b/g,
      /[()\[\]{};,.:?]/g
    ];
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (!trimmedLine) continue;
      
      // コメント行の判定
      if (trimmedLine.startsWith('//') || 
          trimmedLine.startsWith('/*') || 
          trimmedLine.startsWith('*') ||
          trimmedLine.endsWith('*/')) {
        commentLines++;
      } else {
        linesOfCode++;
        
        // 演算子と被演算子の抽出
        const cleanLine = this.removeCommentsAndStrings(line);
        
        // 演算子
        for (const pattern of operatorPatterns) {
          const matches = cleanLine.match(pattern);
          if (matches) {
            matches.forEach(match => {
              operators.add(match);
              totalOperators++;
            });
          }
        }
        
        // 被演算子（変数名、リテラル）
        const identifiers = cleanLine.match(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g);
        if (identifiers) {
          identifiers.forEach(id => {
            if (!this.isKeyword(id)) {
              operands.add(id);
              totalOperands++;
            }
          });
        }
        
        // 数値リテラル
        const numbers = cleanLine.match(/\b\d+(\.\d+)?\b/g);
        if (numbers) {
          numbers.forEach(num => {
            operands.add(num);
            totalOperands++;
          });
        }
      }
    }
    
    // Halstead Volume = (totalOperators + totalOperands) * log2(distinctOperators + distinctOperands)
    const vocabulary = operators.size + operands.size;
    const length = totalOperators + totalOperands;
    const halsteadVolume = vocabulary > 0 ? length * Math.log2(vocabulary) : 0;
    
    return {
      linesOfCode: Math.max(1, linesOfCode),
      commentLines,
      halsteadVolume: Math.max(1, halsteadVolume),
      operators: operators.size,
      operands: operands.size
    };
  }
  
  private isKeyword(word: string): boolean {
    const keywords = [
      'abstract', 'any', 'as', 'async', 'await', 'boolean', 'break', 'case', 'catch',
      'class', 'const', 'constructor', 'continue', 'debugger', 'declare', 'default',
      'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally',
      'for', 'from', 'function', 'get', 'if', 'implements', 'import', 'in',
      'instanceof', 'interface', 'is', 'keyof', 'let', 'module', 'namespace',
      'never', 'new', 'null', 'number', 'object', 'of', 'package', 'private',
      'protected', 'public', 'readonly', 'require', 'return', 'set', 'static',
      'string', 'super', 'switch', 'symbol', 'this', 'throw', 'true', 'try',
      'type', 'typeof', 'undefined', 'union', 'unique', 'unknown', 'var', 'void',
      'while', 'with', 'yield'
    ];
    return keywords.includes(word);
  }

  private async detectCodeSmells(data: IntelligentReadResult): Promise<CodeSmell[]> {
    const smells: CodeSmell[] = [];
    const lines = data.content.split('\n');
    
    // メソッドとクラスの解析
    const methods = this.extractMethods(data.content);
    const classes = this.extractClasses(data.content);
    
    // 1. 長いメソッド検出（改良版）
    for (const method of methods) {
      if (method.lineCount > 15) {
        const severity: 'low' | 'medium' | 'high' | 'critical' = 
          method.lineCount > 50 ? 'critical' :
          method.lineCount > 30 ? 'high' : 'medium';
        
        smells.push({
          type: 'long-method',
          severity,
          location: {
            file: data.path,
            line: method.startLine,
            column: 0
          },
          message: `Long method '${method.name}' detected (${method.lineCount} lines)`,
          suggestion: 'Consider breaking this method into smaller, focused methods. Extract logical blocks into separate methods.'
        });
      }
    }
    
    // 2. 大きなクラス検出
    for (const cls of classes) {
      if (cls.methodCount > 15 || cls.lineCount > 200) {
        const severity: 'low' | 'medium' | 'high' | 'critical' = 
          (cls.methodCount > 25 || cls.lineCount > 400) ? 'high' : 'medium';
        
        smells.push({
          type: 'large-class',
          severity,
          location: {
            file: data.path,
            line: cls.startLine,
            column: 0
          },
          message: `Large class '${cls.name}' detected (${cls.methodCount} methods, ${cls.lineCount} lines)`,
          suggestion: 'Consider splitting this class into smaller, cohesive classes following Single Responsibility Principle.'
        });
      }
    }
    
    // 3. God Class 検出
    for (const cls of classes) {
      const godClassScore = this.calculateGodClassScore(cls);
      if (godClassScore > 0.7) {
        smells.push({
          type: 'god-class',
          severity: godClassScore > 0.9 ? 'critical' : 'high',
          location: {
            file: data.path,
            line: cls.startLine,
            column: 0
          },
          message: `God class '${cls.name}' detected (score: ${(godClassScore * 100).toFixed(1)}%)`,
          suggestion: 'This class has too many responsibilities. Apply Single Responsibility Principle and extract separate concerns into different classes.'
        });
      }
    }
    
    // 4. 複雑な条件文検出（改良版）
    lines.forEach((line, index) => {
      const cleanLine = this.removeCommentsAndStrings(line);
      const complexity = this.analyzeConditionComplexity(cleanLine);
      
      if (complexity.score > 3) {
        smells.push({
          type: 'complex-condition',
          severity: complexity.score > 7 ? 'high' : 'medium',
          location: {
            file: data.path,
            line: index + 1,
            column: 0
          },
          message: `Complex condition detected (complexity: ${complexity.score}, operators: ${complexity.operators})`,
          suggestion: 'Extract complex conditions into well-named boolean variables or guard methods. Consider using early returns to reduce nesting.'
        });
      }
    });
    
    // 5. 重複コード検出（改良版）
    const duplicates = this.detectDuplicateCode(data.content);
    for (const duplicate of duplicates) {
      smells.push({
        type: 'duplicate-code',
        severity: duplicate.severity,
        location: {
          file: data.path,
          line: duplicate.locations[0],
          column: 0
        },
        message: `Duplicate code found at lines ${duplicate.locations.join(', ')} (${duplicate.similarity}% similar)`,
        suggestion: 'Extract duplicate code into a reusable function, method, or module. Consider using parameterization for variations.'
      });
    }
    
    // 6. デッドコード検出
    const deadCode = this.detectDeadCode(data.content, data.path);
    for (const dead of deadCode) {
      smells.push({
        type: 'dead-code',
        severity: 'low',
        location: {
          file: data.path,
          line: dead.line,
          column: 0
        },
        message: `Unreachable or unused code detected: ${dead.description}`,
        suggestion: 'Remove dead code to improve maintainability and reduce confusion.'
      });
    }
    
    // 7. マジックナンバー検出
    const magicNumbers = this.detectMagicNumbers(data.content, data.path);
    for (const magic of magicNumbers) {
      smells.push({
        type: 'complex-condition', // 既存のタイプを再利用
        severity: 'medium',
        location: {
          file: data.path,
          line: magic.line,
          column: 0
        },
        message: `Magic number detected: ${magic.value}`,
        suggestion: 'Replace magic numbers with named constants to improve code readability.'
      });
    }
    
    return smells;
  }
  
  private extractMethods(content: string): Array<{
    name: string;
    startLine: number;
    endLine: number;
    lineCount: number;
    complexity: number;
  }> {
    const methods: Array<{
      name: string;
      startLine: number;
      endLine: number;
      lineCount: number;
      complexity: number;
    }> = [];
    
    const lines = content.split('\n');
    let braceDepth = 0;
    let currentMethod: any = null;
    
    // メソッドパターン
    const methodPatterns = [
      /^\s*(public|private|protected)?\s*(static)?\s*(async)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*:\s*[^{]+\{/,
      /^\s*(public|private|protected)?\s*(static)?\s*(async)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
      /^\s*(public|private|protected)?\s*(static)?\s*(get|set)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
      /^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(async\s+)?\s*\(/,
      /^\s*function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
      /^\s*(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(async\s+)?\s*\(/
    ];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // メソッドの開始を検出
      if (!currentMethod) {
        for (const pattern of methodPatterns) {
          const match = cleanLine.match(pattern);
          if (match) {
            const methodName = match[4] || match[2] || match[1] || 'anonymous';
            currentMethod = {
              name: methodName,
              startLine: i + 1,
              endLine: -1,
              lineCount: 0,
              complexity: 1
            };
            braceDepth = 0;
            
            // 同じ行にブレースがあるかチェック
            if (cleanLine.includes('{')) {
              braceDepth = 1;
            }
            break;
          }
        }
      } else {
        // ブレースのカウント
        braceDepth += (cleanLine.match(/\{/g) || []).length;
        braceDepth -= (cleanLine.match(/\}/g) || []).length;
        
        if (braceDepth === 0 && (cleanLine.match(/\}/g) || []).length > 0) {
          currentMethod.endLine = i + 1;
          currentMethod.lineCount = currentMethod.endLine - currentMethod.startLine + 1;
          currentMethod.complexity = this.calculateCyclomaticComplexity(
            lines.slice(currentMethod.startLine - 1, currentMethod.endLine).join('\n')
          );
          methods.push(currentMethod);
          currentMethod = null;
        }
      }
    }
    
    return methods;
  }
  
  private extractClasses(content: string): Array<{
    name: string;
    startLine: number;
    endLine: number;
    lineCount: number;
    methodCount: number;
    propertyCount: number;
  }> {
    const classes: Array<{
      name: string;
      startLine: number;
      endLine: number;
      lineCount: number;
      methodCount: number;
      propertyCount: number;
    }> = [];
    
    const lines = content.split('\n');
    let braceDepth = 0;
    let currentClass: any = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // クラスの開始を検出
      const classMatch = cleanLine.match(/^\s*(export\s+)?(abstract\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
      if (classMatch && cleanLine.includes('{')) {
        currentClass = {
          name: classMatch[3],
          startLine: i + 1,
          endLine: -1,
          lineCount: 0,
          methodCount: 0,
          propertyCount: 0
        };
        braceDepth = 1;
      } else if (currentClass) {
        // ブレースのカウント
        braceDepth += (cleanLine.match(/\{/g) || []).length;
        braceDepth -= (cleanLine.match(/\}/g) || []).length;
        
        // メソッドとプロパティのカウント
        if (cleanLine.match(/^\s*(public|private|protected)?\s*(static)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/)) {
          currentClass.methodCount++;
        } else if (cleanLine.match(/^\s*(public|private|protected)?\s*(static)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*[=:]/)) {
          currentClass.propertyCount++;
        }
        
        if (braceDepth === 0) {
          currentClass.endLine = i + 1;
          currentClass.lineCount = currentClass.endLine - currentClass.startLine + 1;
          classes.push(currentClass);
          currentClass = null;
        }
      }
    }
    
    return classes;
  }
  
  private calculateGodClassScore(cls: { methodCount: number; lineCount: number; propertyCount: number }): number {
    // God Classスコアの計算（0-1の範囲）
    let score = 0;
    
    // メソッド数に基づくスコア
    if (cls.methodCount > 30) score += 0.4;
    else if (cls.methodCount > 20) score += 0.3;
    else if (cls.methodCount > 15) score += 0.2;
    
    // 行数に基づくスコア
    if (cls.lineCount > 500) score += 0.3;
    else if (cls.lineCount > 300) score += 0.2;
    else if (cls.lineCount > 200) score += 0.1;
    
    // プロパティ数に基づくスコア
    if (cls.propertyCount > 20) score += 0.2;
    else if (cls.propertyCount > 15) score += 0.15;
    else if (cls.propertyCount > 10) score += 0.1;
    
    // 総合的な複雑さ
    const overallComplexity = (cls.methodCount * cls.propertyCount) / Math.max(1, cls.lineCount);
    if (overallComplexity > 0.5) score += 0.1;
    
    return Math.min(1, score);
  }
  
  private analyzeConditionComplexity(line: string): { score: number; operators: number } {
    const operators = ['&&', '||', '?', ':', '??', '?.'];
    let operatorCount = 0;
    let nestingLevel = 0;
    
    for (const op of operators) {
      const matches = line.split(op).length - 1;
      operatorCount += matches;
      
      if (op === '&&' || op === '||') {
        nestingLevel += matches * 0.5;
      }
    }
    
    // 括弧のネストレベル
    let parenDepth = 0;
    let maxParenDepth = 0;
    for (const char of line) {
      if (char === '(') {
        parenDepth++;
        maxParenDepth = Math.max(maxParenDepth, parenDepth);
      } else if (char === ')') {
        parenDepth--;
      }
    }
    
    const score = operatorCount + nestingLevel + (maxParenDepth * 0.3);
    return { score, operators: operatorCount };
  }
  
  private detectDuplicateCode(content: string): Array<{
    locations: number[];
    similarity: number;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }> {
    const duplicates: Array<{
      locations: number[];
      similarity: number;
      severity: 'low' | 'medium' | 'high' | 'critical';
    }> = [];
    const lines = content.split('\n');
    const blockSize = 6;
    const codeBlocks = new Map<string, number[]>();
    
    // コードブロックを抽出
    for (let i = 0; i <= lines.length - blockSize; i++) {
      const block = lines.slice(i, i + blockSize)
        .map(line => this.normalizeCodeLine(line))
        .filter(line => line.length > 0)
        .join('\n');
      
      if (block.length > 50) { // 意味のあるコードのみ
        const normalizedBlock = this.normalizeCodeBlock(block);
        if (!codeBlocks.has(normalizedBlock)) {
          codeBlocks.set(normalizedBlock, []);
        }
        codeBlocks.get(normalizedBlock)!.push(i + 1);
      }
    }
    
    // 重複を検出
    codeBlocks.forEach((locations, block) => {
      if (locations.length > 1) {
        const similarity = this.calculateSimilarity(block, block); // 100%
        const severity: 'low' | 'medium' | 'high' | 'critical' = 
          locations.length > 3 ? 'high' :
          block.length > 200 ? 'medium' : 'low';
        
        duplicates.push({
          locations,
          similarity,
          severity
        });
      }
    });
    
    return duplicates;
  }
  
  private normalizeCodeLine(line: string): string {
    return this.removeCommentsAndStrings(line)
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b\d+\b/g, 'NUM') // 数値を正規化
      .replace(/\b[a-zA-Z_$][a-zA-Z0-9_$]*\b/g, 'VAR'); // 変数名を正規化
  }
  
  private normalizeCodeBlock(block: string): string {
    return block
      .replace(/\bvar\s+\w+/g, 'var VAR')
      .replace(/\blet\s+\w+/g, 'let VAR')
      .replace(/\bconst\s+\w+/g, 'const VAR')
      .replace(/\bfunction\s+\w+/g, 'function FUNC');
  }
  
  private calculateSimilarity(text1: string, text2: string): number {
    if (text1 === text2) return 100;
    
    const len1 = text1.length;
    const len2 = text2.length;
    const maxLen = Math.max(len1, len2);
    
    if (maxLen === 0) return 100;
    
    const distance = this.levenshteinDistance(text1, text2);
    return Math.round((1 - distance / maxLen) * 100);
  }
  
  private levenshteinDistance(str1: string, str2: string): number {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }
  
  private detectDeadCode(content: string, filePath: string): Array<{ line: number; description: string }> {
    const deadCode: Array<{ line: number; description: string }> = [];
    const lines = content.split('\n');
    
    let unreachableCode = false;
    
    // 未使用メソッドを検出
    const methods = this.extractMethods(content);
    const methodCalls = content.match(/\.\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/g) || [];
    const functionCalls = content.match(/[a-zA-Z_$][a-zA-Z0-9_$]*\s*\(/g) || [];
    
    for (const method of methods) {
      const isUsed = methodCalls.some(call => call.includes(method.name)) || 
                     functionCalls.some(call => call.includes(method.name)) ||
                     method.name === 'constructor' || // コンストラクタは除外
                     content.includes(`export `) && content.includes(method.name); // エクスポートされるメソッドは除外
      
      if (!isUsed && !method.name.startsWith('test') && method.name !== 'main') {
        deadCode.push({
          line: method.startLine,
          description: `Unused method: ${method.name}`
        });
      }
    }
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line).trim();
      
      if (!cleanLine) continue;
      
      // return, throw, break, continue の後のコードは到達不能
      if (cleanLine.match(/^\s*(return|throw|break|continue)\b/) && !cleanLine.endsWith('{')) {
        unreachableCode = true;
        continue;
      }
      
      // ブロックの終了でリセット
      if (cleanLine.includes('}')) {
        unreachableCode = false;
      }
      
      // 新しいブロックの開始でリセット
      if (cleanLine.includes('{')) {
        unreachableCode = false;
      }
      
      // 到達不能コードを検出
      if (unreachableCode && !cleanLine.match(/^\s*[})]/) && cleanLine.length > 0) {
        deadCode.push({
          line: i + 1,
          description: `Unreachable code: ${cleanLine.substring(0, 50)}${cleanLine.length > 50 ? '...' : ''}`
        });
      }
      
      // 未使用変数の簡単な検出（完全ではない）
      const varMatch = cleanLine.match(/^\s*(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/);
      if (varMatch) {
        const varName = varMatch[2];
        const restOfFile = lines.slice(i + 1).join('\n');
        if (!restOfFile.includes(varName)) {
          deadCode.push({
            line: i + 1,
            description: `Unused variable: ${varName}`
          });
        }
      }
    }
    
    return deadCode;
  }
  
  private detectMagicNumbers(content: string, filePath: string): Array<{ line: number; value: string }> {
    const magicNumbers: Array<{ line: number; value: string }> = [];
    const lines = content.split('\n');
    
    // 一般的な定数は除外
    const commonConstants = new Set(['0', '1', '2', '10', '100', '1000', '-1', '0.0', '1.0']);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // 数値リテラルを検出
      const numberMatches = cleanLine.match(/\b\d+(\.\d+)?\b/g);
      if (numberMatches) {
        for (const match of numberMatches) {
          if (!commonConstants.has(match) && 
              !cleanLine.includes(`const`) && 
              !cleanLine.includes(`enum`) &&
              !cleanLine.includes(`#define`)) {
            magicNumbers.push({
              line: i + 1,
              value: match
            });
          }
        }
      }
    }
    
    return magicNumbers;
  }

  private async generateOptimizationSuggestions(
    data: IntelligentReadResult,
    codeSmells: CodeSmell[]
  ): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Add test coverage suggestion if no tests found
    if (!data.content.includes('test') && !data.content.includes('spec')) {
      suggestions.push({
        type: 'testing',
        priority: 'high',
        title: 'Add unit tests',
        description: 'No tests detected for this file',
        estimatedImpact: 'Improves code reliability and prevents regressions',
        implementation: 'Create test files with comprehensive test cases'
      });
    }

    // Add documentation suggestion if limited comments
    const commentLines = (data.content.match(/\/\/|\/\*|\*/g) || []).length;
    const totalLines = data.content.split('\n').length;
    if (commentLines / totalLines < 0.1) {
      suggestions.push({
        type: 'maintainability',
        priority: 'medium',
        title: 'Improve documentation',
        description: 'Limited documentation detected',
        estimatedImpact: 'Improves code maintainability and onboarding',
        implementation: 'Add JSDoc comments and inline documentation'
      });
    }

    return suggestions;
  }

  private async analyzeBugPatterns(data: IntelligentReadResult): Promise<BugPrediction[]> {
    const predictions: BugPrediction[] = [];
    const lines = data.content.split('\n');
    
    // 1. Null/undefined アテクセスの高度な検出
    predictions.push(...this.analyzeNullPointerRisks(data));
    
    // 2. 配列範囲外アクセスの高度な検出
    predictions.push(...this.analyzeArrayBoundsRisks(data));
    
    // 3. リソースリークの検出
    predictions.push(...this.analyzeResourceLeaks(data));
    
    // 4. 型不整合の検出
    predictions.push(...this.analyzeTypeInconsistencies(data));
    
    // 5. 非同期コードの問題
    predictions.push(...this.analyzeAsyncIssues(data));
    
    // 6. メモリリークの検出
    predictions.push(...this.analyzeMemoryLeaks(data));
    
    // 7. セキュリティの脆弱性
    predictions.push(...this.analyzeSecurityVulnerabilities(data));
    
    return predictions;
  }
  
  private analyzeNullPointerRisks(data: IntelligentReadResult): BugPrediction[] {
    const predictions: BugPrediction[] = [];
    const lines = data.content.split('\n');

    // より広範囲なnullポインターパターンを検出
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // プロパティアクセスパターン
      if (line.match(/\w+\.\w+/)) {
        // null/undefinedチェックがない場合
        if (!line.includes('?.') && !line.includes('null') && !line.includes('undefined')) {
          predictions.push({
            type: 'null-pointer',
            severity: 'high',
            location: { file: data.path, line: i + 1 },
            description: 'Potential null/undefined property access',
            likelihood: 0.8,
            prevention: 'Add null check or use optional chaining'
          });
        }
      }

      // メソッド呼び出しパターン  
      if (line.match(/\w+\.\w+\(/)) {
        if (!line.includes('?.') && !line.includes('null') && !line.includes('undefined')) {
          predictions.push({
            type: 'null-pointer',
            severity: 'high', 
            location: { file: data.path, line: i + 1 },
            description: 'Potential null/undefined method call',
            likelihood: 0.8,
            prevention: 'Add appropriate safety checks'
          });
        }
      }

      // 配列アクセスパターン
      if (line.match(/\w+\[\w+\]/)) {
        predictions.push({
          type: 'array-out-of-bounds',
          severity: 'medium',
          location: { file: data.path, line: i + 1 },
          description: 'Potential array index out of bounds',
          likelihood: 0.8,
            prevention: 'Add appropriate safety checks'
          });
      }

      // リソースリークパターン（より広範囲に検索）
      if (line.match(/createReadStream|createWriteStream|open|createConnection/) && !lines.slice(i, Math.min(i + 20, lines.length)).some(l => l.includes('close') || l.includes('.end(') || l.includes('.destroy('))) {
        predictions.push({
          type: 'resource-leak',
          severity: 'medium',
          location: { file: data.path, line: i + 1 },
          description: 'Potential resource leak - resource not properly closed',
          likelihood: 0.8,
            prevention: 'Add appropriate safety checks'
          });
      }
    }
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // オブジェクトプロパティアクセスを検出
      const propertyAccess = cleanLine.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\.(\w+)/g) || [];
      
      for (const access of propertyAccess) {
        const [, objectName, property] = access.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\.(\w+)/) || [];
        if (!objectName || !property) continue;
        
        // Nullチェックの存在を確認
        const hasNullCheck = this.hasNullCheck(lines, i, objectName);
        const hasOptionalChaining = access.includes('?.');
        const isParameter = this.isParameter(lines, objectName);
        const isFromExternalSource = this.isFromExternalSource(lines, objectName);
        
        if (!hasNullCheck && !hasOptionalChaining) {
          let likelihood = 0.2; // 基本確率
          
          // リスクファクターで確率を調整
          if (isParameter) likelihood += 0.3;
          if (isFromExternalSource) likelihood += 0.4;
          if (this.isInConditionalBlock(lines, i)) likelihood -= 0.1;
          if (this.hasTypeGuard(lines, i, objectName)) likelihood -= 0.2;
          
          predictions.push({
            likelihood: Math.min(0.95, likelihood),
            type: 'NullPointerException',
            description: `Potential null/undefined access: ${access}. Object '${objectName}' may be null or undefined`,
            location: {
              file: data.path,
              line: i + 1
            },
            prevention: `Add null check: if (${objectName}) { ... } or use optional chaining: ${objectName}?.${property}`
          });
        }
      }
      
      // メソッドチェーンの検出
      const methodChains = cleanLine.match(/\b\w+(?:\.\w+){2,}/g) || [];
      for (const chain of methodChains) {
        if (!chain.includes('?.')) {
          predictions.push({
            likelihood: 0.4,
            type: 'NullPointerException',
            description: `Long method chain without null safety: ${chain}`,
            location: {
              file: data.path,
              line: i + 1
            },
            prevention: 'Use optional chaining or break into multiple null-safe steps'
          });
        }
      }
    }
    
    return predictions;
  }
  
  private analyzeArrayBoundsRisks(data: IntelligentReadResult): BugPrediction[] {
    const predictions: BugPrediction[] = [];
    const lines = data.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // 配列アクセスパターンを検出
      const arrayAccess = cleanLine.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\[([^\]]+)\]/g) || [];
      
      for (const access of arrayAccess) {
        const match = access.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\[([^\]]+)\]/);
        if (!match) continue;
        
        const [, arrayName, indexExpr] = match;
        
        // バウンドチェックの存在を確認
        const hasBoundsCheck = this.hasBoundsCheck(lines, i, arrayName, indexExpr);
        const isNumericIndex = /^\d+$/.test(indexExpr.trim());
        const isDynamicIndex = !isNumericIndex;
        
        if (!hasBoundsCheck) {
          let likelihood = 0.2;
          
          // リスクファクター
          if (isDynamicIndex) likelihood += 0.3;
          if (this.isInLoop(lines, i)) likelihood += 0.2;
          if (this.isUserInput(indexExpr)) likelihood += 0.3;
          
          predictions.push({
            likelihood: Math.min(0.9, likelihood),
            type: 'ArrayIndexOutOfBounds',
            description: `Potential array bounds violation: ${access}. Index '${indexExpr}' may exceed array bounds`,
            location: {
              file: data.path,
              line: i + 1
            },
            prevention: `Add bounds check: if (${indexExpr} < ${arrayName}.length) { ... } or use safe access method`
          });
        }
      }
      
      // 配列メソッドの危険な使用
      if (cleanLine.includes('.pop()') || cleanLine.includes('.shift()')) {
        const hasEmptyCheck = this.hasEmptyArrayCheck(lines, i);
        if (!hasEmptyCheck) {
          predictions.push({
            likelihood: 0.3,
            type: 'ArrayIndexOutOfBounds',
            description: 'pop() or shift() called on potentially empty array',
            location: {
              file: data.path,
              line: i + 1
            },
            prevention: 'Check array length before calling pop() or shift()'
          });
        }
      }
    }
    
    return predictions;
  }
  
  private analyzeResourceLeaks(data: IntelligentReadResult): BugPrediction[] {
    const predictions: BugPrediction[] = [];
    const lines = data.content.split('\n');
    
    // リソースを作成するメソッドと対応するクリーンアップメソッド
    const resourceMethods = {
      'createReadStream': ['close', 'destroy'],
      'createWriteStream': ['close', 'end', 'destroy'],
      'connect': ['close', 'end', 'disconnect'],
      'open': ['close'],
      'createConnection': ['close', 'end'],
      'setTimeout': ['clearTimeout'],
      'setInterval': ['clearInterval'],
      'addEventListener': ['removeEventListener'],
      'subscribe': ['unsubscribe'],
      'watch': ['unwatch', 'close']
    };
    
    const resourceUsage = new Map<string, { line: number; varName?: string }>();
    
    // リソースの使用を追跡
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      for (const [resourceMethod, cleanupMethods] of Object.entries(resourceMethods)) {
        if (cleanLine.includes(resourceMethod)) {
          const varMatch = cleanLine.match(new RegExp(`(const|let|var)\\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\\s*=.*${resourceMethod}`));
          const varName = varMatch ? varMatch[2] : undefined;
          
          resourceUsage.set(resourceMethod, { line: i + 1, varName });
          
          // クリーンアップの存在を確認
          const hasCleanup = cleanupMethods.some(cleanup => {
            if (varName) {
              return data.content.includes(`${varName}.${cleanup}`) ||
                     data.content.includes(`${varName}?.${cleanup}`);
            }
            return data.content.includes(cleanup);
          });
          
          const inTryFinally = this.isInTryFinallyBlock(lines, i);
          const inDestructor = this.isInDestructor(lines, i);
          
          if (!hasCleanup && !inTryFinally && !inDestructor) {
            let likelihood = 0.6;
            
            // リスクファクター
            if (resourceMethod.includes('Stream') || resourceMethod.includes('Connection')) {
              likelihood += 0.2;
            }
            if (this.isInAsyncFunction(lines, i)) {
              likelihood += 0.1;
            }
            
            predictions.push({
              likelihood: Math.min(0.95, likelihood),
              type: 'ResourceLeak',
              description: `Potential resource leak: ${resourceMethod} without proper cleanup`,
              location: {
              file: data.path,
              line: i + 1
            },
              prevention: `Ensure resource is properly closed using ${cleanupMethods.join(' or ')} in a finally block or use try-with-resources pattern`
            });
          }
        }
      }
    }
    
    return predictions;
  }
  
  private analyzeTypeInconsistencies(data: IntelligentReadResult): BugPrediction[] {
    const predictions: BugPrediction[] = [];
    const lines = data.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // 型安全でない演算を検出
      const dangerousComparisons = [
        /==\s*null/g,
        /!=\s*null/g,
        /==\s*undefined/g,
        /!=\s*undefined/g
      ];
      
      for (const pattern of dangerousComparisons) {
        if (pattern.test(cleanLine)) {
          predictions.push({
            likelihood: 0.4,
            type: 'TypeInconsistency',
            description: 'Use of non-strict equality operator may cause type coercion issues',
            location: {
              file: data.path,
              line: i + 1
            },
            prevention: 'Use strict equality (=== or !==) for safer type comparisons'
          });
        }
      }
      
      // 暗黙の型変換を検出
      if (cleanLine.includes('parseInt') && !cleanLine.includes(', 10')) {
        predictions.push({
          likelihood: 0.3,
          type: 'TypeInconsistency',
          description: 'parseInt without radix parameter may cause unexpected behavior',
          location: {
            file: data.path,
            line: i + 1
          },
          prevention: 'Always specify radix parameter: parseInt(value, 10)'
        });
      }
      
      // JSON.parse の危険な使用
      if (cleanLine.includes('JSON.parse') && !this.hasJsonParseErrorHandling(lines, i)) {
        predictions.push({
          likelihood: 0.5,
          type: 'TypeInconsistency',
          description: 'JSON.parse without error handling may throw unexpected exceptions',
          location: {
            file: data.path,
            line: i + 1
          },
          prevention: 'Wrap JSON.parse in try-catch block or validate input first'
        });
      }
    }
    
    return predictions;
  }
  
  private analyzeAsyncIssues(data: IntelligentReadResult): BugPrediction[] {
    const predictions: BugPrediction[] = [];
    const lines = data.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // async/await の問題を検出
      if (cleanLine.includes('await') && !this.isInAsyncFunction(lines, i)) {
        predictions.push({
          likelihood: 0.9,
          type: 'AsyncIssue',
          description: 'await used outside of async function',
          location: {
            file: data.path,
            line: i + 1
          },
          prevention: 'Use await only inside async functions or use Promise.then()'
        });
      }
      
      // Promise のエラーハンドリングがない
      if (cleanLine.includes('.then(') && !cleanLine.includes('.catch(') && 
          !this.hasPromiseErrorHandling(lines, i)) {
        predictions.push({
          likelihood: 0.6,
          type: 'AsyncIssue',
          description: 'Promise without error handling (.catch or try-catch)',
          location: {
            file: data.path,
            line: i + 1
          },
          prevention: 'Add .catch() handler or use try-catch with async/await'
        });
      }
      
      // コールバック地獄の可能性
      const callbackDepth = this.calculateCallbackDepth(lines, i);
      if (callbackDepth > 3) {
        predictions.push({
          likelihood: 0.4,
          type: 'AsyncIssue',
          description: `Deeply nested callbacks detected (depth: ${callbackDepth})`,
          location: {
            file: data.path,
            line: i + 1
          },
          prevention: 'Consider using Promises or async/await to flatten callback structure'
        });
      }
    }
    
    return predictions;
  }
  
  private analyzeMemoryLeaks(data: IntelligentReadResult): BugPrediction[] {
    const predictions: BugPrediction[] = [];
    const lines = data.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // グローバル変数の使用
      if (cleanLine.match(/^\s*(var|let|const)\s+\w+\s*=.*\[\]/) && 
          this.isGlobalScope(lines, i)) {
        predictions.push({
          likelihood: 0.3,
          type: 'MemoryLeak',
          description: 'Global array that may grow indefinitely',
          location: {
            file: data.path,
            line: i + 1
          },
          prevention: 'Consider using local scope or implementing size limits'
        });
      }
      
      // DOM イベントリスナーのリーク
      if (cleanLine.includes('addEventListener') && 
          !data.content.includes('removeEventListener')) {
        predictions.push({
          likelihood: 0.5,
          type: 'MemoryLeak',
          description: 'Event listener added without corresponding removal',
          location: {
            file: data.path,
            line: i + 1
          },
          prevention: 'Add removeEventListener in cleanup or use AbortController'
        });
      }
      
      // クロージャでの循環参照
      if (cleanLine.includes('setInterval') && cleanLine.includes('=>')) {
        predictions.push({
          likelihood: 0.4,
          type: 'MemoryLeak',
          description: 'setInterval with arrow function may create closure memory leak',
          location: {
            file: data.path,
            line: i + 1
          },
          prevention: 'Use clearInterval and avoid capturing unnecessary variables in closure'
        });
      }
    }
    
    return predictions;
  }
  
  private analyzeSecurityVulnerabilities(data: IntelligentReadResult): BugPrediction[] {
    const predictions: BugPrediction[] = [];
    const lines = data.content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // eval() の使用
      if (cleanLine.includes('eval(')) {
        predictions.push({
          likelihood: 0.9,
          type: 'SecurityVulnerability',
          description: 'Use of eval() poses serious security risks',
          location: {
            file: data.path,
            line: i + 1
          },
          prevention: 'Avoid eval(). Use JSON.parse() for data or safer alternatives'
        });
      }
      
      // innerHTML の使用
      if (cleanLine.includes('.innerHTML') && !cleanLine.includes('DOMPurify')) {
        predictions.push({
          likelihood: 0.6,
          type: 'SecurityVulnerability',
          description: 'Direct innerHTML assignment may lead to XSS attacks',
          location: {
            file: data.path,
            line: i + 1
          },
          prevention: 'Use textContent, insertAdjacentHTML, or sanitize with DOMPurify'
        });
      }
      
      // ハードコードされたシークレット
      const secretPatterns = [
        /password\s*[=:]\s*["'][^"']+["']/i,
        /api_key\s*[=:]\s*["'][^"']+["']/i,
        /secret\s*[=:]\s*["'][^"']+["']/i,
        /token\s*[=:]\s*["'][^"']+["']/i
      ];
      
      for (const pattern of secretPatterns) {
        if (pattern.test(cleanLine)) {
          predictions.push({
            likelihood: 0.8,
            type: 'SecurityVulnerability',
            description: 'Hardcoded credentials detected in source code',
            location: {
              file: data.path,
              line: i + 1
            },
            prevention: 'Move credentials to environment variables or secure configuration'
          });
        }
      }
    }
    
    return predictions;
  }
  
  // Helper methods for bug prediction
  private hasNullCheck(lines: string[], currentLine: number, objectName: string): boolean {
    for (let i = Math.max(0, currentLine - 5); i < currentLine; i++) {
      const line = lines[i];
      if (line.includes(`if (${objectName})`) ||
          line.includes(`if (${objectName} != null)`) ||
          line.includes(`if (${objectName} !== null)`) ||
          line.includes(`if (${objectName} && `)) {
        return true;
      }
    }
    return false;
  }
  
  private isParameter(lines: string[], varName: string): boolean {
    for (const line of lines) {
      if (line.includes(`function`) && line.includes(`(`) && line.includes(varName)) {
        return true;
      }
    }
    return false;
  }
  
  private isFromExternalSource(lines: string[], varName: string): boolean {
    const externalSources = ['fetch', 'axios', 'request', '.get', '.post', '.json()'];
    return lines.some(line => 
      line.includes(varName) && 
      externalSources.some(source => line.includes(source))
    );
  }
  
  private isInConditionalBlock(lines: string[], currentLine: number): boolean {
    for (let i = currentLine - 1; i >= Math.max(0, currentLine - 10); i--) {
      if (lines[i].trim().startsWith('if') || lines[i].trim().startsWith('else')) {
        return true;
      }
    }
    return false;
  }
  
  private hasTypeGuard(lines: string[], currentLine: number, varName: string): boolean {
    for (let i = Math.max(0, currentLine - 3); i < currentLine; i++) {
      const line = lines[i];
      if (line.includes(`typeof ${varName}`) || 
          line.includes(`${varName} instanceof`) ||
          line.includes(`Array.isArray(${varName})`)) {
        return true;
      }
    }
    return false;
  }
  
  private hasBoundsCheck(lines: string[], currentLine: number, arrayName: string, indexExpr: string): boolean {
    for (let i = Math.max(0, currentLine - 3); i < currentLine; i++) {
      const line = lines[i];
      if (line.includes(`${indexExpr} < ${arrayName}.length`) ||
          line.includes(`${arrayName}.length > ${indexExpr}`) ||
          line.includes(`${arrayName}[${indexExpr}]`)) {
        return true;
      }
    }
    return false;
  }
  
  private isInLoop(lines: string[], currentLine: number): boolean {
    for (let i = currentLine - 1; i >= Math.max(0, currentLine - 10); i--) {
      const line = lines[i].trim();
      if (line.startsWith('for') || line.startsWith('while') || line.includes('.forEach')) {
        return true;
      }
    }
    return false;
  }
  
  private isUserInput(indexExpr: string): boolean {
    const userInputSources = ['input', 'prompt', 'argv', 'params', 'query', 'body'];
    return userInputSources.some(source => indexExpr.includes(source));
  }
  
  private hasEmptyArrayCheck(lines: string[], currentLine: number): boolean {
    for (let i = Math.max(0, currentLine - 3); i < currentLine; i++) {
      const line = lines[i];
      if (line.includes('.length > 0') || line.includes('.length !== 0')) {
        return true;
      }
    }
    return false;
  }
  
  private isInTryFinallyBlock(lines: string[], currentLine: number): boolean {
    let inTry = false;
    let hasFinallyBlock = false;
    
    for (let i = Math.max(0, currentLine - 20); i < Math.min(lines.length, currentLine + 20); i++) {
      const line = lines[i].trim();
      if (line.startsWith('try')) inTry = true;
      if (line.startsWith('finally')) hasFinallyBlock = true;
    }
    
    return inTry && hasFinallyBlock;
  }
  
  private isInDestructor(lines: string[], currentLine: number): boolean {
    for (let i = Math.max(0, currentLine - 10); i < currentLine; i++) {
      const line = lines[i];
      if (line.includes('destructor') || line.includes('dispose') || line.includes('cleanup')) {
        return true;
      }
    }
    return false;
  }
  
  private isInAsyncFunction(lines: string[], currentLine: number): boolean {
    for (let i = currentLine - 1; i >= Math.max(0, currentLine - 20); i--) {
      const line = lines[i];
      if (line.includes('async function') || line.includes('async ')) {
        return true;
      }
    }
    return false;
  }
  
  private hasJsonParseErrorHandling(lines: string[], currentLine: number): boolean {
    for (let i = Math.max(0, currentLine - 3); i <= Math.min(lines.length - 1, currentLine + 3); i++) {
      const line = lines[i];
      if (line.includes('try') || line.includes('catch')) {
        return true;
      }
    }
    return false;
  }
  
  private hasPromiseErrorHandling(lines: string[], currentLine: number): boolean {
    for (let i = currentLine; i < Math.min(lines.length, currentLine + 5); i++) {
      const line = lines[i];
      if (line.includes('.catch(') || line.includes('try') || line.includes('catch')) {
        return true;
      }
    }
    return false;
  }
  
  private calculateCallbackDepth(lines: string[], currentLine: number): number {
    let depth = 0;
    let braceDepth = 0;
    
    for (let i = currentLine; i >= Math.max(0, currentLine - 20); i--) {
      const line = lines[i];
      const cleanLine = this.removeCommentsAndStrings(line);
      
      if (cleanLine.includes('function') && cleanLine.includes('){')) {
        depth++;
      }
      
      braceDepth += (cleanLine.match(/\{/g) || []).length;
      braceDepth -= (cleanLine.match(/\}/g) || []).length;
      
      if (braceDepth <= 0) break;
    }
    
    return depth;
  }
  
  private isGlobalScope(lines: string[], currentLine: number): boolean {
    let braceDepth = 0;
    
    for (let i = 0; i < currentLine; i++) {
      const line = lines[i];
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
    }
    
    return braceDepth === 0;
  }

  private getLineNumber(content: string, searchStr: string): number {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(searchStr)) {
        return i + 1;
      }
    }
    return 0;
  }

  private enhancePredictions(
    predictions: BugPrediction[],
    historicalErrors: any[]
  ): BugPrediction[] {
    // 過去のエラーパターンに基づいて予測の確率を調整
    return predictions.map(pred => {
      const similar = historicalErrors.find(err => 
        err.type === pred.type || err.description.includes(pred.type)
      );
      
      if (similar) {
        return {
          ...pred,
          likelihood: Math.min(1, pred.likelihood * 1.5),
          prevention: `${pred.prevention}. Previous occurrence: ${similar.solution || ''}`
        };
      }
      
      return pred;
    });
  }

  private async analyzeFileArchitecture(data: IntelligentReadResult): Promise<{
    patterns: DesignPattern[];
    antiPatterns: AntiPattern[];
  }> {
    const patterns: DesignPattern[] = [];
    const antiPatterns: AntiPattern[] = [];
    const content = data.content;
    
    // デザインパターンの検出
    patterns.push(...this.detectCreationalPatterns(content, data.path));
    patterns.push(...this.detectStructuralPatterns(content, data.path));
    patterns.push(...this.detectBehavioralPatterns(content, data.path));
    
    // アンチパターンの検出
    antiPatterns.push(...this.detectAntiPatterns(content, data.path));
    
    return { patterns, antiPatterns };
  }
  
  private detectCreationalPatterns(content: string, filePath: string): DesignPattern[] {
    const patterns: DesignPattern[] = [];
    
    // Singleton パターン
    if (this.detectSingletonPattern(content)) {
      patterns.push({
        name: 'Singleton',
        type: 'creational',
        location: filePath,
        quality: this.evaluateSingletonQuality(content)
      });
    }
    
    // Factory Method パターン
    if (this.detectFactoryPattern(content)) {
      patterns.push({
        name: 'Factory Method',
        type: 'creational',
        location: filePath,
        quality: this.evaluateFactoryQuality(content)
      });
    }
    
    // Builder パターン
    if (this.detectBuilderPattern(content)) {
      patterns.push({
        name: 'Builder',
        type: 'creational',
        location: filePath,
        quality: 'good'
      });
    }
    
    return patterns;
  }
  
  private detectStructuralPatterns(content: string, filePath: string): DesignPattern[] {
    const patterns: DesignPattern[] = [];
    
    // Adapter パターン
    if (this.detectAdapterPattern(content)) {
      patterns.push({
        name: 'Adapter',
        type: 'structural',
        location: filePath,
        quality: 'good'
      });
    }
    
    // Decorator パターン
    if (this.detectDecoratorPattern(content)) {
      patterns.push({
        name: 'Decorator',
        type: 'structural',
        location: filePath,
        quality: 'good'
      });
    }
    
    // Facade パターン
    if (this.detectFacadePattern(content)) {
      patterns.push({
        name: 'Facade',
        type: 'structural',
        location: filePath,
        quality: 'good'
      });
    }
    
    return patterns;
  }
  
  private detectBehavioralPatterns(content: string, filePath: string): DesignPattern[] {
    const patterns: DesignPattern[] = [];
    
    // Observer パターン
    if (this.detectObserverPattern(content)) {
      patterns.push({
        name: 'Observer',
        type: 'behavioral',
        location: filePath,
        quality: this.evaluateObserverQuality(content)
      });
    }
    
    // Strategy パターン
    if (this.detectStrategyPattern(content)) {
      patterns.push({
        name: 'Strategy',
        type: 'behavioral',
        location: filePath,
        quality: 'good'
      });
    }
    
    // Command パターン
    if (this.detectCommandPattern(content)) {
      patterns.push({
        name: 'Command',
        type: 'behavioral',
        location: filePath,
        quality: 'good'
      });
    }
    
    // State パターン
    if (this.detectStatePattern(content)) {
      patterns.push({
        name: 'State',
        type: 'behavioral',
        location: filePath,
        quality: 'good'
      });
    }
    
    return patterns;
  }
  
  private detectAntiPatterns(content: string, filePath: string): AntiPattern[] {
    const antiPatterns: AntiPattern[] = [];
    const classes = this.extractClasses(content);
    const methods = this.extractMethods(content);
    
    // God Class
    for (const cls of classes) {
      if (cls.methodCount > 20 || cls.lineCount > 300) {
        antiPatterns.push({
          name: 'God Class',
          severity: cls.methodCount > 30 ? 'high' : 'medium',
          location: filePath,
          impact: 'Reduces maintainability, testability, and violates Single Responsibility Principle',
          solution: 'Split into smaller, cohesive classes. Extract related methods into separate classes.'
        });
      }
    }
    
    // Spaghetti Code
    const spaghettiScore = this.calculateSpaghettiScore(content);
    if (spaghettiScore > 0.7) {
      antiPatterns.push({
        name: 'Spaghetti Code',
        severity: spaghettiScore > 0.9 ? 'high' : 'medium',
        location: filePath,
        impact: 'Makes code difficult to understand, maintain, and debug',
        solution: 'Refactor into structured functions/methods. Use proper control flow and eliminate goto-like patterns.'
      });
    }
    
    // Blob Object
    const blobScore = this.calculateBlobScore(content, classes);
    if (blobScore > 0.6) {
      antiPatterns.push({
        name: 'The Blob',
        severity: 'medium',
        location: filePath,
        impact: 'Centralizes too much functionality in one place, making it hard to maintain',
        solution: 'Distribute responsibilities across multiple specialized objects'
      });
    }
    
    // Lava Flow
    if (this.detectLavaFlow(content)) {
      antiPatterns.push({
        name: 'Lava Flow',
        severity: 'medium',
        location: filePath,
        impact: 'Dead code and obsolete constructs make the system harder to maintain',
        solution: 'Remove dead code and refactor obsolete patterns to modern alternatives'
      });
    }
    
    // Golden Hammer
    if (this.detectGoldenHammer(content)) {
      antiPatterns.push({
        name: 'Golden Hammer',
        severity: 'low',
        location: filePath,
        impact: 'Over-reliance on familiar solutions may not be optimal for all problems',
        solution: 'Evaluate different approaches and choose the most appropriate solution for each problem'
      });
    }
    
    return antiPatterns;
  }
  
  // Design Pattern Detection Methods
  private detectSingletonPattern(content: string): boolean {
    return (
      content.includes('getInstance') &&
      (content.includes('private constructor') || content.includes('private static instance')) ||
      content.match(/static\s+\w+\s*:\s*\w+\s*=.*new\s+\w+/) !== null
    );
  }
  
  private detectFactoryPattern(content: string): boolean {
    return (
      (content.includes('createObject') || content.includes('create') || content.includes('factory')) &&
      (content.includes('switch') || content.includes('if')) &&
      content.includes('new ')
    );
  }
  
  private detectBuilderPattern(content: string): boolean {
    return (
      content.includes('builder') || 
      (content.includes('build()') && content.includes('with')) ||
      content.match(/\.\w+\([^)]*\)\.\w+\([^)]*\)\.build\(\)/) !== null
    );
  }
  
  private detectAdapterPattern(content: string): boolean {
    return (
      content.includes('adapter') ||
      content.includes('Adapter') ||
      (content.includes('implements') && content.includes('constructor') && content.includes('this.'))
    );
  }
  
  private detectDecoratorPattern(content: string): boolean {
    return (
      content.includes('decorator') ||
      content.includes('Decorator') ||
      content.includes('@') || // TypeScript decorators
      (content.includes('wrap') && content.includes('component'))
    );
  }
  
  private detectFacadePattern(content: string): boolean {
    const hasMultipleSubsystemCalls = (content.match(/this\.[a-zA-Z_$][a-zA-Z0-9_$]*\.[a-zA-Z_$]/g) || []).length > 5;
    const hasSimplifiedInterface = content.includes('facade') || content.includes('Facade');
    return hasMultipleSubsystemCalls || hasSimplifiedInterface;
  }
  
  private detectObserverPattern(content: string): boolean {
    const hasSubscribe = content.includes('subscribe') || content.includes('addListener') || content.includes('on(');
    const hasNotify = content.includes('notify') || content.includes('emit') || content.includes('trigger');
    return hasSubscribe && hasNotify;
  }
  
  private detectStrategyPattern(content: string): boolean {
    return (
      content.includes('strategy') ||
      content.includes('Strategy') ||
      (content.includes('interface') && content.includes('execute')) ||
      content.match(/switch.*strategy|if.*strategy/) !== null
    );
  }
  
  private detectCommandPattern(content: string): boolean {
    return (
      content.includes('command') ||
      content.includes('Command') ||
      (content.includes('execute') && content.includes('undo')) ||
      content.includes('invoker')
    );
  }
  
  private detectStatePattern(content: string): boolean {
    return (
      content.includes('state') ||
      content.includes('State') ||
      content.includes('currentState') ||
      content.match(/setState|changeState/) !== null
    );
  }
  
  // Quality Evaluation Methods
  private evaluateSingletonQuality(content: string): 'good' | 'acceptable' | 'needs-improvement' {
    const hasThreadSafety = content.includes('synchronized') || content.includes('lock');
    const hasLazyInit = content.includes('if (!instance)');
    const isSimple = !content.includes('inheritance');
    
    if (hasThreadSafety && hasLazyInit && isSimple) return 'good';
    if (hasLazyInit || isSimple) return 'acceptable';
    return 'needs-improvement';
  }
  
  private evaluateFactoryQuality(content: string): 'good' | 'acceptable' | 'needs-improvement' {
    const hasAbstraction = content.includes('interface') || content.includes('abstract');
    const hasParameterValidation = content.includes('throw') || content.includes('Error');
    const usesSwitch = content.includes('switch');
    
    if (hasAbstraction && hasParameterValidation) return 'good';
    if (hasAbstraction || usesSwitch) return 'acceptable';
    return 'needs-improvement';
  }
  
  private evaluateObserverQuality(content: string): 'good' | 'acceptable' | 'needs-improvement' {
    const hasProperEventHandling = content.includes('removeListener') || content.includes('unsubscribe');
    const hasWeakReferences = content.includes('WeakMap') || content.includes('WeakSet');
    const hasErrorHandling = content.includes('try') && content.includes('catch');
    
    if (hasProperEventHandling && (hasWeakReferences || hasErrorHandling)) return 'good';
    if (hasProperEventHandling) return 'acceptable';
    return 'needs-improvement';
  }
  
  // Anti-Pattern Scoring Methods
  private calculateSpaghettiScore(content: string): number {
    let score = 0;
    const lines = content.split('\n');
    
    // 長いメソッド
    const methods = this.extractMethods(content);
    const longMethods = methods.filter(m => m.lineCount > 30).length;
    score += (longMethods / Math.max(1, methods.length)) * 0.3;
    
    // 深いネスト
    let maxNesting = 0;
    let currentNesting = 0;
    for (const line of lines) {
      currentNesting += (line.match(/\{/g) || []).length;
      currentNesting -= (line.match(/\}/g) || []).length;
      maxNesting = Math.max(maxNesting, currentNesting);
    }
    if (maxNesting > 5) score += 0.2;
    
    // goto風のコード
    const gotos = (content.match(/break\s+\w+|continue\s+\w+/g) || []).length;
    score += Math.min(0.2, gotos * 0.05);
    
    // 複雑な条件文
    const complexConditions = lines.filter(line => 
      (line.match(/&&|\|\|/g) || []).length > 3
    ).length;
    score += Math.min(0.3, complexConditions * 0.02);
    
    return Math.min(1, score);
  }
  
  private calculateBlobScore(content: string, classes: any[]): number {
    if (classes.length === 0) return 0;
    
    let maxScore = 0;
    
    for (const cls of classes) {
      let score = 0;
      
      // メソッド数
      if (cls.methodCount > 25) score += 0.4;
      else if (cls.methodCount > 15) score += 0.2;
      
      // フィールド数
      if (cls.propertyCount > 20) score += 0.3;
      else if (cls.propertyCount > 10) score += 0.15;
      
      // 行数
      if (cls.lineCount > 500) score += 0.3;
      else if (cls.lineCount > 200) score += 0.15;
      
      maxScore = Math.max(maxScore, score);
    }
    
    return Math.min(1, maxScore);
  }
  
  private detectLavaFlow(content: string): boolean {
    // デッドコードの存在
    const hasDeadCode = content.includes('// TODO: remove') ||
                       content.includes('// FIXME') ||
                       content.includes('// deprecated') ||
                       content.includes('if (false)') ||
                       content.includes('if (0)');
    
    // 古いパターン
    const hasObsoletePatterns = content.includes('var ') || // 古い変数宣言
                               content.includes('arguments') || // 古い関数引数アクセス
                               content.includes('new Array()') || // 古い配列生成
                               content.includes('== null'); // 非推奨の比較
    
    return hasDeadCode || hasObsoletePatterns;
  }
  
  private detectGoldenHammer(content: string): boolean {
    // 同じパターンの過度な使用
    const patterns = [
      /for\s*\(/g,
      /if\s*\(/g,
      /try\s*\{/g,
      /\.map\(/g,
      /\.forEach\(/g
    ];
    
    let totalMatches = 0;
    let dominantPattern = 0;
    
    for (const pattern of patterns) {
      const matches = (content.match(pattern) || []).length;
      totalMatches += matches;
      dominantPattern = Math.max(dominantPattern, matches);
    }
    
    // 1つのパターンが全体の70%以上を占めている場合
    return totalMatches > 10 && (dominantPattern / totalMatches) > 0.7;
  }

  private async analyzeDependencies(projectPath: string): Promise<DependencyIssue[]> {
    const issues: DependencyIssue[] = [];
    
    try {
      // ファイル一覧を取得
      const files = await this.intelligentFS.listProjectFiles(projectPath);
      const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.js'));
      
      // 依存関係グラフを構築
      const dependencyGraph = await this.buildDependencyGraph(tsFiles);
      
      // 循環依存を検出
      issues.push(...this.detectCircularDependencies(dependencyGraph));
      
      // 不安定な依存を検出
      issues.push(...this.detectUnstableDependencies(dependencyGraph));
      
      // 未使用依存を検出
      issues.push(...this.detectUnusedDependencies(dependencyGraph, tsFiles));
      
      // 古い依存を検出
      issues.push(...await this.detectOutdatedDependencies(projectPath));
      
    } catch (error) {
      logger.error('Error analyzing dependencies', error);
    }
    
    return issues;
  }
  
  private async buildDependencyGraph(files: string[]): Promise<Map<string, Set<string>>> {
    const graph = new Map<string, Set<string>>();
    
    for (const file of files) {
      try {
        const result = await this.intelligentFS.readFileIntelligent(file);
        if (!result.success) continue;
        
        const imports = this.extractImports(result.content);
        graph.set(file, new Set(imports));
      } catch (error) {
        logger.warn(`Failed to analyze dependencies for ${file}`, error);
      }
    }
    
    return graph;
  }
  
  private extractImports(content: string): string[] {
    const imports: string[] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      const cleanLine = this.removeCommentsAndStrings(line);
      
      // ES6 import statements
      const es6Match = cleanLine.match(/^\s*import\s+.*from\s+["']([^"']+)["']/);;
      if (es6Match) {
        imports.push(this.normalizePath(es6Match[1]));
      }
      
      // CommonJS require statements
      const requireMatch = cleanLine.match(/require\(["']([^"']+)["']\)/);
      if (requireMatch) {
        imports.push(this.normalizePath(requireMatch[1]));
      }
      
      // Dynamic imports
      const dynamicMatch = cleanLine.match(/import\(["']([^"']+)["']\)/);
      if (dynamicMatch) {
        imports.push(this.normalizePath(dynamicMatch[1]));
      }
    }
    
    return imports;
  }
  
  private normalizePath(importPath: string): string {
    // 相対パスを正規化
    return importPath.replace(/^\.\//g, '').replace(/\.(ts|js)$/, '');
  }
  
  private detectCircularDependencies(graph: Map<string, Set<string>>): DependencyIssue[] {
    const issues: DependencyIssue[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    
    const dfs = (node: string, path: string[]): void => {
      if (visiting.has(node)) {
        // 循環依存を発見
        const cycleStart = path.indexOf(node);
        const cycle = path.slice(cycleStart);
        
        issues.push({
          type: 'circular',
          from: cycle[cycle.length - 1],
          to: node,
          severity: cycle.length > 3 ? 'high' : 'medium',
          recommendation: `Break circular dependency: ${cycle.join(' -> ')} -> ${node}`
        });
        return;
      }
      
      if (visited.has(node)) return;
      
      visiting.add(node);
      const dependencies = graph.get(node) || new Set();
      
      for (const dep of dependencies) {
        if (graph.has(dep)) { // 内部ファイルのみをチェック
          dfs(dep, [...path, node]);
        }
      }
      
      visiting.delete(node);
      visited.add(node);
    };
    
    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }
    
    return issues;
  }
  
  private detectUnstableDependencies(graph: Map<string, Set<string>>): DependencyIssue[] {
    const issues: DependencyIssue[] = [];
    
    // 各ファイルの依存数と被依存数を計算
    const dependencyCount = new Map<string, number>();
    const dependentCount = new Map<string, number>();
    
    // 初期化
    for (const file of graph.keys()) {
      dependencyCount.set(file, 0);
      dependentCount.set(file, 0);
    }
    
    // カウント
    for (const [file, deps] of graph.entries()) {
      dependencyCount.set(file, deps.size);
      for (const dep of deps) {
        if (dependentCount.has(dep)) {
          dependentCount.set(dep, dependentCount.get(dep)! + 1);
        }
      }
    }
    
    // 不安定な依存を検出
    for (const [file, outgoing] of dependencyCount.entries()) {
      const incoming = dependentCount.get(file) || 0;
      
      // 高い出度ファンアウト、低い入度ファンインは不安定
      if (outgoing > 10 && incoming < 2) {
        issues.push({
          type: 'unstable',
          from: file,
          to: '',
          severity: outgoing > 20 ? 'high' : 'medium',
          recommendation: `Consider refactoring ${file}. It depends on too many modules (${outgoing}) but is rarely used (${incoming} dependents)`
        });
      }
      
      // 低い出度ファンアウト、高い入度ファンインは安定だが、設計を再考する余地あり
      if (outgoing === 0 && incoming > 15) {
        issues.push({
          type: 'unstable',
          from: file,
          to: '',
          severity: 'low',
          recommendation: `${file} is heavily used (${incoming} dependents) but has no dependencies. Consider if it's doing too much.`
        });
      }
    }
    
    return issues;
  }
  
  private detectUnusedDependencies(graph: Map<string, Set<string>>, allFiles: string[]): DependencyIssue[] {
    const issues: DependencyIssue[] = [];
    const referencedFiles = new Set<string>();
    
    // 参照されているファイルを集計
    for (const deps of graph.values()) {
      for (const dep of deps) {
        referencedFiles.add(dep);
      }
    }
    
    // 参照されていないファイルを検出
    for (const file of allFiles) {
      const normalizedFile = this.normalizePath(file);
      if (!referencedFiles.has(normalizedFile) && !normalizedFile.includes('index')) {
        issues.push({
          type: 'unused',
          from: file,
          to: '',
          severity: 'low',
          recommendation: `${file} appears to be unused. Consider removing it or check if it should be exported/imported somewhere.`
        });
      }
    }
    
    return issues;
  }
  
  private async detectOutdatedDependencies(projectPath: string): Promise<DependencyIssue[]> {
    const issues: DependencyIssue[] = [];
    
    try {
      // package.jsonを読み込み
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageResult = await this.intelligentFS.readFileSimple(packageJsonPath);
      
      if (!packageResult.success || !packageResult.data) {
        return issues;
      }
      
      const packageJson = JSON.parse(packageResult.data);
      const dependencies = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };
      
      // 古いバージョンパターンを検出
      for (const [name, version] of Object.entries(dependencies)) {
        if (typeof version === 'string') {
          // 古いバージョンフォーマットを検出
          if (version.startsWith('~') || version.startsWith('^')) {
            const versionNumber = version.slice(1);
            const [major] = versionNumber.split('.');
            
            // メジャーバージョンが古すぎる判定（簡単なヒューリスティック）
            const majorNum = parseInt(major, 10);
            if (!isNaN(majorNum) && majorNum < 2 && !name.includes('legacy')) {
              issues.push({
                type: 'outdated',
                from: name,
                to: version,
                severity: 'medium',
                recommendation: `Consider updating ${name} from ${version}. Version ${major}.x might be outdated.`
              });
            }
          }
          
          // 非推奨のパッケージ
          const deprecatedPackages = ['request', 'bower', 'gulp', 'grunt'];
          if (deprecatedPackages.includes(name)) {
            issues.push({
              type: 'outdated',
              from: name,
              to: version,
              severity: 'high',
              recommendation: `${name} is deprecated. Consider migrating to modern alternatives.`
            });
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to analyze package.json', error);
    }
    
    return issues;
  }

  private generateArchitectureRecommendations(analysis: ArchitectureAnalysis): ArchitectureRecommendation[] {
    const recommendations: ArchitectureRecommendation[] = [];

    // Generate recommendations based on patterns and anti-patterns
    if (analysis.antiPatterns.some(p => p.name === 'God Class')) {
      recommendations.push({
        category: 'structure',
        title: 'Apply Single Responsibility Principle',
        description: 'Large classes detected that handle multiple responsibilities',
        benefit: 'Improves maintainability, testability, and code reuse',
        implementation: [
          'Identify distinct responsibilities within large classes',
          'Extract each responsibility into its own class',
          'Use dependency injection to manage dependencies',
          'Create interfaces for better abstraction'
        ]
      });
    }

    if (analysis.dependencies.some(d => d.type === 'circular')) {
      recommendations.push({
        category: 'coupling',
        title: 'Resolve Circular Dependencies',
        description: 'Circular dependencies detected between modules',
        benefit: 'Improves build times and reduces complexity',
        implementation: [
          'Identify the circular dependency chain',
          'Extract shared functionality to a separate module',
          'Use dependency inversion principle',
          'Consider using events or callbacks for decoupling'
        ]
      });
    }

    return recommendations;
  }

  private async analyzeContext(context: string): Promise<{
    language: string;
    purpose: string;
    dependencies: string[];
    patterns: string[];
    complexity: 'simple' | 'medium' | 'complex';
    requirements: {
      hasValidation: boolean;
      hasErrorHandling: boolean;
      hasLogging: boolean;
      hasTests: boolean;
      isAsync: boolean;
      needsTypeScript: boolean;
    };
    codeStyle: {
      preferredNaming: 'camelCase' | 'snake_case' | 'kebab-case';
      useArrowFunctions: boolean;
      useAsyncAwait: boolean;
      preferConst: boolean;
    };
  }> {
    // 高度なコンテキスト解析
    const language = this.detectLanguage(context);
    const purpose = this.detectPurpose(context);
    const dependencies = this.detectDependencies(context);
    const patterns = this.detectRequiredPatterns(context);
    const complexity = this.assessComplexity(context);
    const requirements = this.analyzeRequirements(context);
    const codeStyle = this.analyzeCodeStyle(context);
    
    return {
      language,
      purpose,
      dependencies,
      patterns,
      complexity,
      requirements,
      codeStyle
    };
  }
  
  private detectRequiredPatterns(context: string): string[] {
    const patterns: string[] = [];
    
    // デザインパターンの検出
    if (context.includes('singleton') || context.includes('シングルトン')) patterns.push('Singleton');
    if (context.includes('factory') || context.includes('ファクトリー')) patterns.push('Factory');
    if (context.includes('observer') || context.includes('オブザーバー')) patterns.push('Observer');
    if (context.includes('strategy') || context.includes('ストラテジー')) patterns.push('Strategy');
    if (context.includes('builder') || context.includes('ビルダー')) patterns.push('Builder');
    if (context.includes('adapter') || context.includes('アダプター')) patterns.push('Adapter');
    if (context.includes('decorator') || context.includes('デコレーター')) patterns.push('Decorator');
    
    // アーキテクチャパターン
    if (context.includes('MVC') || context.includes('MVVM')) patterns.push('MVC');
    if (context.includes('repository') || context.includes('リポジトリ')) patterns.push('Repository');
    if (context.includes('service') || context.includes('サービス')) patterns.push('Service');
    
    return patterns;
  }
  
  private assessComplexity(context: string): 'simple' | 'medium' | 'complex' {
    let score = 0;
    
    // キーワードによる評価
    const complexKeywords = [
      'algorithm', 'アルゴリズム', 'complex', '複雑',
      'optimization', '最適化', 'performance', 'パフォーマンス',
      'concurrent', '並行', 'async', '非同期', 'threading', 'スレッド'
    ];
    
    const mediumKeywords = [
      'validation', 'バリデーション', 'parsing', 'パーシング',
      'transformation', '変換', 'mapping', 'マッピング',
      'integration', '統合', 'middleware', 'ミドルウェア'
    ];
    
    complexKeywords.forEach(keyword => {
      if (context.toLowerCase().includes(keyword.toLowerCase())) score += 2;
    });
    
    mediumKeywords.forEach(keyword => {
      if (context.toLowerCase().includes(keyword.toLowerCase())) score += 1;
    });
    
    // 文章の長さで評価
    if (context.length > 500) score += 1;
    if (context.length > 1000) score += 1;
    
    // 文の数で評価
    const sentences = context.split(/[.!?]/).length;
    if (sentences > 10) score += 1;
    
    if (score >= 4) return 'complex';
    if (score >= 2) return 'medium';
    return 'simple';
  }
  
  private analyzeRequirements(context: string): {
    hasValidation: boolean;
    hasErrorHandling: boolean;
    hasLogging: boolean;
    hasTests: boolean;
    isAsync: boolean;
    needsTypeScript: boolean;
  } {
    return {
      hasValidation: /validation|バリデーション|validate|検証/i.test(context),
      hasErrorHandling: /error|exception|エラー|例外|try|catch/i.test(context),
      hasLogging: /log|logging|ログ|debug|デバッグ/i.test(context),
      hasTests: /test|testing|テスト|spec|jest|mocha/i.test(context),
      isAsync: /async|await|非同期|promise|callback/i.test(context),
      needsTypeScript: /typescript|type|型|interface|インターフェース/i.test(context)
    };
  }
  
  private analyzeCodeStyle(context: string): {
    preferredNaming: 'camelCase' | 'snake_case' | 'kebab-case';
    useArrowFunctions: boolean;
    useAsyncAwait: boolean;
    preferConst: boolean;
  } {
    const hasCamelCase = /[a-z][A-Z]/.test(context);
    const hasSnakeCase = /_/.test(context);
    const hasKebabCase = /-/.test(context);
    
    let preferredNaming: 'camelCase' | 'snake_case' | 'kebab-case' = 'camelCase';
    if (hasSnakeCase && !hasCamelCase) preferredNaming = 'snake_case';
    if (hasKebabCase && !hasCamelCase && !hasSnakeCase) preferredNaming = 'kebab-case';
    
    return {
      preferredNaming,
      useArrowFunctions: /arrow|=>|アロー/i.test(context) || context.includes('=>'),
      useAsyncAwait: /async|await/i.test(context),
      preferConst: /const|定数/i.test(context) || !context.includes('var')
    };
  }

  private detectLanguage(context: string): string {
    const languageScores = {
      typescript: 0,
      javascript: 0,
      python: 0,
      java: 0,
      go: 0
    };
    
    // TypeScriptの特徴
    if (context.includes('interface ') || context.includes(': string') || 
        context.includes(': number') || context.includes('type ') ||
        context.includes('<T>') || context.includes('implements')) {
      languageScores.typescript += 3;
    }
    if (context.includes('.ts') || context.includes('TypeScript')) {
      languageScores.typescript += 2;
    }
    
    // JavaScriptの特徴
    if (context.includes('var ') || context.includes('let ') || 
        context.includes('const ') || context.includes('function ')) {
      languageScores.javascript += 1;
    }
    if (context.includes('.js') || context.includes('JavaScript') ||
        context.includes('node') || context.includes('npm')) {
      languageScores.javascript += 2;
    }
    
    // Pythonの特徴
    if (context.includes('def ') || context.includes('import ') ||
        context.includes('from ') || context.includes('__init__') ||
        context.includes('self.')) {
      languageScores.python += 3;
    }
    if (context.includes('.py') || context.includes('Python') ||
        context.includes('pip ') || context.includes('django') ||
        context.includes('flask')) {
      languageScores.python += 2;
    }
    
    // Javaの特徴
    if (context.includes('public class') || context.includes('private ') ||
        context.includes('protected ') || context.includes('extends ') ||
        context.includes('implements ')) {
      languageScores.java += 3;
    }
    if (context.includes('.java') || context.includes('Java') ||
        context.includes('maven') || context.includes('gradle')) {
      languageScores.java += 2;
    }
    
    // Goの特徴
    if (context.includes('func ') || context.includes('package ') ||
        context.includes('import (') || context.includes('goroutine') ||
        context.includes('channel')) {
      languageScores.go += 3;
    }
    if (context.includes('.go') || context.includes('golang') ||
        context.includes('go mod')) {
      languageScores.go += 2;
    }
    
    // 最高スコアの言語を選択
    const maxScore = Math.max(...Object.values(languageScores));
    const detectedLanguage = Object.entries(languageScores)
      .find(([, score]) => score === maxScore)?.[0];
    
    return detectedLanguage || 'javascript'; // デフォルトはJavaScript
  }

  private detectPurpose(context: string): string {
    const purposes = {
      'testing': [
        'test', 'spec', 'テスト', 'jest', 'mocha', 'chai', 'jasmine',
        'unit test', 'integration test', '結合テスト'
      ],
      'api': [
        'API', 'endpoint', 'REST', 'GraphQL', 'HTTP', 'request', 'response',
        'エンドポイント', 'リクエスト', 'レスポンス'
      ],
      'data-access': [
        'database', 'query', 'SQL', 'MongoDB', 'PostgreSQL', 'MySQL',
        'データベース', 'クエリ', 'ORM', 'repository'
      ],
      'ui': [
        'component', 'UI', 'interface', 'view', 'render', 'DOM',
        'コンポーネント', 'ビュー', '画面', 'React', 'Vue', 'Angular'
      ],
      'utility': [
        'utility', 'helper', 'util', 'ユーティリティ', 'ヘルパー',
        'common', '共通', 'shared', '共有'
      ],
      'business-logic': [
        'business', 'logic', 'service', 'manager', 'handler',
        'ビジネス', 'ロジック', 'サービス', '処理'
      ],
      'configuration': [
        'config', 'configuration', 'settings', 'environment',
        '設定', '環境', 'コンフィグ'
      ],
      'security': [
        'security', 'auth', 'authentication', 'authorization', 'jwt',
        'セキュリティ', '認証', '許可'
      ]
    };
    
    const contextLower = context.toLowerCase();
    
    for (const [purpose, keywords] of Object.entries(purposes)) {
      for (const keyword of keywords) {
        if (contextLower.includes(keyword.toLowerCase())) {
          return purpose;
        }
      }
    }
    
    return 'general';
  }

  private detectDependencies(context: string): string[] {
    const deps: string[] = [];
    const imports = context.match(/import .* from ['"](.+)['"]/g) || [];
    imports.forEach(imp => {
      const match = imp.match(/from ['"](.+)['"]/);
      if (match) deps.push(match[1]);
    });
    return deps;
  }

  private async generateCodeInternal(
    contextAnalysis: any,
    options: CodeGenerationOptions,
    patterns: any[]
  ): Promise<string> {
    // AI駆動の高度なコード生成
    let template = '';
    
    // コンテキストに基づいてテンプレートを選択
    switch (options.type) {
      case 'function':
        template = await this.generateAdvancedFunction(contextAnalysis, options);
        break;
      case 'class':
        template = await this.generateAdvancedClass(contextAnalysis, options);
        break;
      case 'interface':
        template = await this.generateAdvancedInterface(contextAnalysis, options);
        break;
      case 'test':
        template = await this.generateAdvancedTest(contextAnalysis, options);
        break;
      case 'documentation':
        template = await this.generateDocumentation(contextAnalysis, options);
        break;
      default:
        template = await this.generateGenericCode(contextAnalysis, options);
    }
    
    // 学習済みパターンを適用
    if (patterns.length > 0) {
      template = await this.applyAdvancedPatterns(template, patterns, contextAnalysis);
    }
    
    // コードスタイルを適用
    template = this.applyCodeStyle(template, contextAnalysis.codeStyle);
    
    // ベストプラクティスを適用
    template = await this.applyBestPractices(template, contextAnalysis, options);
    
    return template;
  }
  
  private async generateAdvancedFunction(
    context: any,
    options: CodeGenerationOptions
  ): Promise<string> {
    const { language, purpose, requirements, codeStyle } = context;
    
    let template = '';
    const funcName = this.generateSmartName(purpose, 'function');
    
    if (language === 'typescript') {
      template = this.generateTypeScriptFunction(funcName, context, options);
    } else if (language === 'python') {
      template = this.generatePythonFunction(funcName, context, options);
    } else if (language === 'java') {
      template = this.generateJavaScriptFunction(funcName, context, options); // Java implementation not provided
    } else if (language === 'go') {
      template = this.generateJavaScriptFunction(funcName, context, options); // Go implementation not provided
    } else {
      template = this.generateJavaScriptFunction(funcName, context, options);
    }
    
    return template;
  }
  
  private generateTypeScriptFunction(name: string, context: any, options: CodeGenerationOptions): string {
    const { requirements, codeStyle, complexity } = context;
    
    let template = `
/**
 * ${this.generateFunctionDescription(context)}
`;
    
    // パラメータと戻り値の型を生成
    const params = this.generateParameters(context);
    const returnType = this.inferReturnType(context);
    
    template += params.map(p => ` * @param ${p.name} - ${p.description}`).join('\n');
    template += `\n * @returns ${returnType.description}\n */\n`;
    
    // 関数シグネチャ
    if (requirements.isAsync) {
      template += `export async function ${name}(${params.map(p => `${p.name}: ${p.type}`).join(', ')}): Promise<${returnType.type}> {\n`;
    } else {
      template += `export function ${name}(${params.map(p => `${p.name}: ${p.type}`).join(', ')}): ${returnType.type} {\n`;
    }
    
    // バリデーション
    if (requirements.hasValidation && params.length > 0) {
      template += '  // Input validation\n';
      for (const param of params) {
        if (param.type === 'string') {
          template += `  if (!${param.name} || typeof ${param.name} !== 'string') {\n`;
          template += `    throw new Error('${param.name} must be a non-empty string');\n`;
          template += '  }\n';
        }
      }
      template += '\n';
    }
    
    // ログ
    if (requirements.hasLogging) {
      template += `  console.log('Executing ${name}', { ${params.map(p => p.name).join(', ')} });\n\n`;
    }
    
    // メインロジック
    if (requirements.hasErrorHandling) {
      template += '  try {\n';
      template += this.generateMainLogic(context, '    ');
      template += '  } catch (error) {\n';
      if (requirements.hasLogging) {
        template += `    console.error('Error in ${name}:', error);\n`;
      }
      template += '    throw error;\n';
      template += '  }\n';
    } else {
      template += this.generateMainLogic(context, '  ');
    }
    
    template += '}\n';
    
    return template;
  }
  
  private generatePythonFunction(name: string, context: any, options: CodeGenerationOptions): string {
    const { requirements, complexity } = context;
    
    let template = `def ${name}(`;
    const params = this.generateParameters(context);
    template += params.map(p => p.name).join(', ');
    template += '):\n';
    
    // Docstring
    template += '    """\n';
    template += `    ${this.generateFunctionDescription(context)}\n\n`;
    for (const param of params) {
      template += `    Args:\n        ${param.name}: ${param.description}\n`;
    }
    template += '    """\n';
    
    // バリデーション
    if (requirements.hasValidation) {
      for (const param of params) {
        template += `    if not ${param.name}:\n`;
        template += `        raise ValueError(f"${param.name} is required")\n`;
      }
    }
    
    // メインロジック
    template += this.generateMainLogic(context, '    ');
    
    return template;
  }
  
  private generateJavaScriptFunction(name: string, context: any, options: CodeGenerationOptions): string {
    const { requirements, codeStyle } = context;
    
    let template = `
/**
 * ${this.generateFunctionDescription(context)}\n`;
    
    const params = this.generateParameters(context);
    for (const param of params) {
      template += ` * @param {${param.jsType || 'any'}} ${param.name} - ${param.description}\n`;
    }
    template += ' */\n';
    
    if (codeStyle.useArrowFunctions) {
      if (requirements.isAsync) {
        template += `const ${name} = async (${params.map(p => p.name).join(', ')}) => {\n`;
      } else {
        template += `const ${name} = (${params.map(p => p.name).join(', ')}) => {\n`;
      }
    } else {
      if (requirements.isAsync) {
        template += `async function ${name}(${params.map(p => p.name).join(', ')}) {\n`;
      } else {
        template += `function ${name}(${params.map(p => p.name).join(', ')}) {\n`;
      }
    }
    
    // バリデーションとメインロジック
    if (requirements.hasValidation) {
      template += '  // Input validation\n';
      for (const param of params) {
        template += `  if (!${param.name}) {\n`;
        template += `    throw new Error('${param.name} is required');\n`;
        template += '  }\n';
      }
    }
    
    template += this.generateMainLogic(context, '  ');
    template += '};\n';
    
    if (codeStyle.useArrowFunctions) {
      template += `\nexport default ${name};\n`;
    } else {
      template += `\nmodule.exports = ${name};\n`;
    }
    
    return template;
  }
  
  private generateSmartName(purpose: string, type: 'function' | 'class' | 'interface'): string {
    const purposeMap = {
      'api': type === 'function' ? 'handleRequest' : type === 'class' ? 'ApiHandler' : 'ApiResponse',
      'data-access': type === 'function' ? 'fetchData' : type === 'class' ? 'DataRepository' : 'DataModel',
      'testing': type === 'function' ? 'runTest' : type === 'class' ? 'TestRunner' : 'TestCase',
      'utility': type === 'function' ? 'processData' : type === 'class' ? 'UtilityHelper' : 'UtilityConfig',
      'ui': type === 'function' ? 'renderComponent' : type === 'class' ? 'UIComponent' : 'ComponentProps',
      'business-logic': type === 'function' ? 'executeLogic' : type === 'class' ? 'BusinessService' : 'BusinessModel',
      'security': type === 'function' ? 'authenticate' : type === 'class' ? 'AuthService' : 'AuthConfig'
    };
    
    return purposeMap[purpose as keyof typeof purposeMap] || 
           (type === 'function' ? 'processData' : type === 'class' ? 'DataProcessor' : 'ProcessorConfig');
  }
  
  private generateParameters(context: any): Array<{
    name: string;
    type: string;
    jsType?: string;
    description: string;
  }> {
    const { purpose, complexity } = context;
    
    const baseParams = [
      {
        name: 'data',
        type: 'any',
        jsType: 'Object',
        description: 'The input data to process'
      }
    ];
    
    if (purpose === 'api') {
      baseParams.push({
        name: 'options',
        type: 'RequestOptions',
        jsType: 'Object',
        description: 'API request options'
      });
    }
    
    if (complexity === 'complex') {
      baseParams.push({
        name: 'config',
        type: 'ProcessingConfig',
        jsType: 'Object',
        description: 'Configuration parameters'
      });
    }
    
    return baseParams;
  }
  
  private inferReturnType(context: any): { type: string; description: string } {
    const { purpose, requirements } = context;
    
    if (requirements.isAsync) {
      if (purpose === 'api') {
        return { type: 'ApiResponse', description: 'The API response data' };
      }
      return { type: 'ProcessingResult', description: 'The processing result' };
    }
    
    if (purpose === 'testing') {
      return { type: 'boolean', description: 'Test result (true if passed)' };
    }
    
    return { type: 'any', description: 'The function result' };
  }
  
  private generateFunctionDescription(context: any): string {
    const { purpose, complexity } = context;
    
    const descriptions = {
      'api': 'Handles API requests and responses',
      'data-access': 'Manages data access and persistence operations',
      'testing': 'Executes test cases and validates functionality',
      'utility': 'Provides utility functions for common operations',
      'ui': 'Renders UI components and handles user interactions',
      'business-logic': 'Implements core business logic and rules',
      'security': 'Handles authentication and authorization'
    };
    
    let desc = descriptions[purpose as keyof typeof descriptions] || 'Processes data and performs operations';
    
    if (complexity === 'complex') {
      desc += ' with advanced processing capabilities';
    }
    
    return desc;
  }
  
  private generateMainLogic(context: any, indent: string): string {
    const { purpose, requirements, complexity } = context;
    
    let logic = `${indent}// TODO: Implement ${purpose} logic\n`;
    
    if (purpose === 'api') {
      logic += `${indent}const result = await fetch(url, options);\n`;
      logic += `${indent}return result.json();\n`;
    } else if (purpose === 'data-access') {
      logic += `${indent}const query = buildQuery(data);\n`;
      logic += `${indent}return database.execute(query);\n`;
    } else if (purpose === 'testing') {
      logic += `${indent}const actual = functionUnderTest(data);\n`;
      logic += `${indent}const expected = expectedResult;\n`;
      logic += `${indent}return actual === expected;\n`;
    } else {
      logic += `${indent}// Process the input data\n`;
      logic += `${indent}const processed = transform(data);\n`;
      logic += `${indent}return processed;\n`;
    }
    
    return logic;
  }
  
  private async generateAdvancedClass(context: any, options: CodeGenerationOptions): Promise<string> {
    const { language, purpose, patterns } = context;
    
    if (language === 'typescript') {
      return this.generateTypeScriptClass(context, options);
    } else if (language === 'python') {
      return this.generateJavaScriptClass(context, options); // Python class implementation not provided
    } else if (language === 'java') {
      return this.generateJavaScriptClass(context, options); // Java class implementation not provided
    } else {
      return this.generateJavaScriptClass(context, options);
    }
  }
  
  private generateTypeScriptClass(context: any, options: CodeGenerationOptions): string {
    const { purpose, patterns, requirements } = context;
    const className = options.name || this.generateSmartName(purpose, 'class');
    
    let template = `
/**
 * ${this.generateClassDescription(context)}
 */
export class ${className}`;
    
    // インターフェースの実装
    if (patterns.includes('Repository')) {
      template += ` implements I${className}`;
    }
    
    template += ' {\n';
    
    // プロパティ
    template += this.generateClassProperties(context, '  ');
    
    // コンストラクタ
    template += this.generateConstructor(context, '  ');
    
    // メソッド
    template += this.generateClassMethods(context, '  ');
    
    template += '}\n';
    
    // インターフェースを生成
    if (patterns.includes('Repository')) {
      template = this.generateInterface(context, `I${className}`) + '\n' + template;
    }
    
    return template;
  }
  
  private generateJavaScriptClass(context: any, options: CodeGenerationOptions): string {
    const { purpose, requirements } = context;
    const className = options.name || this.generateSmartName(purpose, 'class');
    
    let template = `
/**
 * ${this.generateClassDescription(context)}
 */
class ${className} {\n`;
    
    // コンストラクタ
    template += '  constructor(';
    if (purpose === 'data-access') {
      template += 'connection';
    } else if (purpose === 'api') {
      template += 'httpClient, baseUrl';
    } else {
      template += 'config';
    }
    template += ') {\n';
    
    if (purpose === 'data-access') {
      template += '    this.connection = connection;\n';
    } else if (purpose === 'api') {
      template += '    this.httpClient = httpClient;\n';
      template += '    this.baseUrl = baseUrl;\n';
    } else {
      template += '    this.config = config || {};\n';
    }
    
    template += '  }\n\n';
    
    // メソッド
    if (purpose === 'data-access') {
      template += `
  async findById(id) {
    const query = 'SELECT * FROM table WHERE id = ?';
    return this.connection.query(query, [id]);
  }

  async findAll() {
    const query = 'SELECT * FROM table';
    return this.connection.query(query);
  }

  async create(data) {
    const query = 'INSERT INTO table SET ?';
    return this.connection.query(query, data);
  }
`;
    } else if (purpose === 'api') {
      template += `
  async get(endpoint) {
    const url = \`\${this.baseUrl}/\${endpoint}\`;
    return this.httpClient.get(url);
  }

  async post(endpoint, data) {
    const url = \`\${this.baseUrl}/\${endpoint}\`;
    return this.httpClient.post(url, data);
  }
`;
    } else {
      template += `
  process(data) {
    // TODO: Implement processing logic
    return data;
  }

  validate(data) {
    // TODO: Implement validation logic
    return true;
  }
`;
    }
    
    template += '}\n\nmodule.exports = ' + className + ';\n';
    
    return template;
  }
  
  private generateClassDescription(context: any): string {
    const { purpose, patterns } = context;
    
    let desc = `Implements ${purpose} functionality`;
    
    if (patterns.length > 0) {
      desc += ` using ${patterns.join(', ')} pattern${patterns.length > 1 ? 's' : ''}`;
    }
    
    return desc;
  }
  
  private generateClassProperties(context: any, indent: string): string {
    const { purpose } = context;
    
    let properties = '';
    
    if (purpose === 'data-access') {
      properties += `${indent}private readonly connection: DatabaseConnection;\n`;
    } else if (purpose === 'api') {
      properties += `${indent}private readonly httpClient: HttpClient;\n`;
      properties += `${indent}private readonly baseUrl: string;\n`;
    } else if (purpose === 'business-logic') {
      properties += `${indent}private readonly validator: Validator;\n`;
    }
    
    properties += '\n';
    return properties;
  }
  
  private generateConstructor(context: any, indent: string): string {
    const { purpose, requirements } = context;
    
    let constructor = `${indent}constructor(`;
    
    if (purpose === 'data-access') {
      constructor += 'connection: DatabaseConnection';
    } else if (purpose === 'api') {
      constructor += 'httpClient: HttpClient, baseUrl: string';
    } else {
      constructor += 'config?: any';
    }
    
    constructor += ') {\n';
    
    if (purpose === 'data-access') {
      constructor += `${indent}  this.connection = connection;\n`;
    } else if (purpose === 'api') {
      constructor += `${indent}  this.httpClient = httpClient;\n`;
      constructor += `${indent}  this.baseUrl = baseUrl;\n`;
    }
    
    if (requirements.hasValidation) {
      constructor += `${indent}  this.validator = new Validator();\n`;
    }
    
    constructor += `${indent}}\n\n`;
    
    return constructor;
  }
  
  private generateClassMethods(context: any, indent: string): string {
    const { purpose, requirements } = context;
    let methods = '';
    
    if (purpose === 'data-access') {
      methods += this.generateRepositoryMethods(context, indent);
    } else if (purpose === 'api') {
      methods += this.generateApiMethods(context, indent);
    } else if (purpose === 'business-logic') {
      methods += this.generateBusinessMethods(context, indent);
    } else {
      methods += this.generateGenericMethods(context, indent);
    }
    
    return methods;
  }
  
  private generateRepositoryMethods(context: any, indent: string): string {
    return `
${indent}async findById(id: string): Promise<any> {
${indent}  const query = 'SELECT * FROM table WHERE id = ?';
${indent}  return this.connection.query(query, [id]);
${indent}}

${indent}async findAll(): Promise<any[]> {
${indent}  const query = 'SELECT * FROM table';
${indent}  return this.connection.query(query);
${indent}}

${indent}async create(data: any): Promise<any> {
${indent}  const query = 'INSERT INTO table SET ?';
${indent}  return this.connection.query(query, data);
${indent}}

${indent}async update(id: string, data: any): Promise<any> {
${indent}  const query = 'UPDATE table SET ? WHERE id = ?';
${indent}  return this.connection.query(query, [data, id]);
${indent}}

${indent}async delete(id: string): Promise<void> {
${indent}  const query = 'DELETE FROM table WHERE id = ?';
${indent}  await this.connection.query(query, [id]);
${indent}}
`;
  }
  
  private generateApiMethods(context: any, indent: string): string {
    return `
${indent}async get(endpoint: string): Promise<any> {
${indent}  const url = \`\${this.baseUrl}/\${endpoint}\`;
${indent}  return this.httpClient.get(url);
${indent}}

${indent}async post(endpoint: string, data: any): Promise<any> {
${indent}  const url = \`\${this.baseUrl}/\${endpoint}\`;
${indent}  return this.httpClient.post(url, data);
${indent}}

${indent}async put(endpoint: string, data: any): Promise<any> {
${indent}  const url = \`\${this.baseUrl}/\${endpoint}\`;
${indent}  return this.httpClient.put(url, data);
${indent}}

${indent}async delete(endpoint: string): Promise<void> {
${indent}  const url = \`\${this.baseUrl}/\${endpoint}\`;
${indent}  await this.httpClient.delete(url);
${indent}}
`;
  }
  
  private generateBusinessMethods(context: any, indent: string): string {
    return `
${indent}async process(data: any): Promise<any> {
${indent}  // Validate input
${indent}  if (!this.validator.isValid(data)) {
${indent}    throw new Error('Invalid input data');
${indent}  }

${indent}  // Apply business rules
${indent}  const processed = this.applyBusinessRules(data);

${indent}  // Return result
${indent}  return processed;
${indent}}

${indent}private applyBusinessRules(data: any): any {
${indent}  // TODO: Implement business logic
${indent}  return data;
${indent}}
`;
  }
  
  private generateGenericMethods(context: any, indent: string): string {
    return `
${indent}process(data: any): any {
${indent}  // TODO: Implement processing logic
${indent}  return data;
${indent}}

${indent}validate(data: any): boolean {
${indent}  // TODO: Implement validation logic
${indent}  return true;
${indent}}
`;
  }
  
  private async generateAdvancedInterface(context: any, options: CodeGenerationOptions): Promise<string> {
    const interfaceName = this.generateSmartName(context.purpose, 'interface');
    return this.generateInterface(context, interfaceName);
  }
  
  private generateInterface(context: any, name: string): string {
    const { purpose } = context;
    
    let template = `
/**
 * Interface for ${purpose} operations
 */
export interface ${name} {\n`;
    
    if (purpose === 'data-access') {
      template += '  findById(id: string): Promise<any>;\n';
      template += '  findAll(): Promise<any[]>;\n';
      template += '  create(data: any): Promise<any>;\n';
      template += '  update(id: string, data: any): Promise<any>;\n';
      template += '  delete(id: string): Promise<void>;\n';
    } else if (purpose === 'api') {
      template += '  get(endpoint: string): Promise<any>;\n';
      template += '  post(endpoint: string, data: any): Promise<any>;\n';
      template += '  put(endpoint: string, data: any): Promise<any>;\n';
      template += '  delete(endpoint: string): Promise<void>;\n';
    } else {
      template += '  process(data: any): any;\n';
      template += '  validate(data: any): boolean;\n';
    }
    
    template += '}\n';
    
    return template;
  }
  
  private async generateAdvancedTest(context: any, options: CodeGenerationOptions): Promise<string> {
    const { language, purpose } = context;
    
    if (language === 'typescript' || language === 'javascript') {
      return this.generateJestTest(context, options);
    } else if (language === 'python') {
      return this.generateJestTest(context, options); // Python test implementation not provided
    } else if (language === 'java') {
      return this.generateJestTest(context, options); // Java test implementation not provided
    }
    
    return this.generateJestTest(context, options);
  }
  
  private generateJestTest(context: any, options: CodeGenerationOptions): string {
    const testName = this.generateSmartName(context.purpose, 'function').replace(/^[a-z]/, c => c.toUpperCase());
    
    return `
import { ${testName} } from './${testName.toLowerCase()}';

describe('${testName}', () => {
  beforeEach(() => {
    // Setup test environment
  });

  afterEach(() => {
    // Cleanup test environment
  });

  it('should handle valid input correctly', async () => {
    // Arrange
    const input = { test: 'data' };
    const expected = { processed: 'data' };

    // Act
    const result = await ${testName.toLowerCase()}(input);

    // Assert
    expect(result).toEqual(expected);
  });

  it('should throw error for invalid input', async () => {
    // Arrange
    const invalidInput = null;

    // Act & Assert
    await expect(${testName.toLowerCase()}(invalidInput)).rejects.toThrow();
  });

  it('should handle edge cases', async () => {
    // Arrange
    const edgeCaseInput = { edge: 'case' };

    // Act
    const result = await ${testName.toLowerCase()}(edgeCaseInput);

    // Assert
    expect(result).toBeDefined();
  });
});
`;
  }
  
  private async generateDocumentation(context: any, options: CodeGenerationOptions): Promise<string> {
    const { purpose, language } = context;
    
    let doc = `# ${purpose.charAt(0).toUpperCase() + purpose.slice(1)} Documentation\n\n`;
    
    doc += `## Overview\n\n`;
    doc += `This module implements ${purpose} functionality using ${language}.\n\n`;
    
    doc += `## Usage\n\n`;
    doc += `\`\`\`${language}\n`;
    doc += `// Example usage\n`;
    doc += `import { processData } from './${purpose}';\n\n`;
    doc += `const result = await processData(inputData);\n`;
    doc += `\`\`\`\n\n`;
    
    doc += `## API Reference\n\n`;
    doc += `### Functions\n\n`;
    doc += `- \`processData(data: any): Promise<any>\` - Main processing function\n`;
    doc += `- \`validate(data: any): boolean\` - Input validation function\n\n`;
    
    doc += `## Examples\n\n`;
    doc += `See the examples directory for more detailed usage examples.\n`;
    
    return doc;
  }
  
  private async generateGenericCode(context: any, options: CodeGenerationOptions): Promise<string> {
    return '// Generated code\n// TODO: Implement specific functionality\n';
  }
  
  private async applyAdvancedPatterns(
    template: string, 
    patterns: any[], 
    context: any
  ): Promise<string> {
    let enhanced = template;
    
    // 学習済みパターンを適用
    for (const pattern of patterns) {
      if (pattern.type === 'error-handling' && !enhanced.includes('try {')) {
        enhanced = this.addErrorHandling(enhanced);
      }
      
      if (pattern.type === 'logging' && !enhanced.includes('console.log')) {
        enhanced = this.addLogging(enhanced, context);
      }
      
      if (pattern.type === 'validation' && !enhanced.includes('validation')) {
        enhanced = this.addValidation(enhanced, context);
      }
    }
    
    return enhanced;
  }
  
  private applyCodeStyle(template: string, codeStyle: any): string {
    let styled = template;
    
    if (!codeStyle.preferConst) {
      styled = styled.replace(/\bconst\b/g, 'let');
    }
    
    if (codeStyle.preferredNaming === 'snake_case') {
      // シンプルなCamelCase -> snake_case 変換
      styled = styled.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
    }
    
    return styled;
  }
  
  private async applyBestPractices(
    template: string, 
    context: any, 
    options: CodeGenerationOptions
  ): Promise<string> {
    let enhanced = template;
    
    // パフォーマンス最適化
    if (context.purpose === 'api') {
      enhanced = this.addApiOptimizations(enhanced);
    }
    
    // セキュリティ対策
    if (context.requirements.hasValidation) {
      enhanced = this.addSecurityMeasures(enhanced);
    }
    
    // アクセシビリティ
    if (context.purpose === 'ui') {
      enhanced = this.addAccessibilityFeatures(enhanced);
    }
    
    return enhanced;
  }
  
  private addErrorHandling(code: string): string {
    // 簡単なエラーハンドリングの追加
    return code.replace(
      /(\s+)(.*\breturn\b.*;)/g,
      '$1try {\n$1  $2\n$1} catch (error) {\n$1  console.error("Error:", error);\n$1  throw error;\n$1}'
    );
  }
  
  private addLogging(code: string, context: any): string {
    // ログ出力の追加
    return code.replace(
      /(function\s+\w+|const\s+\w+\s*=.*?\s*=>)/,
      '$1\n  console.log("Function called with:", arguments);'
    );
  }
  
  private addValidation(code: string, context: any): string {
    // バリデーションの追加
    return code.replace(
      /(function\s+\w+.*?\{)/,
      '$1\n  if (!arguments[0]) throw new Error("Invalid input");'
    );
  }
  
  private addApiOptimizations(code: string): string {
    // APIパフォーマンス最適化
    return code.replace(
      /(fetch\(.*?\))/g,
      '$1.then(response => response.ok ? response.json() : Promise.reject(response))'
    );
  }
  
  private addSecurityMeasures(code: string): string {
    // セキュリティ対策
    return code.replace(
      /(innerHTML\s*=.*?;)/g,
      '// Security: Use textContent instead of innerHTML for user data\n$1'
    );
  }
  
  private addAccessibilityFeatures(code: string): string {
    // アクセシビリティ機能
    return code.replace(
      /(<button[^>]*>)/g,
      '$1\n  // Add ARIA labels for accessibility'
    );
  }

  private generateFunctionTemplate(context: any, options: CodeGenerationOptions): string {
    const lang = options.language;
    
    if (lang === 'typescript' || lang === 'javascript') {
      return `
/**
 * Generated function
 * @param {any} param - Parameter description
 * @returns {any} Return description
 */
export function generatedFunction(param: any): any {
  // TODO: Implement function logic
  return null;
}`;
    }
    
    return '// Function template not available for this language';
  }

  private generateClassTemplate(context: any, options: CodeGenerationOptions): string {
    const lang = options.language;
    
    if (lang === 'typescript') {
      return `
/**
 * Generated class
 */
export class GeneratedClass {
  private property: any;

  constructor() {
    // Initialize
  }

  public method(): void {
    // TODO: Implement method
  }
}`;
    }
    
    return '// Class template not available for this language';
  }

  private generateInterfaceTemplate(context: any, options: CodeGenerationOptions): string {
    if (options.language === 'typescript') {
      return `
/**
 * Generated interface
 */
export interface GeneratedInterface {
  property: string;
  method(): void;
}`;
    }
    
    return '// Interface not supported in this language';
  }

  private generateTestTemplate(context: any, options: CodeGenerationOptions): string {
    return `
describe('Generated Test Suite', () => {
  beforeEach(() => {
    // Setup
  });

  it('should test something', () => {
    // Arrange
    // Act
    // Assert
    expect(true).toBe(true);
  });

  afterEach(() => {
    // Cleanup
  });
});`;
  }

  private applyLearnedPatterns(template: string, patterns: any[]): string {
    // Apply learned patterns to improve generated code
    // This is where ML-based improvements would be applied
    return template;
  }

  private async generateTests(code: string, options: CodeGenerationOptions): Promise<string> {
    return `
// Generated tests for the above code
describe('Generated Code Tests', () => {
  it('should work correctly', () => {
    // Test implementation
  });
});`;
  }

  private async suggestPerformanceOptimizations(filePath: string): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    
    const content = await this.intelligentFS.readFileSimple(filePath);
    if (!content.success || !content.data) return suggestions;
    
    // Check for common performance issues
    if (content.data.includes('forEach') && content.data.includes('async')) {
      suggestions.push({
        type: 'performance',
        priority: 'medium',
        title: 'Replace forEach with for...of for async operations',
        description: 'Using forEach with async operations can cause performance issues',
        estimatedImpact: 'Improves async operation performance',
        implementation: 'Use for...of loop or Promise.all() for parallel execution'
      });
    }
    
    return suggestions;
  }

  private async suggestSecurityImprovements(filePath: string): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];
    
    const content = await this.intelligentFS.readFileSimple(filePath);
    if (!content.success || !content.data) return suggestions;
    
    // Check for security issues
    if (content.data.includes('eval(') || content.data.includes('new Function(')) {
      suggestions.push({
        type: 'security',
        priority: 'high',
        title: 'Remove eval() usage',
        description: 'eval() can execute arbitrary code and poses security risks',
        estimatedImpact: 'Eliminates code injection vulnerabilities',
        implementation: 'Use safer alternatives like JSON.parse() or specific parsing functions'
      });
    }
    
    return suggestions;
  }

  private async listProjectFiles(projectPath: string): Promise<string[]> {
    // Delegate to IntelligentFileSystem
    return this.intelligentFS.listProjectFiles(projectPath);
  }
  
  /**
   * 総合的なコード品質スコアを計算
   */
  async calculateOverallQuality(projectPath: string): Promise<{
    score: number; // 0-100
    breakdown: {
      complexity: number;
      maintainability: number;
      security: number;
      testCoverage: number;
      documentation: number;
    };
    recommendations: string[];
  }> {
    const files = await this.listProjectFiles(projectPath);
    const tsJsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.js'));
    
    let totalComplexity = 0;
    let totalMaintainability = 0;
    let securityIssues = 0;
    let documentationScore = 0;
    let testFiles = 0;
    
    const recommendations: string[] = [];
    
    // 各ファイルを分析
    for (const file of tsJsFiles.slice(0, 20)) { // 最初の20ファイルのみ解析（パフォーマンス考慮）
      try {
        const quality = await this.analyzeCodeQuality(file);
        const bugs = await this.predictBugs(file);
        
        totalComplexity += quality.complexity;
        totalMaintainability += quality.maintainability;
        
        // セキュリティ問題
        const securityBugs = bugs.filter(b => b.type.includes('Security'));
        securityIssues += securityBugs.length;
        
        // ドキュメンテーション
        const result = await this.intelligentFS.readFileSimple(file);
        if (result.success && result.data) {
          const commentRatio = this.calculateCommentRatio(result.data);
          documentationScore += commentRatio;
        }
        
        // テストファイル
        if (file.includes('test') || file.includes('spec')) {
          testFiles++;
        }
      } catch (error) {
        logger.warn(`Failed to analyze ${file}`, error);
      }
    }
    
    // 平均値を計算
    const fileCount = Math.min(tsJsFiles.length, 20);
    const avgComplexity = fileCount > 0 ? totalComplexity / fileCount : 0;
    const avgMaintainability = fileCount > 0 ? totalMaintainability / fileCount : 0;
    const avgDocumentation = fileCount > 0 ? (documentationScore / fileCount) * 100 : 0;
    
    // セキュリティスコア（問題が少ないほど高スコア）
    const securityScore = Math.max(0, 100 - (securityIssues * 10));
    
    // テストカバレッジの推定（テストファイル数に基づく）
    const testCoverage = Math.min(100, (testFiles / Math.max(1, tsJsFiles.length * 0.3)) * 100);
    
    // 総合スコア計算
    const complexityScore = Math.max(0, 100 - (avgComplexity * 2));
    const maintainabilityScore = avgMaintainability;
    
    const overallScore = Math.round(
      (complexityScore * 0.25) +
      (maintainabilityScore * 0.25) +
      (securityScore * 0.2) +
      (testCoverage * 0.15) +
      (avgDocumentation * 0.15)
    );
    
    // 推奨事項を生成
    if (complexityScore < 70) {
      recommendations.push('Reduce code complexity by breaking down large functions');
    }
    if (maintainabilityScore < 60) {
      recommendations.push('Improve code maintainability by adding documentation and reducing duplication');
    }
    if (securityScore < 80) {
      recommendations.push('Address security vulnerabilities and implement best practices');
    }
    if (testCoverage < 70) {
      recommendations.push('Increase test coverage to improve code reliability');
    }
    if (avgDocumentation < 50) {
      recommendations.push('Add more inline documentation and comments');
    }
    
    return {
      score: overallScore,
      breakdown: {
        complexity: Math.round(complexityScore),
        maintainability: Math.round(maintainabilityScore),
        security: Math.round(securityScore),
        testCoverage: Math.round(testCoverage),
        documentation: Math.round(avgDocumentation)
      },
      recommendations
    };
  }
  
  private calculateCommentRatio(content: string): number {
    const lines = content.split('\n');
    let commentLines = 0;
    let codeLines = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      if (trimmed.startsWith('//') || 
          trimmed.startsWith('/*') || 
          trimmed.startsWith('*') ||
          trimmed.endsWith('*/')) {
        commentLines++;
      } else {
        codeLines++;
      }
    }
    
    return codeLines > 0 ? commentLines / codeLines : 0;
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.metricsCache.clear();
    this.predictionsCache.clear();
    logger.info('AI optimization cache cleared');
  }
}

/**
 * AI最適化エンジンのファクトリー関数
 */
export function createAIOptimizationEngine(
  intelligentFS: IntelligentFileSystem,
  memoryManager: MemoryIntegrationManager
): AIOptimizationEngine {
  return new AIOptimizationEngine(intelligentFS, memoryManager);
}

/**
 * AI最適化エンジンの使用例とテスト関数
 */
export async function testAIOptimizationEngine(
  engine: AIOptimizationEngine,
  testFilePath: string
): Promise<{
  success: boolean;
  results: {
    quality: CodeQualityMetrics;
    bugs: BugPrediction[];
    refactoring: OptimizationSuggestion[];
  };
  errors: string[];
}> {
  const errors: string[] = [];
  let quality: CodeQualityMetrics;
  let bugs: BugPrediction[] = [];
  let refactoring: OptimizationSuggestion[] = [];

  try {
    // コード品質分析をテスト
    logger.info('Testing code quality analysis...');
    quality = await engine.analyzeCodeQuality(testFilePath);
    logger.info('Code quality analysis completed', quality);

    // バグ予測をテスト
    logger.info('Testing bug prediction...');
    bugs = await engine.predictBugs(testFilePath);
    logger.info(`Found ${bugs.length} potential bug patterns`);

    // リファクタリング提案をテスト
    logger.info('Testing refactoring suggestions...');
    refactoring = await engine.suggestRefactoring(testFilePath);
    logger.info(`Generated ${refactoring.length} refactoring suggestions`);

    // AI駆動コード生成をテスト
    logger.info('Testing AI code generation...');
    const generatedCode = await engine.generateCode(
      'Create a TypeScript function to validate user input with error handling',
      {
        type: 'function',
        language: 'typescript',
        includeTests: true,
        includeDocumentation: true
      }
    );
    logger.info('Code generation completed', { codeLength: generatedCode.length });

    return {
      success: true,
      results: {
        quality,
        bugs,
        refactoring
      },
      errors
    };

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMsg);
    logger.error('AI Optimization Engine test failed', error);

    return {
      success: false,
      results: {
        quality: quality! || {
          complexity: 0,
          maintainability: 0,
          codeSmells: [],
          suggestions: []
        },
        bugs,
        refactoring
      },
      errors
    };
  }
}

/**
 * プロジェクト全体の分析を実行するヘルパー関数
 */
export async function analyzeProject(
  engine: AIOptimizationEngine,
  projectPath: string
): Promise<{
  overallQuality: any;
  architecture: ArchitectureAnalysis;
  topIssues: Array<{
    file: string;
    type: 'code-smell' | 'bug-prediction' | 'architecture';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }>;
}> {
  logger.info(`Analyzing project at ${projectPath}`);

  // プロジェクト全体の品質評価
  const overallQuality = await engine.calculateOverallQuality(projectPath);
  logger.info('Overall quality calculated', overallQuality);

  // アーキテクチャ分析
  const architecture = await engine.analyzeArchitecture(projectPath);
  logger.info('Architecture analysis completed', {
    patterns: architecture.patterns.length,
    antiPatterns: architecture.antiPatterns.length,
    dependencies: architecture.dependencies.length
  });

  // 重要な問題を集約
  const topIssues: Array<{
    file: string;
    type: 'code-smell' | 'bug-prediction' | 'architecture';
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }> = [];

  // アーキテクチャの問題を追加
  for (const antiPattern of architecture.antiPatterns) {
    topIssues.push({
      file: antiPattern.location,
      type: 'architecture',
      severity: antiPattern.severity,
      description: `${antiPattern.name}: ${antiPattern.impact}`
    });
  }

  // 依存関係の問題を追加
  for (const dep of architecture.dependencies) {
    if (dep.severity === 'high') {
      topIssues.push({
        file: dep.from,
        type: 'architecture',
        severity: dep.severity,
        description: `Dependency issue: ${dep.recommendation}`
      });
    }
  }

  // 重要度でソート
  topIssues.sort((a, b) => {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });

  return {
    overallQuality,
    architecture,
    topIssues: topIssues.slice(0, 10) // 上位10件
  };
}
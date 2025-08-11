/**
 * IntelligentFileSystemとレジストリの統合
 * 既存のRead/Editツールを段階的に置換
 */

import { InternalFunctionRegistry, InternalFunction } from './registry.js';
import { 
  initializeIntelligentFS, 
  registerIntelligentFunctions 
} from '../../packages/core/src/intelligent-fs/tool-integration.js';
import { 
  AIOptimizationEngine, 
  createAIOptimizationEngine,
  CodeGenerationOptions,
  CodeQualityMetrics,
  BugPrediction,
  ArchitectureAnalysis,
  OptimizationSuggestion
} from '../../packages/core/src/intelligent-fs/ai-optimization.js';
import { IntelligentFileSystem } from '../../packages/core/src/intelligent-fs/intelligent-filesystem.js';
import { MemoryIntegrationManager } from '../../packages/core/src/intelligent-fs/memory-integration.js';
import { logger } from '../utils/logger.js';
import * as path from 'path';

/**
 * インテリジェント機能の統合状態
 */
interface IntegrationState {
  initialized: boolean;
  intelligentFS?: IntelligentFileSystem;
  aiEngine?: AIOptimizationEngine;
  memoryManager?: MemoryIntegrationManager;
  registeredFunctions: Set<string>;
}

const integrationState: IntegrationState = {
  initialized: false,
  registeredFunctions: new Set()
};

/**
 * インテリジェント機能を既存レジストリに統合
 */
export async function integrateIntelligentFunctions(
  registry: InternalFunctionRegistry
): Promise<void> {
  logger.info('Starting IntelligentFileSystem integration...');
  
  try {
    // IntelligentFileSystemを初期化
    await initializeIntelligentFS({
      allowedDirectories: [process.cwd()],
      enabled: true
    });

    // 基本的なインテリジェント関数を登録
    const intelligentFunctions = await registerIntelligentFunctions();
    
    // レジストリに追加
    for (const func of intelligentFunctions) {
      registry.register(func);
      integrationState.registeredFunctions.add(func.name);
    }

    // AI最適化関数を登録
    await registerAIOptimizationFunctions(registry);

    // 既存ツールの拡張
    await enhanceExistingTools(registry);

    integrationState.initialized = true;
    logger.info(`IntelligentFileSystem integration complete. Registered ${integrationState.registeredFunctions.size} functions`);
  } catch (error) {
    logger.error('Failed to integrate IntelligentFileSystem:', error);
    throw error;
  }
}

/**
 * AI最適化関数を登録
 */
async function registerAIOptimizationFunctions(registry: InternalFunctionRegistry): Promise<void> {
  // インスタンスを取得（初期化済みと仮定）
  const { intelligentFS, memoryManager } = await getOrCreateInstances();
  const aiEngine = createAIOptimizationEngine(intelligentFS, memoryManager);
  integrationState.aiEngine = aiEngine;

  // コード品質分析
  const analyzeQualityFunction: InternalFunction = {
    name: 'AnalyzeCodeQuality',
    description: 'Analyze code quality metrics, detect code smells, and provide optimization suggestions',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to analyze'
        }
      },
      required: ['file_path']
    },
    handler: async (params: { file_path: string }) => {
      try {
        const metrics = await aiEngine.analyzeCodeQuality(params.file_path);
        return formatCodeQualityResult(metrics);
      } catch (error) {
        logger.error('Code quality analysis failed:', error);
        throw error;
      }
    }
  };

  // バグ予測
  const predictBugsFunction: InternalFunction = {
    name: 'PredictBugs',
    description: 'Predict potential bugs and vulnerabilities in code using AI analysis',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to analyze'
        }
      },
      required: ['file_path']
    },
    handler: async (params: { file_path: string }) => {
      try {
        const predictions = await aiEngine.predictBugs(params.file_path);
        return formatBugPredictions(predictions);
      } catch (error) {
        logger.error('Bug prediction failed:', error);
        throw error;
      }
    }
  };

  // アーキテクチャ分析
  const analyzeArchitectureFunction: InternalFunction = {
    name: 'AnalyzeArchitecture',
    description: 'Analyze project architecture, detect patterns and anti-patterns',
    parameters: {
      type: 'object',
      properties: {
        project_path: {
          type: 'string',
          description: 'Path to the project root (optional, defaults to current directory)'
        }
      }
    },
    handler: async (params: { project_path?: string }) => {
      try {
        const projectPath = params.project_path || process.cwd();
        const analysis = await aiEngine.analyzeArchitecture(projectPath);
        return formatArchitectureAnalysis(analysis);
      } catch (error) {
        logger.error('Architecture analysis failed:', error);
        throw error;
      }
    }
  };

  // コード生成
  const generateCodeFunction: InternalFunction = {
    name: 'GenerateCode',
    description: 'Generate code using AI based on context and requirements',
    parameters: {
      type: 'object',
      properties: {
        context: {
          type: 'string',
          description: 'Context or requirements for code generation'
        },
        type: {
          type: 'string',
          enum: ['function', 'class', 'interface', 'test', 'documentation'],
          description: 'Type of code to generate'
        },
        language: {
          type: 'string',
          enum: ['typescript', 'javascript', 'python', 'java'],
          default: 'typescript',
          description: 'Programming language'
        },
        include_tests: {
          type: 'boolean',
          default: false,
          description: 'Include unit tests'
        },
        include_docs: {
          type: 'boolean',
          default: true,
          description: 'Include documentation'
        }
      },
      required: ['context', 'type']
    },
    handler: async (params: any) => {
      try {
        const options: CodeGenerationOptions = {
          type: params.type,
          language: params.language || 'typescript',
          includeTests: params.include_tests || false,
          includeDocumentation: params.include_docs || true
        };
        
        const code = await aiEngine.generateCode(params.context, options);
        return `Generated ${params.type} in ${options.language}:\n\n${code}`;
      } catch (error) {
        logger.error('Code generation failed:', error);
        throw error;
      }
    }
  };

  // リファクタリング提案
  const suggestRefactoringFunction: InternalFunction = {
    name: 'SuggestRefactoring',
    description: 'Get AI-powered refactoring suggestions for improving code quality',
    parameters: {
      type: 'object',
      properties: {
        file_path: {
          type: 'string',
          description: 'Path to the file to analyze'
        }
      },
      required: ['file_path']
    },
    handler: async (params: { file_path: string }) => {
      try {
        const suggestions = await aiEngine.suggestRefactoring(params.file_path);
        return formatRefactoringSuggestions(suggestions);
      } catch (error) {
        logger.error('Refactoring suggestion failed:', error);
        throw error;
      }
    }
  };

  // 関数を登録
  const aiFunctions = [
    analyzeQualityFunction,
    predictBugsFunction,
    analyzeArchitectureFunction,
    generateCodeFunction,
    suggestRefactoringFunction
  ];

  for (const func of aiFunctions) {
    registry.register(func);
    integrationState.registeredFunctions.add(func.name);
    logger.debug(`Registered AI function: ${func.name}`);
  }
}

/**
 * 既存ツールを拡張
 */
async function enhanceExistingTools(registry: InternalFunctionRegistry): Promise<void> {
  // 既存のReadツールを拡張
  const originalRead = registry.get('Read');
  if (originalRead) {
    const enhancedRead: InternalFunction = {
      ...originalRead,
      name: 'ReadIntelligent',
      description: 'Read file with intelligent code analysis and symbol information',
      handler: async (params: any) => {
        const { intelligentFS } = await getOrCreateInstances();
        
        // インテリジェント読み取りを試行
        try {
          const result = await intelligentFS.readFileIntelligent(params.file_path);
          if (result.success && result.data) {
            // シンボル情報を含む拡張結果を返す
            return formatIntelligentReadResult(result.data);
          }
        } catch (error) {
          logger.warn('Intelligent read failed, falling back to standard read:', error);
        }
        
        // フォールバック: 通常の読み取り
        return originalRead.handler(params);
      }
    };
    
    registry.register(enhancedRead);
    integrationState.registeredFunctions.add(enhancedRead.name);
  }

  // 既存のEditツールを拡張
  const originalEdit = registry.get('Edit');
  if (originalEdit) {
    const enhancedEdit: InternalFunction = {
      ...originalEdit,
      name: 'EditIntelligent',
      description: 'Edit file with semantic understanding and automatic reference updates',
      handler: async (params: any) => {
        const { intelligentFS } = await getOrCreateInstances();
        
        // セマンティック編集を試行
        try {
          if (params.symbol_name) {
            // シンボルベースの編集
            const result = await intelligentFS.refactorSymbol(
              params.file_path,
              params.symbol_name,
              params.new_name || params.new_string,
              { updateReferences: true }
            );
            
            if (result.success) {
              return `Successfully refactored ${params.symbol_name} and updated ${result.data?.updatedFiles?.length || 0} files`;
            }
          }
        } catch (error) {
          logger.warn('Intelligent edit failed, falling back to standard edit:', error);
        }
        
        // フォールバック: 通常の編集
        return originalEdit.handler(params);
      }
    };
    
    registry.register(enhancedEdit);
    integrationState.registeredFunctions.add(enhancedEdit.name);
  }
}

/**
 * インスタンスを取得または作成
 */
async function getOrCreateInstances(): Promise<{
  intelligentFS: IntelligentFileSystem;
  memoryManager: MemoryIntegrationManager;
}> {
  if (!integrationState.intelligentFS || !integrationState.memoryManager) {
    // セキュリティ設定
    const securityConfig = {
      allowedDirectories: [process.cwd()],
      enabled: true
    };
    
    // インスタンスを作成
    integrationState.intelligentFS = new IntelligentFileSystem(securityConfig);
    await integrationState.intelligentFS.initialize();
    
    integrationState.memoryManager = new MemoryIntegrationManager(
      path.join(process.cwd(), '.agents', 'memory')
    );
    await integrationState.memoryManager.initialize();
  }
  
  return {
    intelligentFS: integrationState.intelligentFS,
    memoryManager: integrationState.memoryManager
  };
}

// フォーマット関数群

function formatCodeQualityResult(metrics: CodeQualityMetrics): string {
  let result = `## Code Quality Analysis\n\n`;
  result += `**Cyclomatic Complexity:** ${metrics.complexity}\n`;
  result += `**Maintainability Index:** ${metrics.maintainability}/100\n\n`;
  
  if (metrics.codeSmells.length > 0) {
    result += `### Code Smells Detected (${metrics.codeSmells.length})\n\n`;
    for (const smell of metrics.codeSmells) {
      result += `- **${smell.type}** [${smell.severity}]: ${smell.message}\n`;
      result += `  Location: Line ${smell.location.line}\n`;
      if (smell.suggestion) {
        result += `  Suggestion: ${smell.suggestion}\n`;
      }
      result += '\n';
    }
  }
  
  if (metrics.suggestions.length > 0) {
    result += `### Optimization Suggestions (${metrics.suggestions.length})\n\n`;
    for (const suggestion of metrics.suggestions) {
      result += `- **${suggestion.title}** [${suggestion.priority}]\n`;
      result += `  ${suggestion.description}\n`;
      result += `  Impact: ${suggestion.estimatedImpact}\n\n`;
    }
  }
  
  return result;
}

function formatBugPredictions(predictions: BugPrediction[]): string {
  let result = `## Bug Predictions\n\n`;
  
  if (predictions.length === 0) {
    result += 'No potential bugs detected.\n';
    return result;
  }
  
  result += `Found ${predictions.length} potential issues:\n\n`;
  
  // Sort by likelihood
  predictions.sort((a, b) => b.likelihood - a.likelihood);
  
  for (const pred of predictions) {
    const likelihood = Math.round(pred.likelihood * 100);
    result += `### ${pred.type} (${likelihood}% likelihood)\n`;
    result += `${pred.description}\n`;
    result += `Location: ${pred.location.file}:${pred.location.line}`;
    if (pred.location.symbol) {
      result += ` (${pred.location.symbol})`;
    }
    result += `\n`;
    result += `**Prevention:** ${pred.prevention}\n\n`;
  }
  
  return result;
}

function formatArchitectureAnalysis(analysis: ArchitectureAnalysis): string {
  let result = `## Architecture Analysis\n\n`;
  
  if (analysis.patterns.length > 0) {
    result += `### Design Patterns (${analysis.patterns.length})\n\n`;
    for (const pattern of analysis.patterns) {
      result += `- **${pattern.name}** (${pattern.type}): ${pattern.quality}\n`;
      result += `  Location: ${pattern.location}\n\n`;
    }
  }
  
  if (analysis.antiPatterns.length > 0) {
    result += `### Anti-Patterns Detected (${analysis.antiPatterns.length})\n\n`;
    for (const antiPattern of analysis.antiPatterns) {
      result += `- **${antiPattern.name}** [${antiPattern.severity}]\n`;
      result += `  Location: ${antiPattern.location}\n`;
      result += `  Impact: ${antiPattern.impact}\n`;
      result += `  Solution: ${antiPattern.solution}\n\n`;
    }
  }
  
  if (analysis.dependencies.length > 0) {
    result += `### Dependency Issues (${analysis.dependencies.length})\n\n`;
    for (const dep of analysis.dependencies) {
      result += `- **${dep.type}** [${dep.severity}]: ${dep.from} → ${dep.to}\n`;
      result += `  ${dep.recommendation}\n\n`;
    }
  }
  
  if (analysis.recommendations.length > 0) {
    result += `### Recommendations (${analysis.recommendations.length})\n\n`;
    for (const rec of analysis.recommendations) {
      result += `#### ${rec.title}\n`;
      result += `${rec.description}\n`;
      result += `**Benefit:** ${rec.benefit}\n`;
      result += `**Implementation Steps:**\n`;
      for (const step of rec.implementation) {
        result += `- ${step}\n`;
      }
      result += '\n';
    }
  }
  
  return result;
}

function formatRefactoringSuggestions(suggestions: OptimizationSuggestion[]): string {
  let result = `## Refactoring Suggestions\n\n`;
  
  if (suggestions.length === 0) {
    result += 'No refactoring suggestions at this time.\n';
    return result;
  }
  
  // Group by priority
  const high = suggestions.filter(s => s.priority === 'high');
  const medium = suggestions.filter(s => s.priority === 'medium');
  const low = suggestions.filter(s => s.priority === 'low');
  
  if (high.length > 0) {
    result += `### High Priority (${high.length})\n\n`;
    for (const suggestion of high) {
      result += formatSuggestion(suggestion);
    }
  }
  
  if (medium.length > 0) {
    result += `### Medium Priority (${medium.length})\n\n`;
    for (const suggestion of medium) {
      result += formatSuggestion(suggestion);
    }
  }
  
  if (low.length > 0) {
    result += `### Low Priority (${low.length})\n\n`;
    for (const suggestion of low) {
      result += formatSuggestion(suggestion);
    }
  }
  
  return result;
}

function formatSuggestion(suggestion: OptimizationSuggestion): string {
  let result = `**${suggestion.title}** (${suggestion.type})\n`;
  result += `${suggestion.description}\n`;
  result += `*Impact:* ${suggestion.estimatedImpact}\n`;
  if (suggestion.implementation) {
    result += `*How to implement:* ${suggestion.implementation}\n`;
  }
  result += '\n';
  return result;
}

function formatIntelligentReadResult(data: any): string {
  let result = data.content;
  
  // Add symbol information if available
  if (data.symbols && data.symbols.length > 0) {
    result += '\n\n---\n## Symbol Information\n\n';
    for (const symbol of data.symbols) {
      result += `- **${symbol.name}** (${symbol.kind})\n`;
    }
  }
  
  // Add dependency information if available
  if (data.dependencies && data.dependencies.length > 0) {
    result += '\n## Dependencies\n\n';
    for (const dep of data.dependencies) {
      result += `- ${dep}\n`;
    }
  }
  
  return result;
}

/**
 * 統合状態を取得
 */
export function getIntegrationState(): IntegrationState {
  return integrationState;
}

/**
 * クリーンアップ
 */
export async function cleanupIntelligentIntegration(): Promise<void> {
  if (integrationState.aiEngine) {
    integrationState.aiEngine.clearCache();
  }
  
  if (integrationState.intelligentFS) {
    await integrationState.intelligentFS.close();
  }
  
  if (integrationState.memoryManager) {
    await integrationState.memoryManager.close();
  }
  
  integrationState.initialized = false;
  integrationState.registeredFunctions.clear();
  
  logger.info('IntelligentFileSystem integration cleaned up');
}
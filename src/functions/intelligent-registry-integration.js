/**
 * IntelligentFileSystemとレジストリの統合
 * 既存のRead/Editツールを段階的に置換
 */
import { initializeIntelligentFS, registerIntelligentFunctions } from '../../packages/core/src/intelligent-fs/tool-integration.js';
import { createAIOptimizationEngine } from '../../packages/core/src/intelligent-fs/ai-optimization.js';
import { IntelligentFileSystem } from '../../packages/core/src/intelligent-fs/intelligent-filesystem.js';
import { MemoryIntegrationManager } from '../../packages/core/src/intelligent-fs/memory-integration.js';
import { logger } from '../utils/logger.js';
import * as path from 'path';
const integrationState = {
    initialized: false,
    registeredFunctions: new Set()
};
/**
 * インテリジェント機能を既存レジストリに統合
 */
export async function integrateIntelligentFunctions(registry) {
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
    }
    catch (error) {
        logger.error('Failed to integrate IntelligentFileSystem:', error);
        throw error;
    }
}
/**
 * AI最適化関数を登録
 */
async function registerAIOptimizationFunctions(registry) {
    // インスタンスを取得（初期化済みと仮定）
    const { intelligentFS, memoryManager } = await getOrCreateInstances();
    const aiEngine = createAIOptimizationEngine(intelligentFS, memoryManager);
    integrationState.aiEngine = aiEngine;
    // コード品質分析
    const analyzeQualityFunction = {
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
        handler: async (params) => {
            try {
                const metrics = await aiEngine.analyzeCodeQuality(params.file_path);
                return formatCodeQualityResult(metrics);
            }
            catch (error) {
                logger.error('Code quality analysis failed:', error);
                throw error;
            }
        }
    };
    // バグ予測
    const predictBugsFunction = {
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
        handler: async (params) => {
            try {
                const predictions = await aiEngine.predictBugs(params.file_path);
                return formatBugPredictions(predictions);
            }
            catch (error) {
                logger.error('Bug prediction failed:', error);
                throw error;
            }
        }
    };
    // アーキテクチャ分析
    const analyzeArchitectureFunction = {
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
        handler: async (params) => {
            try {
                const projectPath = params.project_path || process.cwd();
                const analysis = await aiEngine.analyzeArchitecture(projectPath);
                return formatArchitectureAnalysis(analysis);
            }
            catch (error) {
                logger.error('Architecture analysis failed:', error);
                throw error;
            }
        }
    };
    // コード生成
    const generateCodeFunction = {
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
        handler: async (params) => {
            try {
                const options = {
                    type: params.type,
                    language: params.language || 'typescript',
                    includeTests: params.include_tests || false,
                    includeDocumentation: params.include_docs || true
                };
                const code = await aiEngine.generateCode(params.context, options);
                return `Generated ${params.type} in ${options.language}:\n\n${code}`;
            }
            catch (error) {
                logger.error('Code generation failed:', error);
                throw error;
            }
        }
    };
    // リファクタリング提案
    const suggestRefactoringFunction = {
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
        handler: async (params) => {
            try {
                const suggestions = await aiEngine.suggestRefactoring(params.file_path);
                return formatRefactoringSuggestions(suggestions);
            }
            catch (error) {
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
 * 既存ツールを完全に置き換え
 * IntelligentFileSystemは必須コンポーネントなので、フォールバックは提供しない
 */
async function enhanceExistingTools(registry) {
    // 既存のread_text_fileツールを完全に置き換え
    const originalReadTextFile = registry.get('read_text_file');
    if (originalReadTextFile) {
        const enhancedReadTextFile = {
            ...originalReadTextFile,
            name: 'read_text_file', // 同じ名前で置き換える
            description: 'ファイルの内容をテキストとして読み取る（IntelligentFileSystemによるシンボル情報と依存関係の解析付き）',
            handler: async (params) => {
                const { intelligentFS } = await getOrCreateInstances();
                // IntelligentFileSystemは必須 - 失敗は許容しない
                const result = await intelligentFS.readFileIntelligent(params.path);
                if (!result.success) {
                    throw new Error(`IntelligentFileSystem read failed: ${result.error || 'Unknown error'}`);
                }
                // 既存のインターフェースと互換性を保つために内容のみを返す
                // ただし、内部的にはシンボル情報がインデックスされている
                return result.data.content;
            }
        };
        // 既存のread_text_fileを削除して、新しいものに置き換え
        registry.unregister('read_text_file');
        registry.register(enhancedReadTextFile);
        integrationState.registeredFunctions.add(enhancedReadTextFile.name);
        logger.info('Replaced standard read_text_file with IntelligentFileSystem-based version');
    }
    // 既存のwrite_fileツールを完全に置き換え
    const originalWriteFile = registry.get('write_file');
    if (originalWriteFile) {
        const enhancedWriteFile = {
            ...originalWriteFile,
            name: 'write_file', // 同じ名前で置き換える
            description: 'ファイルに内容を書き込む（IntelligentFileSystemによるインデックス更新と編集履歴の追跡付き）',
            handler: async (params) => {
                const { intelligentFS } = await getOrCreateInstances();
                // IntelligentFileSystemは必須 - 失敗は許容しない
                const writeResult = await intelligentFS.writeFileIntelligent(params.path, params.content, {
                    updateIndex: true,
                    trackHistory: true,
                    encoding: params.encoding || 'utf-8'
                });
                if (!writeResult.success) {
                    throw new Error(`IntelligentFileSystem write failed: ${writeResult.error || 'Unknown error'}`);
                }
                return { success: true };
            }
        };
        // 既存のwrite_fileを削除して、新しいものに置き換え
        registry.unregister('write_file');
        registry.register(enhancedWriteFile);
        integrationState.registeredFunctions.add(enhancedWriteFile.name);
        logger.info('Replaced standard write_file with IntelligentFileSystem-based version');
    }
    // Claudeツール向けのRead/Editも存在する場合は置き換え
    const originalRead = registry.get('Read');
    if (originalRead) {
        const enhancedRead = {
            ...originalRead,
            name: 'Read', // 同じ名前で置き換える
            description: 'Read file with intelligent code analysis, symbol information, and memory integration',
            handler: async (params) => {
                const { intelligentFS } = await getOrCreateInstances();
                // IntelligentFileSystemは必須 - 失敗は許容しない
                const result = await intelligentFS.readFileIntelligent(params.file_path || params.path);
                if (!result.success) {
                    throw new Error(`IntelligentFileSystem read failed: ${result.error || 'Unknown error'}`);
                }
                // シンボル情報を含む拡張結果を返す
                return formatIntelligentReadResult(result.data);
            }
        };
        // 既存のReadを削除して、新しいものに置き換え
        registry.unregister('Read');
        registry.register(enhancedRead);
        integrationState.registeredFunctions.add(enhancedRead.name);
        logger.info('Replaced Claude Read with IntelligentFileSystem-based Read');
    }
    // Claudeツール向けのEditも存在する場合は置き換え
    const originalEdit = registry.get('Edit');
    if (originalEdit) {
        const enhancedEdit = {
            ...originalEdit,
            name: 'Edit', // 同じ名前で置き換える
            description: 'Edit file with intelligent semantic understanding, symbol tracking, and automatic reference updates',
            handler: async (params) => {
                const { intelligentFS } = await getOrCreateInstances();
                // IntelligentFileSystemは必須 - 失敗は許容しない
                try {
                    // シンボルベースの編集を試行（可能な場合）
                    if (params.symbol_name) {
                        const result = await intelligentFS.refactorSymbol(params.file_path || params.path, params.symbol_name, params.new_name || params.new_string, { updateReferences: true });
                        if (result.success) {
                            return `Successfully refactored ${params.symbol_name} and updated ${result.data?.updatedFiles?.length || 0} files`;
                        }
                        else {
                            throw new Error(`IntelligentFileSystem refactor failed: ${result.error || 'Unknown error'}`);
                        }
                    }
                    const filePath = params.file_path || params.path;
                    // 通常の編集だが、IntelligentFileSystemの編集履歴とインデックス更新を含む
                    const content = await intelligentFS.readFileIntelligent(filePath);
                    if (!content.success) {
                        throw new Error(`Failed to read file: ${content.error}`);
                    }
                    // old_stringとnew_stringによる置換処理
                    let updatedContent = content.data.content;
                    if (params.old_string && params.new_string) {
                        if (params.replace_all) {
                            updatedContent = updatedContent.split(params.old_string).join(params.new_string);
                        }
                        else {
                            const index = updatedContent.indexOf(params.old_string);
                            if (index === -1) {
                                throw new Error(`String not found: ${params.old_string}`);
                            }
                            updatedContent = updatedContent.substring(0, index) +
                                params.new_string +
                                updatedContent.substring(index + params.old_string.length);
                        }
                    }
                    // IntelligentFileSystemで書き込み（インデックス更新を含む）
                    const writeResult = await intelligentFS.writeFileIntelligent(filePath, updatedContent, { updateIndex: true, trackHistory: true });
                    if (!writeResult.success) {
                        throw new Error(`IntelligentFileSystem write failed: ${writeResult.error || 'Unknown error'}`);
                    }
                    return `File edited successfully with intelligent tracking`;
                }
                catch (error) {
                    // IntelligentFileSystemのエラーは許容しない
                    throw new Error(`IntelligentFileSystem edit failed: ${error instanceof Error ? error.message : String(error)}`);
                }
            }
        };
        // 既存のEditを削除して、新しいものに置き換え
        registry.unregister('Edit');
        registry.register(enhancedEdit);
        integrationState.registeredFunctions.add(enhancedEdit.name);
        logger.info('Replaced Claude Edit with IntelligentFileSystem-based Edit');
    }
}
/**
 * インスタンスを取得または作成
 */
async function getOrCreateInstances() {
    if (!integrationState.intelligentFS || !integrationState.memoryManager) {
        // セキュリティ設定
        const securityConfig = {
            allowedDirectories: [process.cwd()],
            enabled: true
        };
        // インスタンスを作成
        integrationState.intelligentFS = new IntelligentFileSystem(securityConfig);
        await integrationState.intelligentFS.initialize();
        integrationState.memoryManager = new MemoryIntegrationManager(path.join(process.cwd(), '.agents', 'memory'));
        await integrationState.memoryManager.initialize();
    }
    return {
        intelligentFS: integrationState.intelligentFS,
        memoryManager: integrationState.memoryManager
    };
}
// フォーマット関数群
function formatCodeQualityResult(metrics) {
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
function formatBugPredictions(predictions) {
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
function formatArchitectureAnalysis(analysis) {
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
function formatRefactoringSuggestions(suggestions) {
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
function formatSuggestion(suggestion) {
    let result = `**${suggestion.title}** (${suggestion.type})\n`;
    result += `${suggestion.description}\n`;
    result += `*Impact:* ${suggestion.estimatedImpact}\n`;
    if (suggestion.implementation) {
        result += `*How to implement:* ${suggestion.implementation}\n`;
    }
    result += '\n';
    return result;
}
function formatIntelligentReadResult(data) {
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
export function getIntegrationState() {
    return integrationState;
}
/**
 * クリーンアップ
 */
export async function cleanupIntelligentIntegration() {
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
//# sourceMappingURL=intelligent-registry-integration.js.map
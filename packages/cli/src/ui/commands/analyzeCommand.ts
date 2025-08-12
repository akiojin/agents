/**
 * Analyze Command - IntelligentFileSystemによる高度なコード分析
 */

import { getErrorMessage } from '@indenscale/open-gemini-cli-core';
import { MessageType } from '../types.js';
import { SlashCommand, SlashCommandActionReturn } from './types.js';
import { getMemoryManager } from '../../memory/memoryManager.js';
import { ResultType } from '@agents/memory/decision-log';

export const analyzeCommand: SlashCommand = {
  name: 'analyze',
  description: 'IntelligentFileSystemによる高度なコード分析と操作',
  subCommands: [
    {
      name: 'read',
      description: 'ファイルの高度な読み取り（シンボル、依存関係、AI分析）',
      action: async (context, input) => {
        try {
          const filePath = input.trim();
          if (!filePath) {
            context.addMessage({
              type: MessageType.ERROR,
              content: 'ファイルパスを指定してください: /analyze read <ファイルパス>'
            });
            return { success: false };
          }

          const memoryManager = getMemoryManager();
          const decisionId = await memoryManager.recordDecision(
            `IntelligentRead analysis on ${filePath}`,
            'Advanced file reading with symbol and dependency analysis'
          );

          context.addMessage({
            type: MessageType.INFO,
            content: '🧠 Starting intelligent file analysis...'
          });

          try {
            // 動的importでツールを読み込み
            const { IntelligentReadTool } = await import('@agents/core/tools/intelligent-read.js');
            const tool = new IntelligentReadTool();
            
            const result = await tool.execute({
              path: filePath,
              includeSymbols: true,
              includeDependencies: true,
              includeAnalysis: true,
              useCache: true
            }, new AbortController().signal);

            context.addMessage({
              type: MessageType.INFO,
              content: result.returnDisplay.toString()
            });

            if (decisionId) {
              await memoryManager.updateDecisionResult(decisionId, ResultType.Success, 'Intelligent read completed');
            }

            return { success: true };
          } catch (error) {
            const errorMsg = getErrorMessage(error);
            context.addMessage({
              type: MessageType.ERROR,
              content: `Analysis failed: ${errorMsg}`
            });

            if (decisionId) {
              await memoryManager.updateDecisionResult(decisionId, ResultType.Failure, errorMsg);
            }

            return { success: false };
          }
        } catch (error) {
          context.addMessage({
            type: MessageType.ERROR,
            content: `Error: ${getErrorMessage(error)}`
          });
          return { success: false };
        }
      }
    },
    {
      name: 'quality',
      description: 'コード品質分析（メトリクス、問題、改善提案）',
      action: async (context, input) => {
        try {
          const filePath = input.trim();
          if (!filePath) {
            context.addMessage({
              type: MessageType.ERROR,
              content: 'ファイルパスを指定してください: /analyze quality <ファイルパス>'
            });
            return { success: false };
          }

          const memoryManager = getMemoryManager();
          const decisionId = await memoryManager.recordDecision(
            `CodeQuality analysis on ${filePath}`,
            'Analysis type: detailed'
          );

          context.addMessage({
            type: MessageType.INFO,
            content: '📊 Starting code quality analysis...'
          });

          try {
            // 動的importでツールを読み込み
            const { CodeQualityTool } = await import('@agents/core/tools/code-quality.js');
            const tool = new CodeQualityTool();
            
            const result = await tool.execute({
              path: filePath,
              analysisType: 'detailed',
              includeSuggestions: true,
              includeMetrics: true
            }, new AbortController().signal);

            context.addMessage({
              type: MessageType.INFO,
              content: result.returnDisplay.toString()
            });

            if (decisionId) {
              await memoryManager.updateDecisionResult(decisionId, ResultType.Success, 'Code quality analysis completed');
            }

            return { success: true };
          } catch (error) {
            const errorMsg = getErrorMessage(error);
            context.addMessage({
              type: MessageType.ERROR,
              content: `Analysis failed: ${errorMsg}`
            });

            if (decisionId) {
              await memoryManager.updateDecisionResult(decisionId, ResultType.Failure, errorMsg);
            }

            return { success: false };
          }
        } catch (error) {
          context.addMessage({
            type: MessageType.ERROR,
            content: `Error: ${getErrorMessage(error)}`
          });
          return { success: false };
        }
      }
    },
    {
      name: 'symbol',
      description: 'シンボル分析（依存関係、参照、複雑度）',
      action: async (context, input) => {
        try {
          const parts = input.trim().split(/\s+/);
          const filePath = parts[0];
          const symbolName = parts[1];

          if (!filePath) {
            context.addMessage({
              type: MessageType.ERROR,
              content: 'ファイルパスを指定してください: /analyze symbol <ファイルパス> [シンボル名]'
            });
            return { success: false };
          }

          const memoryManager = getMemoryManager();
          const decisionId = await memoryManager.recordDecision(
            `SymbolAnalyze on ${filePath}`,
            `Analyzing${symbolName ? ` symbol: ${symbolName}` : ' all symbols'}`
          );

          context.addMessage({
            type: MessageType.INFO,
            content: '🔍 Starting symbol analysis...'
          });

          try {
            // 動的importでツールを読み込み
            const { SymbolAnalyzeTool } = await import('@agents/core/tools/symbol-analyze.js');
            const tool = new SymbolAnalyzeTool();
            
            const result = await tool.execute({
              path: filePath,
              symbolName: symbolName,
              analyzeType: 'all',
              includeRelated: true,
              maxDepth: 3
            }, new AbortController().signal);

            context.addMessage({
              type: MessageType.INFO,
              content: result.returnDisplay.toString()
            });

            if (decisionId) {
              await memoryManager.updateDecisionResult(decisionId, ResultType.Success, 'Symbol analysis completed');
            }

            return { success: true };
          } catch (error) {
            const errorMsg = getErrorMessage(error);
            context.addMessage({
              type: MessageType.ERROR,
              content: `Analysis failed: ${errorMsg}`
            });

            if (decisionId) {
              await memoryManager.updateDecisionResult(decisionId, ResultType.Failure, errorMsg);
            }

            return { success: false };
          }
        } catch (error) {
          context.addMessage({
            type: MessageType.ERROR,
            content: `Error: ${getErrorMessage(error)}`
          });
          return { success: false };
        }
      }
    }
  ]
};
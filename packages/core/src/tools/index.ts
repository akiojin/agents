/**
 * IntelligentFileSystem Tools
 * すべてのインテリジェントファイルシステムツールのエクスポート
 */

import type { BaseTool } from './tools.js';
export { BaseTool, Tool, ToolResult } from './tools.js';
export { IntelligentReadTool } from './intelligent-read.js';
export { SemanticEditTool } from './semantic-edit.js';
export { SymbolAnalyzeTool } from './symbol-analyze.js';
export { CodeQualityTool } from './code-quality.js';

// 型定義のエクスポート
export type { IntelligentReadParams } from './intelligent-read.js';
export type { SemanticEditParams } from './semantic-edit.js';
export type { SymbolAnalyzeParams, SymbolInfo, SymbolReference } from './symbol-analyze.js';
export type { CodeQualityParams, QualityIssue, QualityMetrics } from './code-quality.js';

/**
 * すべてのIntelligentFileSystemツールのファクトリ
 */
export async function createIntelligentFileSystemTools() {
  const { IntelligentReadTool } = await import('./intelligent-read.js');
  const { SemanticEditTool } = await import('./semantic-edit.js');
  const { SymbolAnalyzeTool } = await import('./symbol-analyze.js');
  const { CodeQualityTool } = await import('./code-quality.js');
  
  return {
    intelligentRead: new IntelligentReadTool(),
    semanticEdit: new SemanticEditTool(),
    symbolAnalyze: new SymbolAnalyzeTool(),
    codeQuality: new CodeQualityTool()
  };
}

/**
 * ツール名からツールインスタンスを取得するヘルパー
 */
export async function getToolByName(toolName: string): Promise<BaseTool | null> {
  const tools = await createIntelligentFileSystemTools();
  
  switch (toolName) {
    case 'IntelligentRead':
      return tools.intelligentRead;
    case 'SemanticEdit':
      return tools.semanticEdit;
    case 'SymbolAnalyze':
      return tools.symbolAnalyze;
    case 'CodeQuality':
      return tools.codeQuality;
    default:
      return null;
  }
}

/**
 * すべてのツールの配列を取得
 */
export async function getAllIntelligentFileSystemTools(): Promise<BaseTool[]> {
  const tools = await createIntelligentFileSystemTools();
  return Object.values(tools);
}
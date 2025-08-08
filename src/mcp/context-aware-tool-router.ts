import { logger } from '../utils/logger.js';
import type { FunctionDefinition } from './function-converter.js';
import { DynamicToolSelector, ToolCategory } from './tool-selector.js';

/**
 * コンテキスト分析結果
 */
export interface ContextAnalysis {
  primaryIntent: ToolIntent;
  secondaryIntents: ToolIntent[];
  confidence: number;
  suggestedToolCategories: ToolCategory[];
  keywords: string[];
}

/**
 * ツールの意図分類
 */
export enum ToolIntent {
  FILE_OPERATIONS = 'file_operations',
  CODE_ANALYSIS = 'code_analysis', 
  CODE_EDITING = 'code_editing',
  DOCUMENTATION = 'documentation',
  WEB_SEARCH = 'web_search',
  SYSTEM_COMMANDS = 'system_commands',
  DEBUGGING = 'debugging',
  TESTING = 'testing',
  DATABASE = 'database',
  API_INTEGRATION = 'api_integration',
  GENERAL_INQUIRY = 'general_inquiry'
}

/**
 * コンテキスト認識型ツールルーター
 * ユーザーの入力を分析して最適なツールセットを動的に選択
 */
export class ContextAwareToolRouter {
  private toolSelector: DynamicToolSelector;
  private intentPatterns: Map<ToolIntent, string[]>;
  private toolIntentMapping: Map<string, ToolIntent[]>;

  constructor() {
    this.toolSelector = new DynamicToolSelector();
    this.initializeIntentPatterns();
    this.initializeToolMapping();
  }

  /**
   * 意図パターンの初期化
   */
  private initializeIntentPatterns(): void {
    this.intentPatterns = new Map([
      [ToolIntent.FILE_OPERATIONS, [
        'ファイル', 'ディレクトリ', '読み', '書き', '作成', '削除', '移動', 'コピー',
        'フォルダ', 'パス', '保存', '読み込み', 'リスト', '一覧'
      ]],
      
      [ToolIntent.CODE_ANALYSIS, [
        'コード', '解析', '構造', 'クラス', 'メソッド', '関数', '変数', 'シンボル',
        'インポート', 'エクスポート', '依存関係', 'リファクタリング', '検索'
      ]],
      
      [ToolIntent.CODE_EDITING, [
        '編集', '修正', '追加', '削除', '置換', '挿入', 'リファクタリング', '実装',
        '変更', '更新', '書き換え', 'コード生成', '自動生成'
      ]],
      
      [ToolIntent.DOCUMENTATION, [
        'ドキュメント', 'マニュアル', 'ヘルプ', 'Azure', 'Microsoft', '.NET', 'API',
        '仕様', '説明', '使い方', 'チュートリアル', '例', 'サンプル'
      ]],
      
      [ToolIntent.WEB_SEARCH, [
        '検索', 'Google', 'ウェブ', 'インターネット', '調べる', '情報', '最新',
        'ニュース', 'トレンド', '調査', 'リサーチ'
      ]],
      
      [ToolIntent.SYSTEM_COMMANDS, [
        'コマンド', '実行', 'bash', 'シェル', 'スクリプト', 'プロセス', 
        'システム', 'ターミナル', 'CLI', 'バックグラウンド'
      ]],
      
      [ToolIntent.DEBUGGING, [
        'デバッグ', 'エラー', 'バグ', '問題', 'トラブル', '修正', '解決',
        'ログ', 'スタックトレース', '例外', '失敗'
      ]],
      
      [ToolIntent.TESTING, [
        'テスト', 'テスト', 'ユニットテスト', '統合テスト', 'E2E', 'モック',
        'アサート', 'カバレッジ', '検証', '品質'
      ]],
      
      [ToolIntent.API_INTEGRATION, [
        'API', 'REST', 'GraphQL', 'HTTP', 'リクエスト', 'レスポンス',
        '統合', '連携', 'Webhook', 'JSON', 'XML'
      ]],
      
      [ToolIntent.GENERAL_INQUIRY, [
        'とは', 'について', '教えて', '説明', '意味', '方法', 'やり方',
        '違い', '比較', '概要', '基本', '入門'
      ]]
    ]);
  }

  /**
   * ツールと意図のマッピングを初期化
   */
  private initializeToolMapping(): void {
    this.toolIntentMapping = new Map([
      // 内部ファイルシステム関数
      ['read_text_file', [ToolIntent.FILE_OPERATIONS, ToolIntent.CODE_ANALYSIS]],
      ['write_file', [ToolIntent.FILE_OPERATIONS, ToolIntent.CODE_EDITING]],
      ['list_directory', [ToolIntent.FILE_OPERATIONS]],
      ['create_directory', [ToolIntent.FILE_OPERATIONS]],
      ['delete_file', [ToolIntent.FILE_OPERATIONS]],
      ['delete_directory', [ToolIntent.FILE_OPERATIONS]],
      
      // 内部Bash関数
      ['execute_command', [ToolIntent.SYSTEM_COMMANDS, ToolIntent.DEBUGGING]],
      ['execute_command_interactive', [ToolIntent.SYSTEM_COMMANDS]],
      
      // Serena (コード分析・編集)
      ['mcp__serena__get_symbols_overview', [ToolIntent.CODE_ANALYSIS]],
      ['mcp__serena__find_symbol', [ToolIntent.CODE_ANALYSIS, ToolIntent.CODE_EDITING]],
      ['mcp__serena__find_referencing_symbols', [ToolIntent.CODE_ANALYSIS]],
      ['mcp__serena__replace_symbol_body', [ToolIntent.CODE_EDITING]],
      ['mcp__serena__insert_after_symbol', [ToolIntent.CODE_EDITING]],
      ['mcp__serena__insert_before_symbol', [ToolIntent.CODE_EDITING]],
      ['mcp__serena__search_for_pattern', [ToolIntent.CODE_ANALYSIS, ToolIntent.DEBUGGING]],
      
      // 検索・ドキュメント
      ['mcp__google-search__google_search', [ToolIntent.WEB_SEARCH, ToolIntent.GENERAL_INQUIRY]],
      ['mcp__microsoft_docs_mcp__microsoft_docs_search', [ToolIntent.DOCUMENTATION, ToolIntent.API_INTEGRATION]],
      ['mcp__microsoft_docs_mcp__microsoft_docs_fetch', [ToolIntent.DOCUMENTATION]],
      
      // テキスト処理
      ['mcp__textlint__lintFile', [ToolIntent.TESTING, ToolIntent.CODE_ANALYSIS]],
      ['mcp__markitdown__convert_to_markdown', [ToolIntent.DOCUMENTATION]]
    ]);
  }

  /**
   * ユーザー入力からコンテキストを分析
   */
  analyzeContext(input: string): ContextAnalysis {
    const lowercaseInput = input.toLowerCase();
    const intentScores = new Map<ToolIntent, number>();
    const matchedKeywords: string[] = [];

    // 各意図パターンとのマッチングスコアを計算
    for (const [intent, patterns] of this.intentPatterns.entries()) {
      let score = 0;
      
      for (const pattern of patterns) {
        if (lowercaseInput.includes(pattern.toLowerCase())) {
          score += 1;
          matchedKeywords.push(pattern);
        }
      }
      
      if (score > 0) {
        intentScores.set(intent, score);
      }
    }

    // スコア順でソート
    const sortedIntents = Array.from(intentScores.entries())
      .sort((a, b) => b[1] - a[1]);

    const primaryIntent = sortedIntents[0]?.[0] || ToolIntent.GENERAL_INQUIRY;
    const secondaryIntents = sortedIntents.slice(1, 3).map(([intent]) => intent);
    
    // 信頼度計算（マッチしたキーワード数に基づく）
    const totalMatches = Array.from(intentScores.values()).reduce((sum, score) => sum + score, 0);
    const confidence = Math.min(totalMatches / 5, 1.0); // 最大5個のマッチで100%

    // 推奨ツールカテゴリを決定
    const suggestedCategories = this.mapIntentToCategories(primaryIntent, secondaryIntents);

    return {
      primaryIntent,
      secondaryIntents,
      confidence,
      suggestedToolCategories: suggestedCategories,
      keywords: [...new Set(matchedKeywords)] // 重複除去
    };
  }

  /**
   * 意図をツールカテゴリにマッピング
   */
  private mapIntentToCategories(primaryIntent: ToolIntent, secondaryIntents: ToolIntent[]): ToolCategory[] {
    const categoryMapping = new Map<ToolIntent, ToolCategory[]>([
      [ToolIntent.FILE_OPERATIONS, [ToolCategory.INTERNAL_FILESYSTEM]],
      [ToolIntent.CODE_ANALYSIS, [ToolCategory.CODE_ANALYSIS, ToolCategory.INTERNAL_FILESYSTEM]],
      [ToolIntent.CODE_EDITING, [ToolCategory.CODE_ANALYSIS, ToolCategory.INTERNAL_FILESYSTEM]],
      [ToolIntent.DOCUMENTATION, [ToolCategory.DOCUMENTATION, ToolCategory.WEB_FETCH]],
      [ToolIntent.WEB_SEARCH, [ToolCategory.SEARCH, ToolCategory.WEB_FETCH]],
      [ToolIntent.SYSTEM_COMMANDS, [ToolCategory.INTERNAL_BASH]],
      [ToolIntent.DEBUGGING, [ToolCategory.CODE_ANALYSIS, ToolCategory.INTERNAL_BASH]],
      [ToolIntent.TESTING, [ToolCategory.CODE_ANALYSIS, ToolCategory.DEVELOPMENT]],
      [ToolIntent.API_INTEGRATION, [ToolCategory.DOCUMENTATION, ToolCategory.WEB_FETCH]],
      [ToolIntent.GENERAL_INQUIRY, [ToolCategory.SEARCH, ToolCategory.DOCUMENTATION]]
    ]);

    const allCategories = new Set<ToolCategory>();
    
    // 主要意図のカテゴリを追加
    const primaryCategories = categoryMapping.get(primaryIntent) || [];
    primaryCategories.forEach(cat => allCategories.add(cat));
    
    // 副次意図のカテゴリを追加
    secondaryIntents.forEach(intent => {
      const categories = categoryMapping.get(intent) || [];
      categories.forEach(cat => allCategories.add(cat));
    });

    return Array.from(allCategories);
  }

  /**
   * コンテキスト認識型ツール選択
   */
  selectContextualTools(
    input: string, 
    availableTools: FunctionDefinition[], 
    maxTools: number,
    provider: string
  ): {
    selectedTools: FunctionDefinition[];
    analysis: ContextAnalysis;
    selectionReason: string;
  } {
    // コンテキスト分析
    const analysis = this.analyzeContext(input);
    
    logger.debug('Context analysis completed', {
      primaryIntent: analysis.primaryIntent,
      confidence: analysis.confidence,
      keywords: analysis.keywords.slice(0, 5) // ログには最初の5個のみ
    });

    // プロバイダー設定
    this.toolSelector.setProvider(provider);
    
    // 意図ベースのツール優先順位付け
    const prioritizedTools = this.prioritizeToolsByIntent(availableTools, analysis);
    
    // 最終選択
    const selectedTools = prioritizedTools.slice(0, maxTools);
    
    const selectionReason = this.generateSelectionReason(analysis, selectedTools.length, maxTools);
    
    logger.info('Contextual tool selection completed', {
      provider,
      selectedCount: selectedTools.length,
      maxTools,
      primaryIntent: analysis.primaryIntent,
      confidence: analysis.confidence
    });

    return {
      selectedTools,
      analysis,
      selectionReason
    };
  }

  /**
   * 意図に基づいてツールを優先順位付け
   */
  private prioritizeToolsByIntent(
    availableTools: FunctionDefinition[], 
    analysis: ContextAnalysis
  ): FunctionDefinition[] {
    const toolScores = availableTools.map(tool => {
      const toolIntents = this.toolIntentMapping.get(tool.name) || [];
      let score = 0;
      
      // 主要意図とのマッチ
      if (toolIntents.includes(analysis.primaryIntent)) {
        score += 100;
      }
      
      // 副次意図とのマッチ
      analysis.secondaryIntents.forEach(intent => {
        if (toolIntents.includes(intent)) {
          score += 50;
        }
      });
      
      // 内部関数ボーナス
      if (tool.name.startsWith('read_') || tool.name.startsWith('write_') || 
          tool.name.startsWith('execute_') || tool.name.startsWith('list_')) {
        score += 25;
      }
      
      // キーワードマッチボーナス
      const description = (tool.description || '').toLowerCase();
      analysis.keywords.forEach(keyword => {
        if (description.includes(keyword.toLowerCase())) {
          score += 10;
        }
      });
      
      return { tool, score };
    });
    
    // スコア順でソート
    toolScores.sort((a, b) => b.score - a.score);
    
    return toolScores.map(item => item.tool);
  }

  /**
   * 選択理由を生成
   */
  private generateSelectionReason(
    analysis: ContextAnalysis, 
    selectedCount: number, 
    maxCount: number
  ): string {
    const intentName = analysis.primaryIntent.replace('_', ' ');
    const confidencePercent = Math.round(analysis.confidence * 100);
    
    return `コンテキスト分析結果: ${intentName} (信頼度${confidencePercent}%) に基づき、${selectedCount}/${maxCount}個のツールを選択`;
  }

  /**
   * デバッグ用: 分析結果の詳細を取得
   */
  getAnalysisDetails(input: string): {
    analysis: ContextAnalysis;
    intentScores: Record<string, number>;
    toolRecommendations: string[];
  } {
    const analysis = this.analyzeContext(input);
    
    // 意図スコアの詳細計算
    const intentScores: Record<string, number> = {};
    const lowercaseInput = input.toLowerCase();
    
    for (const [intent, patterns] of this.intentPatterns.entries()) {
      let score = 0;
      patterns.forEach(pattern => {
        if (lowercaseInput.includes(pattern.toLowerCase())) {
          score++;
        }
      });
      if (score > 0) {
        intentScores[intent] = score;
      }
    }
    
    // ツール推奨
    const toolRecommendations: string[] = [];
    for (const [toolName, intents] of this.toolIntentMapping.entries()) {
      if (intents.includes(analysis.primaryIntent) || 
          analysis.secondaryIntents.some(intent => intents.includes(intent))) {
        toolRecommendations.push(toolName);
      }
    }
    
    return {
      analysis,
      intentScores,
      toolRecommendations: toolRecommendations.slice(0, 10) // 上位10個
    };
  }
}
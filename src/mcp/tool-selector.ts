import type { FunctionDefinition } from './function-converter.js';
import { logger } from '../utils/logger.js';
import type { Config } from '../config/types.js';

/**
 * LLMプロバイダー情報
 */
export interface ProviderInfo {
  provider: string;
  maxTools: number;
  supportsBatching?: boolean;
  preferredCategories?: ToolCategory[];
  toolSwitchingStrategy?: 'context-aware' | 'static' | 'pagination';
}

/**
 * ツールカテゴリ定義
 */
export enum ToolCategory {
  INTERNAL_FILESYSTEM = 'internal_filesystem',
  INTERNAL_BASH = 'internal_bash',
  CODE_ANALYSIS = 'code_analysis',
  DOCUMENTATION = 'documentation',
  SEARCH = 'search',
  WEB_FETCH = 'web_fetch',
  DEVELOPMENT = 'development',
  OTHER = 'other'
}

/**
 * ツール優先度設定
 */
export interface ToolPriority {
  category: ToolCategory;
  priority: number; // 1-10 (10が最高優先度)
  keywords: string[]; // このカテゴリに関連するキーワード
}

/**
 * 動的ツール選択器
 */
export class DynamicToolSelector {
  private readonly providerConfigs: Map<string, ProviderInfo> = new Map();
  private currentProvider: string = 'openai';
  private readonly DEFAULT_MAX_TOOLS = 10;
  
  private readonly toolPriorities: ToolPriority[] = [
    {
      category: ToolCategory.INTERNAL_FILESYSTEM,
      priority: 9, // 内部関数は常に高優先度
      keywords: ['ファイル', 'ディレクトリ', '読み', '書き', 'フォルダ', 'パス', 'ディレクトリ構造', '一覧', 'リスト']
    },
    {
      category: ToolCategory.INTERNAL_BASH,
      priority: 9, // 内部関数は常に高優先度  
      keywords: ['コマンド', '実行', 'bash', 'シェル', 'スクリプト', 'プロセス', 'バックグラウンド']
    },
    {
      category: ToolCategory.CODE_ANALYSIS,
      priority: 8,
      keywords: ['コード', '解析', '検索', 'クラス', 'メソッド', '関数', '変数', 'シンボル', 'リファクタリング', '構造']
    },
    {
      category: ToolCategory.DOCUMENTATION,
      priority: 7,
      keywords: ['ドキュメント', 'マニュアル', 'ヘルプ', 'Azure', 'Microsoft', '.NET', 'API', '仕様']
    },
    {
      category: ToolCategory.SEARCH,
      priority: 6,
      keywords: ['検索', 'Google', 'ウェブ', 'インターネット', '調べる', '情報']
    },
    {
      category: ToolCategory.WEB_FETCH,
      priority: 5,
      keywords: ['URL', 'ウェブページ', 'サイト', 'フェッチ', 'HTTP']
    },
    {
      category: ToolCategory.DEVELOPMENT,
      priority: 4,
      keywords: ['開発', 'デバッグ', 'テスト', 'ビルド', 'デプロイ']
    },
    {
      category: ToolCategory.OTHER,
      priority: 1,
      keywords: []
    }
  ];

  constructor() {
    this.initializeProviderConfigs();
  }

  /**
   * プロバイダー設定の初期化
   */
  private initializeProviderConfigs(): void {
    // OpenAI GPT-4/4o系列: 実用的な制限値に調整
    this.providerConfigs.set('openai', {
      provider: 'openai',
      maxTools: 50, // 実用的な上限値
      supportsBatching: true,
      preferredCategories: [ToolCategory.INTERNAL_FILESYSTEM, ToolCategory.INTERNAL_BASH, ToolCategory.CODE_ANALYSIS],
      toolSwitchingStrategy: 'context-aware'
    });

    // Anthropic Claude系列: より多くのツールをサポート
    this.providerConfigs.set('anthropic', {
      provider: 'anthropic',
      maxTools: 40, // Claudeの実用的な上限
      supportsBatching: true,
      preferredCategories: [ToolCategory.INTERNAL_FILESYSTEM, ToolCategory.CODE_ANALYSIS, ToolCategory.DOCUMENTATION],
      toolSwitchingStrategy: 'context-aware'
    });

    // ローカルモデル (GPT-OSS): 実用的な制限に緩和
    this.providerConfigs.set('local-gptoss', {
      provider: 'local-gptoss',
      maxTools: 25, // 実用性を重視して増加
      supportsBatching: false,
      preferredCategories: [ToolCategory.INTERNAL_FILESYSTEM, ToolCategory.INTERNAL_BASH, ToolCategory.CODE_ANALYSIS],
      toolSwitchingStrategy: 'context-aware' // 動的選択に変更
    });

    // ローカルモデル (LM Studio): 制限を緩和
    this.providerConfigs.set('local-lmstudio', {
      provider: 'local-lmstudio',
      maxTools: 20, // 実用性を考慮して増加
      supportsBatching: false,
      preferredCategories: [ToolCategory.INTERNAL_FILESYSTEM, ToolCategory.INTERNAL_BASH, ToolCategory.CODE_ANALYSIS],
      toolSwitchingStrategy: 'context-aware' // 動的選択に変更
    });
  }

  /**
   * 現在のプロバイダーを設定
   */
  setProvider(provider: string): void {
    this.currentProvider = provider;
    logger.debug(`Tool selector provider set to: ${provider}`);
  }

  /**
   * 現在のプロバイダー設定を取得
   */
  private getCurrentProviderConfig(): ProviderInfo {
    return this.providerConfigs.get(this.currentProvider) || {
      provider: this.currentProvider,
      maxTools: this.DEFAULT_MAX_TOOLS,
      supportsBatching: false,
      toolSwitchingStrategy: 'context-aware'
    };
  }

  /**
   * 入力に基づいて最適なツール組み合わせを選択
   */
  selectOptimalTools(input: string, allTools: FunctionDefinition[]): FunctionDefinition[] {
    const providerConfig = this.getCurrentProviderConfig();
    const maxTools = providerConfig.maxTools;
    
    logger.debug(`Tool selection started for ${providerConfig.provider}: ${allTools.length} tools available, max: ${maxTools}`);
    
    // プロバイダー固有の選択戦略を使用
    switch (providerConfig.toolSwitchingStrategy) {
      case 'static':
        return this.selectToolsStatic(input, allTools, maxTools, providerConfig);
      case 'pagination':
        return this.selectToolsPagination(input, allTools, maxTools, providerConfig);
      case 'context-aware':
      default:
        return this.selectToolsContextAware(input, allTools, maxTools, providerConfig);
    }
  }

  /**
   * コンテキスト認識型ツール選択
   */
  private selectToolsContextAware(input: string, allTools: FunctionDefinition[], maxTools: number, config: ProviderInfo): FunctionDefinition[] {
    // 入力を小文字に変換してキーワードマッチング用に準備
    const lowercaseInput = input.toLowerCase();
    
    // 各ツールにスコアを付与
    const scoredTools = allTools.map(tool => ({
      tool,
      score: this.calculateToolScore(tool, lowercaseInput, config)
    }));
    
    // スコア順でソート（降順）
    scoredTools.sort((a, b) => b.score - a.score);
    
    // 内部関数の最大数を動的に調整
    const maxInternalTools = Math.min(Math.floor(maxTools * 0.6), 8); // 最大60%または8個
    
    // 内部関数を優先的に選択
    const internalTools = scoredTools
      .filter(t => this.isInternalFunction(t.tool))
      .slice(0, maxInternalTools);
    
    const remainingSlots = maxTools - internalTools.length;
    
    // 残りのスロットに外部MCPツールを配置
    const externalTools = scoredTools
      .filter(t => !this.isInternalFunction(t.tool))
      .slice(0, remainingSlots);
    
    const selectedTools = [...internalTools, ...externalTools].map(t => t.tool);
    
    logger.debug(`Context-aware selection completed: ${selectedTools.length}/${maxTools} tools selected`);
    logger.debug('Selected tools:', selectedTools.map(t => t.name));
    
    return selectedTools;
  }

  /**
   * 静的ツール選択（ローカルモデル向け）
   */
  private selectToolsStatic(input: string, allTools: FunctionDefinition[], maxTools: number, config: ProviderInfo): FunctionDefinition[] {
    // 予め定義された必須ツールを優先
    const essentialTools = [
      'read_text_file', 'write_file', 'list_directory', 'execute_command',
      'mcp__serena__get_symbols_overview', 'mcp__serena__find_symbol'
    ];
    
    const selectedTools: FunctionDefinition[] = [];
    
    // 必須ツールを最初に追加
    for (const toolName of essentialTools) {
      const tool = allTools.find(t => t.name === toolName);
      if (tool && selectedTools.length < maxTools) {
        selectedTools.push(tool);
      }
    }
    
    // 残りのスロットを最大まで使って他のツールを追加
    if (selectedTools.length < maxTools) {
      const remainingTools = allTools.filter(t => !selectedTools.some(selected => selected.name === t.name));
      
      // 優先カテゴリがあれば優先、なければすべてから選択
      let candidateTools = remainingTools;
      if (config.preferredCategories && config.preferredCategories.length > 0) {
        // カテゴリ別に分類して優先順で選択
        const toolsByCategory = new Map<ToolCategory, FunctionDefinition[]>();
        
        remainingTools.forEach(tool => {
          const category = this.categorizeTools([tool])[0];
          if (!toolsByCategory.has(category)) {
            toolsByCategory.set(category, []);
          }
          toolsByCategory.get(category)!.push(tool);
        });
        
        candidateTools = [];
        for (const category of config.preferredCategories) {
          const categoryTools = toolsByCategory.get(category) || [];
          candidateTools.push(...categoryTools);
        }
        
        // 優先カテゴリ以外のツールも追加
        const otherTools = remainingTools.filter(tool => 
          !candidateTools.some(candidate => candidate.name === tool.name)
        );
        candidateTools.push(...otherTools);
      }
      
      // 最大数まで追加
      const remainingSlots = maxTools - selectedTools.length;
      selectedTools.push(...candidateTools.slice(0, remainingSlots));
    }
    
    logger.debug(`Static selection completed: ${selectedTools.length}/${maxTools} tools selected`);
    return selectedTools;
  }

  /**
   * ページネーション型ツール選択
   */
  private selectToolsPagination(input: string, allTools: FunctionDefinition[], maxTools: number, config: ProviderInfo): FunctionDefinition[] {
    // 基本的なツール群を定義
    const toolGroups = {
      filesystem: ['read_text_file', 'write_file', 'list_directory', 'create_directory'],
      bash: ['execute_command', 'get_current_directory'],
      code: ['mcp__serena__get_symbols_overview', 'mcp__serena__find_symbol', 'mcp__serena__replace_symbol_body'],
      search: ['mcp__google-search__google_search', 'mcp__serena__search_for_pattern'],
      docs: ['mcp__microsoft_docs_mcp__microsoft_docs_search', 'mcp__microsoft_docs_mcp__microsoft_docs_fetch']
    };
    
    // 入力に基づいてグループを優先順位付け
    const lowercaseInput = input.toLowerCase();
    let selectedGroup = 'filesystem'; // デフォルト
    
    if (lowercaseInput.includes('コード') || lowercaseInput.includes('クラス') || lowercaseInput.includes('メソッド')) {
      selectedGroup = 'code';
    } else if (lowercaseInput.includes('検索') || lowercaseInput.includes('探す')) {
      selectedGroup = 'search';
    } else if (lowercaseInput.includes('実行') || lowercaseInput.includes('コマンド')) {
      selectedGroup = 'bash';
    } else if (lowercaseInput.includes('ドキュメント') || lowercaseInput.includes('Azure')) {
      selectedGroup = 'docs';
    }
    
    const selectedTools: FunctionDefinition[] = [];
    
    // 選択されたグループのツールを追加
    const groupTools = toolGroups[selectedGroup as keyof typeof toolGroups] || toolGroups.filesystem;
    for (const toolName of groupTools) {
      const tool = allTools.find(t => t.name === toolName);
      if (tool && selectedTools.length < maxTools) {
        selectedTools.push(tool);
      }
    }
    
    // 残りのスロットを他のグループから補完
    if (selectedTools.length < maxTools) {
      const remainingTools = allTools.filter(t => !selectedTools.includes(t));
      for (const tool of remainingTools) {
        if (selectedTools.length >= maxTools) break;
        selectedTools.push(tool);
      }
    }
    
    logger.debug(`Pagination selection completed: ${selectedTools.length}/${maxTools} tools selected from group: ${selectedGroup}`);
    return selectedTools.slice(0, maxTools);
  }

  /**
   * ツールのスコアを計算
   */
  private calculateToolScore(tool: FunctionDefinition, input: string, config?: ProviderInfo): number {
    let score = 0;
    
    // 基本スコア: ツール名のマッチング
    if (input.includes(tool.name.toLowerCase())) {
      score += 50;
    }
    
    // 説明文のマッチング
    if (tool.description && input.includes(tool.description.toLowerCase())) {
      score += 20;
    }
    
    // カテゴリベースのスコアリング
    const category = this.categorizeTools([tool])[0];
    const priority = this.toolPriorities.find(p => p.category === category);
    
    if (priority) {
      // 基本優先度スコア
      score += priority.priority * 5;
      
      // キーワードマッチングボーナス
      const matchedKeywords = priority.keywords.filter(keyword => 
        input.includes(keyword)
      );
      score += matchedKeywords.length * 10;
    }
    
    // 内部関数の場合は追加ボーナス
    if (this.isInternalFunction(tool)) {
      score += 100;
    }
    
    // 頻繁に使用されるツールへのボーナス
    if (this.isFrequentlyUsedTool(tool.name)) {
      score += 15;
    }
    
    // プロバイダー固有の優先度調整
    if (config?.preferredCategories) {
      const category = this.categorizeTools([tool])[0];
      const preferenceIndex = config.preferredCategories.indexOf(category);
      if (preferenceIndex !== -1) {
        // 優先カテゴリの順序に基づいてボーナス (最初=+30, 2番目=+20, など)
        score += (config.preferredCategories.length - preferenceIndex) * 10;
      }
    }
    
    return score;
  }

  /**
   * ツールをカテゴリに分類
   */
  private categorizeTools(tools: FunctionDefinition[]): ToolCategory[] {
    return tools.map(tool => {
      // 内部関数の判定
      if (this.isInternalFunction(tool)) {
        if (tool.name.includes('execute_command') || tool.name.includes('bash')) {
          return ToolCategory.INTERNAL_BASH;
        }
        return ToolCategory.INTERNAL_FILESYSTEM;
      }
      
      // 外部MCPツールのカテゴリ判定
      const name = tool.name.toLowerCase();
      const desc = (tool.description || '').toLowerCase();
      
      if (name.includes('serena') || desc.includes('code') || desc.includes('symbol')) {
        return ToolCategory.CODE_ANALYSIS;
      }
      
      if (name.includes('microsoft') || name.includes('azure') || desc.includes('documentation')) {
        return ToolCategory.DOCUMENTATION;
      }
      
      if (name.includes('google') || name.includes('search')) {
        return ToolCategory.SEARCH;
      }
      
      if (name.includes('web') || name.includes('fetch') || name.includes('http')) {
        return ToolCategory.WEB_FETCH;
      }
      
      return ToolCategory.OTHER;
    });
  }

  /**
   * 内部関数かどうかを判定
   */
  private isInternalFunction(tool: FunctionDefinition): boolean {
    const internalFunctionNames = [
      'read_text_file', 'write_file', 'list_directory', 'create_directory',
      'delete_file', 'delete_directory', 'get_file_info', 'change_directory',
      'get_current_directory', 'get_security_info', 'execute_command',
      'execute_command_interactive', 'get_bash_security_info'
    ];
    
    return internalFunctionNames.includes(tool.name);
  }

  /**
   * 頻繁に使用されるツールかどうかを判定
   */
  private isFrequentlyUsedTool(toolName: string): boolean {
    const frequentTools = [
      'read_text_file', 'list_directory', 'execute_command',
      'mcp__serena__get_symbols_overview', 'mcp__serena__find_symbol',
      'mcp__google-search__google_search'
    ];
    
    return frequentTools.includes(toolName);
  }

  /**
   * 特定のカテゴリに基づいてツールを選択
   */
  selectToolsByCategory(
    allTools: FunctionDefinition[], 
    preferredCategories: ToolCategory[]
  ): FunctionDefinition[] {
    const providerConfig = this.getCurrentProviderConfig();
    const maxTools = providerConfig.maxTools;
    
    const categorizedTools = allTools.map(tool => ({
      tool,
      category: this.categorizeTools([tool])[0]
    }));
    
    const selectedTools: FunctionDefinition[] = [];
    
    // 優先カテゴリから順番に選択
    for (const category of preferredCategories) {
      const categoryTools = categorizedTools
        .filter(t => t.category === category)
        .map(t => t.tool);
        
      selectedTools.push(...categoryTools);
      
      if (selectedTools.length >= maxTools) {
        break;
      }
    }
    
    return selectedTools.slice(0, maxTools);
  }

  /**
   * デバッグ用：ツール選択の詳細情報を取得
   */
  getSelectionDetails(input: string, allTools: FunctionDefinition[]): {
    provider: string;
    maxTools: number;
    strategy: string;
    totalTools: number;
    selectedTools: Array<{
      name: string;
      category: ToolCategory;
      score: number;
      isInternal: boolean;
    }>;
  } {
    const providerConfig = this.getCurrentProviderConfig();
    const lowercaseInput = input.toLowerCase();
    const scoredTools = allTools.map(tool => ({
      name: tool.name,
      category: this.categorizeTools([tool])[0],
      score: this.calculateToolScore(tool, lowercaseInput, providerConfig),
      isInternal: this.isInternalFunction(tool)
    }));
    
    scoredTools.sort((a, b) => b.score - a.score);
    
    return {
      provider: providerConfig.provider,
      maxTools: providerConfig.maxTools,
      strategy: providerConfig.toolSwitchingStrategy || 'context-aware',
      totalTools: allTools.length,
      selectedTools: scoredTools.slice(0, providerConfig.maxTools)
    };
  }

  /**
   * プロバイダー設定を更新（設定ファイルから読み込み用）
   */
  updateProviderConfig(config: Config): void {
    this.setProvider(config.llm.provider);
    
    // カスタム設定があれば上書き
    const providerConfig = this.getCurrentProviderConfig();
    logger.debug('Updated provider configuration', {
      provider: config.llm.provider,
      maxTools: providerConfig.maxTools,
      strategy: providerConfig.toolSwitchingStrategy
    });
  }

  /**
   * 利用可能なプロバイダー設定を取得
   */
  getAvailableProviders(): ProviderInfo[] {
    return Array.from(this.providerConfigs.values());
  }

  /**
   * プロバイダー別の推奨ツール使用パターンを取得
   */
  getRecommendedPatterns(): Record<string, string[]> {
    return {
      openai: [
        'コンテキスト認識型選択により、必要最小限のツールを動的選択',
        '内部関数を優先し、MCPツールは補完的に使用',
        'ツール実行結果を元に次回選択時の優先度を調整'
      ],
      anthropic: [
        'より多くのツール並列実行が可能なため、包括的なツールセットを提供',
        'バッチ処理をサポートし、複数ツールを組み合わせた複雑なタスクに対応',
        'ドキュメント参照と分析に特化したツール選択'
      ],
      'local-gptoss': [
        '静的ツール選択により、予測可能で安定した動作を保証',
        '必須ツールに限定し、計算量を最小化',
        '事前定義されたツールグループから選択'
      ],
      'local-lmstudio': [
        'より制限的なツールセットで効率的な処理',
        'ファイル操作とコード分析に特化',
        'リソース消費を最小限に抑えた選択戦略'
      ]
    };
  }
}
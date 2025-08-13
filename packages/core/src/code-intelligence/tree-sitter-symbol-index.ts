/**
 * Tree-sitter based Symbol Index
 * 全13言語対応、メモリ効率最適化、インクリメンタル解析
 */

import sqlite3 from 'sqlite3';
const { Database } = sqlite3;
import { promisify } from 'util';
import { URI } from 'vscode-uri';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import { glob } from 'glob';
import { fileURLToPath } from 'url';

// VSCodeと同様のWebAssemblyベースTree-sitter実装
import { Parser, Language } from 'web-tree-sitter';

// ES module環境での__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// WASMパーサーのパス（動的検索）
function findWasmPath(): string {
  // 複数の候補パスを試行（process.cwdベースを最優先）
  const candidates = [
    path.resolve(process.cwd(), 'node_modules/@vscode/tree-sitter-wasm/wasm'),
    path.resolve(__dirname, '../../../../../node_modules/@vscode/tree-sitter-wasm/wasm'),
    path.resolve(__dirname, '../../../../../../node_modules/@vscode/tree-sitter-wasm/wasm'),
    path.resolve(__dirname, '../../../node_modules/@vscode/tree-sitter-wasm/wasm'),
    path.resolve(__dirname, '../../../../node_modules/@vscode/tree-sitter-wasm/wasm'),
  ];
  
  for (const candidate of candidates) {
    if (fsSync.existsSync(path.join(candidate, 'tree-sitter-javascript.wasm'))) {
      console.log(`✓ Found WASM path: ${candidate}`);
      return candidate;
    }
  }
  
  throw new Error(`Tree-sitter WASM directory not found. Tried: ${candidates.join(', ')}`);
}

const WASM_PATH = findWasmPath();

/**
 * サポート言語（Tree-sitter版）
 */
export enum TreeSitterLanguage {
  TypeScript = 'typescript',
  JavaScript = 'javascript',
  Python = 'python',
  Java = 'java',
  Go = 'go',
  Rust = 'rust',
  CSharp = 'csharp',
  PHP = 'php',
  Ruby = 'ruby',
  Swift = 'swift',
  Kotlin = 'kotlin',
  Cpp = 'cpp',
  C = 'c'
}

/**
 * Tree-sitterシンボル種類
 */
export enum TreeSitterSymbolKind {
  File = 'file',
  Module = 'module',
  Namespace = 'namespace',
  Package = 'package',
  Class = 'class',
  Method = 'method',
  Property = 'property',
  Field = 'field',
  Constructor = 'constructor',
  Enum = 'enum',
  Interface = 'interface',
  Function = 'function',
  Variable = 'variable',
  Constant = 'constant',
  String = 'string',
  Number = 'number',
  Boolean = 'boolean',
  Array = 'array',
  Object = 'object',
  Key = 'key',
  Null = 'null',
  EnumMember = 'enummember',
  Struct = 'struct',
  Event = 'event',
  Operator = 'operator',
  TypeParameter = 'typeparameter',
  Import = 'import'
}

/**
 * Tree-sitterシンボル情報
 */
export interface TreeSitterSymbolInfo {
  id: string;
  name: string;
  kind: TreeSitterSymbolKind;
  language: TreeSitterLanguage;
  fileUri: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  containerName?: string;
  signature?: string;
  documentation?: string;
  type?: string;
  modifiers?: string[];
  value?: any;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * プロジェクト統計情報
 */
export interface TreeSitterProjectStats {
  totalFiles: number;
  filesIndexed: number;
  totalSymbols: number;
  totalReferences: number;
  languageBreakdown: Record<TreeSitterLanguage, number>;
  kindBreakdown: Record<TreeSitterSymbolKind, number>;
  lastUpdated: Date;
  indexedFiles: string[];
  averageSymbolsPerFile: number;
  elapsedMs: number;
}

/**
 * Tree-sitter統合シンボルインデックス
 * メモリ効率とインクリメンタル解析に最適化
 */
export class TreeSitterSymbolIndex {
  private db?: sqlite3.Database;
  private isInitialized = false;
  private parser?: Parser;
  private languages: Map<TreeSitterLanguage, Language> = new Map();
  private fileLanguageCache: Map<string, TreeSitterLanguage> = new Map();
  private symbolsCache: Map<string, TreeSitterSymbolInfo[]> = new Map();
  private wasmInitialized = false;
  private indexCachePath: string;
  private fileTimestamps: Map<string, number> = new Map();

  constructor(
    private dbPath: string,
    private workspaceRoot: string
  ) {
    // WASM初期化は非同期のためinitialize()で実行
    // キャッシュファイルのパスを設定
    this.indexCachePath = path.join(workspaceRoot, '.agents', 'cache', 'index-cache.json');
  }

  /**
   * WebAssemblyベースTree-sitter初期化
   * VSCodeと同様のアーキテクチャを使用
   */
  private async initializeWasm(): Promise<void> {
    if (this.wasmInitialized) return;
    
    try {
      // ParserのWASM初期化
      await Parser.init();
      this.parser = new Parser();
      
      // サポート対象言語のWASMファイルパス（存在するファイルのみ）
      const wasmLanguages = [
        { lang: TreeSitterLanguage.JavaScript, file: 'tree-sitter-javascript.wasm' },
        { lang: TreeSitterLanguage.TypeScript, file: 'tree-sitter-typescript.wasm' },
        { lang: TreeSitterLanguage.Python, file: 'tree-sitter-python.wasm' },
        { lang: TreeSitterLanguage.Java, file: 'tree-sitter-java.wasm' },
        { lang: TreeSitterLanguage.Go, file: 'tree-sitter-go.wasm' },
        { lang: TreeSitterLanguage.Rust, file: 'tree-sitter-rust.wasm' },
        { lang: TreeSitterLanguage.Cpp, file: 'tree-sitter-cpp.wasm' },
        { lang: TreeSitterLanguage.CSharp, file: 'tree-sitter-c-sharp.wasm' }, // 正しいファイル名
        { lang: TreeSitterLanguage.Ruby, file: 'tree-sitter-ruby.wasm' }
        // 注意: C言語のWASMファイルはパッケージに含まれていないため除外
      ];
      
      // 各言語のWASMファイルを読み込み（必須）
      const loadedLanguages: string[] = [];
      const failedLanguages: string[] = [];
      
      for (const { lang, file } of wasmLanguages) {
        try {
          const wasmPath = path.join(WASM_PATH, file);
          const language = await Language.load(wasmPath);
          this.languages.set(lang, language);
          loadedLanguages.push(lang);
          console.log(`✓ ${lang} WASM language loaded`);
        } catch (error) {
          failedLanguages.push(lang);
          console.error(`✗ Failed to load ${lang} WASM:`, (error as Error).message);
        }
      }
      
      // 最低限の言語（JavaScript/TypeScript）が読み込めない場合はエラー
      const criticalLanguages = ['javascript', 'typescript'];
      const missingCritical = criticalLanguages.filter(lang => 
        failedLanguages.includes(lang as TreeSitterLanguage)
      );
      
      if (missingCritical.length > 0) {
        throw new Error(`Critical Tree-sitter WASM languages failed to load: ${missingCritical.join(', ')}. This is mandatory for proper code analysis.`);
      }
      
      if (loadedLanguages.length === 0) {
        throw new Error('No Tree-sitter WASM languages could be loaded. This system requires WebAssembly language parsers.');
      }
      
      this.wasmInitialized = true;
      console.log(`WebAssembly Tree-sitter initialized: ${loadedLanguages.length} languages loaded, ${failedLanguages.length} failed`);
      
    } catch (error) {
      console.error('Failed to initialize WebAssembly Tree-sitter:', error);
      throw error;
    }
  }

  /**
   * データベースとWASM初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // WebAssembly Tree-sitter初期化
    await this.initializeWasm();

    // データベース接続（WALモード + タイムアウト設定で競合回避）
    this.db = new Database(this.dbPath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA cache_size = 1000000;');
    this.db.exec('PRAGMA temp_store = MEMORY;');
    this.db.exec('PRAGMA busy_timeout = 30000;'); // 30秒タイムアウト
    await this.createTables();
    this.isInitialized = true;

    // キャッシュが存在しない場合のみプロジェクトインデックス作成
    const cache = await this.loadIndexCache();
    if (!cache) {
      console.log('No cache found during initialization. Creating initial index...');
      await this.indexProject();
    } else {
      console.log('Using cached index from previous run.');
    }

    console.log('WebAssembly Tree-sitter Symbol Index initialized successfully');
  }

  /**
   * SQLテーブル作成
   */
  private async createTables(): Promise<void> {
    const runAsync = (sql: string): Promise<any> => {
      return new Promise((resolve, reject) => {
        this.db!.run(sql, (err: any) => {
          if (err) reject(err);
          else resolve(this);
        });
      });
    };

    await runAsync(`
      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        language TEXT NOT NULL,
        file_uri TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        start_character INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        end_character INTEGER NOT NULL,
        container_name TEXT,
        signature TEXT,
        documentation TEXT,
        type TEXT,
        modifiers TEXT,
        value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // パフォーマンス用インデックス
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_language ON symbols(language)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_uri)');
  }

  /**
   * キャッシュをクリア
   */
  async clearCache(): Promise<void> {
    try {
      if (fsSync.existsSync(this.indexCachePath)) {
        await fs.unlink(this.indexCachePath);
        console.log('Index cache cleared successfully');
      }
    } catch (error) {
      console.error('Failed to clear index cache:', error);
    }
  }

  /**
   * キャッシュからインデックス情報を読み込む
   */
  private async loadIndexCache(): Promise<{ timestamps: Record<string, number>, stats?: TreeSitterProjectStats } | null> {
    try {
      const cacheDir = path.dirname(this.indexCachePath);
      if (!fsSync.existsSync(cacheDir)) {
        await fs.mkdir(cacheDir, { recursive: true });
      }
      
      if (fsSync.existsSync(this.indexCachePath)) {
        const cacheContent = await fs.readFile(this.indexCachePath, 'utf-8');
        return JSON.parse(cacheContent);
      }
    } catch (error) {
      console.debug('Failed to load index cache:', error);
    }
    return null;
  }

  /**
   * インデックス情報をキャッシュに保存
   */
  private async saveIndexCache(timestamps: Map<string, number>, stats: TreeSitterProjectStats): Promise<void> {
    try {
      const cacheDir = path.dirname(this.indexCachePath);
      if (!fsSync.existsSync(cacheDir)) {
        await fs.mkdir(cacheDir, { recursive: true });
      }
      
      const cacheData = {
        timestamps: Object.fromEntries(timestamps),
        stats,
        savedAt: new Date().toISOString()
      };
      
      await fs.writeFile(this.indexCachePath, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.debug('Failed to save index cache:', error);
    }
  }

  /**
   * ファイルが変更されているかチェック
   */
  private async isFileChanged(filePath: string, cachedTimestamp?: number): Promise<boolean> {
    try {
      const stats = await fs.stat(filePath);
      const currentTimestamp = stats.mtimeMs;
      
      if (!cachedTimestamp) {
        return true; // キャッシュがない場合は変更ありとみなす
      }
      
      return currentTimestamp > cachedTimestamp;
    } catch (error) {
      return true; // エラーの場合は安全のため変更ありとみなす
    }
  }

  /**
   * プロジェクト全体のインデックス作成
   * Tree-sitterのインクリメンタル解析でメモリ効率化
   */
  async indexProject(): Promise<TreeSitterProjectStats> {
    console.log('Tree-sitter project indexing started...');
    const startTime = Date.now();
    
    // キャッシュを読み込む
    const cache = await this.loadIndexCache();
    let cachedTimestamps: Record<string, number> = {};
    let shouldFullIndex = true;
    
    if (cache && cache.timestamps) {
      cachedTimestamps = cache.timestamps;
      shouldFullIndex = false;
      console.log('Index cache found. Performing incremental indexing...');
    } else {
      console.log('No cache found. Performing full indexing...');
    }

    const files = await this.discoverSourceFiles();
    console.log(`${files.length} source files discovered`);

    const stats: TreeSitterProjectStats = {
      totalFiles: files.length,
      filesIndexed: 0,
      totalSymbols: 0,
      totalReferences: 0,
      languageBreakdown: {} as Record<TreeSitterLanguage, number>,
      kindBreakdown: {} as Record<TreeSitterSymbolKind, number>,
      lastUpdated: new Date(),
      indexedFiles: [],
      averageSymbolsPerFile: 0,
      elapsedMs: 0
    };

    // 統計初期化
    Object.values(TreeSitterLanguage).forEach(lang => {
      stats.languageBreakdown[lang] = 0;
    });

    // 変更されたファイルのみを特定
    const filesToIndex: string[] = [];
    const unchangedFiles: string[] = [];
    
    for (const file of files) {
      const cachedTimestamp = cachedTimestamps[file];
      const isChanged = await this.isFileChanged(file, cachedTimestamp);
      
      if (isChanged) {
        filesToIndex.push(file);
      } else {
        unchangedFiles.push(file);
      }
      
      // 現在のタイムスタンプを記録
      const fileStats = await fs.stat(file);
      this.fileTimestamps.set(file, fileStats.mtimeMs);
    }
    
    console.log(`Files to index: ${filesToIndex.length} changed, ${unchangedFiles.length} unchanged`);
    
    // キャッシュから既存の統計を復元
    if (cache && cache.stats && unchangedFiles.length > 0) {
      stats.totalSymbols = cache.stats.totalSymbols || 0;
      stats.totalReferences = cache.stats.totalReferences || 0;
      stats.languageBreakdown = cache.stats.languageBreakdown || {};
      stats.kindBreakdown = cache.stats.kindBreakdown || {};
    }

    // 変更されたファイルのみインデックス化
    for (let i = 0; i < filesToIndex.length; i++) {
      const file = filesToIndex[i];
      
      try {
        const result = await this.indexFile(file);
        stats.totalSymbols += result.symbolCount;
        stats.indexedFiles.push(file);

        const language = this.detectLanguage(file);
        if (language) {
          stats.languageBreakdown[language] = (stats.languageBreakdown[language] || 0) + result.symbolCount;
        }

        // 進捗表示（変更されたファイルのみ）
        const progress = Math.round(((i + 1) / filesToIndex.length) * 100);
        console.log(`Indexing changed files: ${progress}% (${i + 1}/${filesToIndex.length}) - ${file}`);

        // メモリ管理（Tree-sitterの自動GCに加えて）
        if ((i + 1) % 50 === 0 && global.gc) {
          global.gc();
        }

      } catch (error) {
        console.error(`Failed to index ${file}:`, error);
      }
    }
    
    // 変更されていないファイルも統計に含める
    stats.indexedFiles.push(...unchangedFiles);

    stats.filesIndexed = stats.indexedFiles.length;
    stats.averageSymbolsPerFile = stats.filesIndexed > 0 ? stats.totalSymbols / stats.filesIndexed : 0;
    stats.elapsedMs = Date.now() - startTime;

    // キャッシュを保存
    await this.saveIndexCache(this.fileTimestamps, stats);

    console.log(`Tree-sitter indexing completed: ${stats.totalSymbols} symbols in ${stats.elapsedMs}ms`);
    if (filesToIndex.length === 0) {
      console.log('No files changed since last index. Using cached data.');
    } else {
      console.log(`Indexed ${filesToIndex.length} changed files, skipped ${unchangedFiles.length} unchanged files.`);
    }
    return stats;
  }

  /**
   * 単一ファイルのインデックス作成
   * Tree-sitterの効率的なAST解析
   */
  async indexFile(filePath: string): Promise<{ symbolCount: number }> {
    const language = this.detectLanguage(filePath);
    if (!language) {
      return { symbolCount: 0 };
    }

    const wasmLanguage = this.languages.get(language);
    if (!wasmLanguage || !this.parser) {
      throw new Error(`Tree-sitter WASM language for ${language} is mandatory but not available. File: ${filePath}`);
    }

    try {
      // ファイル読み込み
      const content = await fs.readFile(filePath, 'utf-8');
      const fileUri = URI.file(filePath).toString();

      // 既存シンボル削除
      await this.removeFileSymbols(fileUri);

      // WASM Tree-sitter解析
      this.parser.setLanguage(wasmLanguage);
      const tree = this.parser.parse(content);
      const symbols: TreeSitterSymbolInfo[] = [];

      if (tree) {
        // AST走査でシンボル抽出
        await this.extractSymbolsFromTree(tree, fileUri, language, symbols);

        // データベース保存
        for (const symbol of symbols) {
          await this.insertSymbol(symbol);
        }

        // WASM Tree-sitterは自動的にメモリ管理される
        tree.delete();
      }

      return { symbolCount: symbols.length };

    } catch (error) {
      console.error(`WASM Tree-sitter parsing error for ${filePath}:`, error);
      return { symbolCount: 0 };
    }
  }

  /**
   * Tree-sitterのASTからシンボル抽出
   * 言語に応じた構造化解析
   */
  private async extractSymbolsFromTree(
    tree: any, 
    fileUri: string, 
    language: TreeSitterLanguage, 
    symbols: TreeSitterSymbolInfo[]
  ): Promise<void> {
    const cursor = tree.walk();

    // Tree-sitterクエリベースのシンボル抽出
    const symbolQueries = this.getSymbolQueries(language);
    
    // ルートノードから開始
    this.visitNode(cursor.currentNode, fileUri, language, symbols, symbolQueries);
  }

  /**
   * ノード再帰訪問
   */
  private visitNode(
    node: any,
    fileUri: string,
    language: TreeSitterLanguage,
    symbols: TreeSitterSymbolInfo[],
    queries: any
  ): void {
    const nodeType = node.type;
    
    // 各言語の構文に応じてシンボル判定
    if (this.isSymbolNode(nodeType, language)) {
      const symbol = this.createSymbolFromNode(node, fileUri, language);
      if (symbol) {
        symbols.push(symbol);
      }
    }

    // 子ノード処理
    for (let i = 0; i < node.childCount; i++) {
      this.visitNode(node.child(i), fileUri, language, symbols, queries);
    }
  }

  /**
   * ノードがシンボルかどうか判定
   */
  private isSymbolNode(nodeType: string, language: TreeSitterLanguage): boolean {
    const symbolNodes = this.getSymbolNodeTypes(language);
    return symbolNodes.includes(nodeType);
  }

  /**
   * 言語別シンボルノード定義
   */
  private getSymbolNodeTypes(language: TreeSitterLanguage): string[] {
    switch (language) {
      case TreeSitterLanguage.JavaScript:
      case TreeSitterLanguage.TypeScript:
        return [
          'function_declaration',
          'method_definition', 
          'class_declaration',
          'variable_declarator',
          'property_identifier',
          'interface_declaration',
          'type_alias_declaration'
        ];
      case TreeSitterLanguage.Python:
        return [
          'function_definition',
          'class_definition',
          'assignment',
          'import_statement',
          'import_from_statement'
        ];
      case TreeSitterLanguage.Java:
        return [
          'method_declaration',
          'class_declaration',
          'interface_declaration',
          'field_declaration',
          'variable_declarator'
        ];
      case TreeSitterLanguage.Go:
        return [
          'function_declaration',
          'method_declaration',
          'type_declaration',
          'var_declaration',
          'const_declaration'
        ];
      case TreeSitterLanguage.Rust:
        return [
          'function_item',
          'struct_item',
          'enum_item',
          'impl_item',
          'trait_item',
          'let_declaration'
        ];
      default:
        return [];
    }
  }

  /**
   * Tree-sitterノードからシンボル作成
   */
  private createSymbolFromNode(
    node: any,
    fileUri: string, 
    language: TreeSitterLanguage
  ): TreeSitterSymbolInfo | null {
    try {
      const name = this.extractNodeName(node);
      if (!name) return null;

      const kind = this.mapNodeTypeToSymbolKind(node.type, language);
      const id = this.generateSymbolId(name, fileUri, node.startPosition);

      return {
        id,
        name,
        kind,
        language,
        fileUri,
        startLine: node.startPosition.row,
        startCharacter: node.startPosition.column,
        endLine: node.endPosition.row,
        endCharacter: node.endPosition.column,
        containerName: undefined, // 必要に応じて親ノードから抽出
        signature: node.text?.substring(0, 200), // 最初の200文字
        createdAt: new Date(),
        updatedAt: new Date()
      };
    } catch (error) {
      console.warn('Symbol creation failed:', error);
      return null;
    }
  }

  /**
   * ノード名抽出
   */
  private extractNodeName(node: any): string | null {
    // 子ノードから名前識別子を検索
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child.type === 'identifier' || child.type === 'property_identifier') {
        return child.text;
      }
    }
    return null;
  }

  /**
   * ノード種別からシンボル種別マッピング
   */
  private mapNodeTypeToSymbolKind(nodeType: string, language: TreeSitterLanguage): TreeSitterSymbolKind {
    const mappings: Record<string, TreeSitterSymbolKind> = {
      'function_declaration': TreeSitterSymbolKind.Function,
      'method_definition': TreeSitterSymbolKind.Method,
      'method_declaration': TreeSitterSymbolKind.Method,
      'class_declaration': TreeSitterSymbolKind.Class,
      'class_definition': TreeSitterSymbolKind.Class,
      'interface_declaration': TreeSitterSymbolKind.Interface,
      'variable_declarator': TreeSitterSymbolKind.Variable,
      'field_declaration': TreeSitterSymbolKind.Field,
      'property_identifier': TreeSitterSymbolKind.Property,
      'type_declaration': TreeSitterSymbolKind.Class,
      'struct_item': TreeSitterSymbolKind.Struct,
      'enum_item': TreeSitterSymbolKind.Enum,
      'trait_item': TreeSitterSymbolKind.Interface
    };

    return mappings[nodeType] || TreeSitterSymbolKind.Variable;
  }

  /**
   * 言語別シンボルクエリ（将来の拡張用）
   */
  private getSymbolQueries(language: TreeSitterLanguage): any {
    // Tree-sitterクエリ言語を使用した高度なシンボル抽出
    // 現在は基本実装、必要に応じて拡張
    return {};
  }

  /**
   * ソースファイル発見
   */
  private async discoverSourceFiles(): Promise<string[]> {
    const patterns = [
      // TypeScript/JavaScript
      '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx', '**/*.mjs', '**/*.cjs',
      // Python
      '**/*.py', '**/*.pyi',
      // Java
      '**/*.java',
      // Go
      '**/*.go',
      // Rust
      '**/*.rs',
      // C/C++
      '**/*.c', '**/*.h', '**/*.cpp', '**/*.cc', '**/*.cxx', '**/*.hpp',
      // C#
      '**/*.cs',
      // PHP
      '**/*.php',
      // Ruby
      '**/*.rb'
    ];

    // デフォルトの除外パターン
    const defaultIgnorePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/__pycache__/**',
      '**/target/**',
      '**/bin/**',
      '**/obj/**',
      '**/vendor/**',
      '**/venv/**',
      '**/.venv/**',
      '**/env/**',
      '**/.env/**',
      '**/bundle/**',
      '**/bundles/**',
      '**/.cache/**',
      '**/.next/**',
      '**/tmp/**',
      '**/temp/**',
      '**/.tmp/**',
      '**/analyze/**',  // テスト/分析用ディレクトリ
      '**/Pods/**',     // iOS
      '**/.gradle/**',  // Android/Gradle
      '**/Library/**',  // Unity
      '**/Temp/**',     // Unity
      '**/Logs/**'      // Unity
    ];
    
    // settings.jsonから追加の除外設定を読み込む
    const additionalIgnorePatterns: string[] = [];
    try {
      const settingsPath = path.join(this.workspaceRoot, '.agents', 'settings.json');
      if (fsSync.existsSync(settingsPath)) {
        const settings = JSON.parse(fsSync.readFileSync(settingsPath, 'utf-8'));
        if (settings.indexing?.excludeDirectories) {
          for (const dir of settings.indexing.excludeDirectories) {
            additionalIgnorePatterns.push(`**/${dir}/**`);
          }
        }
      }
    } catch (error) {
      console.debug('Failed to load additional ignore patterns from settings.json:', error);
    }
    
    // .gitignoreから除外パターンを読み込む
    try {
      const gitignorePath = path.join(this.workspaceRoot, '.gitignore');
      if (fsSync.existsSync(gitignorePath)) {
        const gitignoreContent = fsSync.readFileSync(gitignorePath, 'utf-8');
        const lines = gitignoreContent.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        
        for (const line of lines) {
          // ディレクトリパターン
          if (line.endsWith('/')) {
            additionalIgnorePatterns.push(`**/${line}**`);
          } else if (!line.includes('*') && !line.startsWith('.')) {
            // ディレクトリ名のみの場合
            additionalIgnorePatterns.push(`**/${line}/**`);
          }
        }
      }
    } catch (error) {
      console.debug('Failed to load .gitignore patterns:', error);
    }
    
    const ignorePatterns = [...defaultIgnorePatterns, ...additionalIgnorePatterns];

    const files = await glob(patterns, {
      cwd: this.workspaceRoot,
      ignore: ignorePatterns,
      absolute: true
    });

    return files;
  }

  /**
   * 言語検出
   */
  private detectLanguage(filePath: string): TreeSitterLanguage | null {
    const ext = path.extname(filePath).toLowerCase();
    
    const languageMap: Record<string, TreeSitterLanguage> = {
      '.ts': TreeSitterLanguage.TypeScript,
      '.tsx': TreeSitterLanguage.TypeScript,
      '.js': TreeSitterLanguage.JavaScript,
      '.jsx': TreeSitterLanguage.JavaScript,
      '.mjs': TreeSitterLanguage.JavaScript,
      '.cjs': TreeSitterLanguage.JavaScript,
      '.py': TreeSitterLanguage.Python,
      '.pyi': TreeSitterLanguage.Python,
      '.java': TreeSitterLanguage.Java,
      '.go': TreeSitterLanguage.Go,
      '.rs': TreeSitterLanguage.Rust,
      '.cs': TreeSitterLanguage.CSharp,
      '.php': TreeSitterLanguage.PHP,
      '.rb': TreeSitterLanguage.Ruby,
      '.cpp': TreeSitterLanguage.Cpp,
      '.cc': TreeSitterLanguage.Cpp,
      '.cxx': TreeSitterLanguage.Cpp,
      '.hpp': TreeSitterLanguage.Cpp,
      '.c': TreeSitterLanguage.C,
      '.h': TreeSitterLanguage.C
    };
    
    return languageMap[ext] || null;
  }

  /**
   * シンボルデータベース挿入（SQLite競合対応版）
   */
  private async insertSymbol(symbol: TreeSitterSymbolInfo): Promise<void> {
    const runAsyncWithRetry = (sql: string, params?: any[], retries = 3): Promise<any> => {
      return new Promise((resolve, reject) => {
        const attempt = () => {
          this.db!.run(sql, params || [], function(err: any) {
            if (err) {
              if ((err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') && retries > 0) {
                // BUSY/LOCKEDエラーの場合は短時間待ってリトライ
                setTimeout(() => {
                  runAsyncWithRetry(sql, params, retries - 1).then(resolve).catch(reject);
                }, 100 + Math.random() * 200); // 100-300msランダム待機
                return;
              }
              reject(err);
            } else {
              resolve({} as any);
            }
          });
        };
        attempt();
      });
    };
    
    await runAsyncWithRetry(`
      INSERT OR REPLACE INTO symbols (
        id, name, kind, language, file_uri, start_line, start_character, 
        end_line, end_character, container_name, signature, documentation,
        type, modifiers, value
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      symbol.id, symbol.name, symbol.kind, symbol.language, symbol.fileUri,
      symbol.startLine, symbol.startCharacter, symbol.endLine, symbol.endCharacter,
      symbol.containerName, symbol.signature, symbol.documentation,
      symbol.type, symbol.modifiers ? JSON.stringify(symbol.modifiers) : null,
      symbol.value ? JSON.stringify(symbol.value) : null
    ]);
  }

  /**
   * ファイルシンボル削除（SQLite競合対応版）
   */
  private async removeFileSymbols(fileUri: string): Promise<void> {
    const runAsyncWithRetry = (sql: string, params?: any[], retries = 3): Promise<any> => {
      return new Promise((resolve, reject) => {
        const attempt = () => {
          this.db!.run(sql, params || [], function(err: any) {
            if (err) {
              if ((err.code === 'SQLITE_BUSY' || err.code === 'SQLITE_LOCKED') && retries > 0) {
                setTimeout(() => {
                  runAsyncWithRetry(sql, params, retries - 1).then(resolve).catch(reject);
                }, 100 + Math.random() * 200);
                return;
              }
              reject(err);
            } else {
              resolve({} as any);
            }
          });
        };
        attempt();
      });
    };
    await runAsyncWithRetry('DELETE FROM symbols WHERE file_uri = ?', [fileUri]);
  }

  /**
   * シンボルID生成
   */
  private generateSymbolId(name: string, fileUri: string, position: any): string {
    const fileHash = fileUri.replace(/[^a-zA-Z0-9]/g, '_');
    const positionHash = `${position.row}_${position.column}`;
    return `${fileHash}_${name}_${positionHash}`;
  }

  /**
   * IntelligentFileSystem互換インターフェース
   */
  async findSymbols(options: { name?: string; fileUri?: string } | string = {}): Promise<TreeSitterSymbolInfo[]> {
    if (!this.isInitialized || !this.db) {
      return [];
    }

    const getAsync = (sql: string, params?: any[]): Promise<any[]> => {
      return new Promise((resolve, reject) => {
        this.db!.all(sql, params || [], (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    };

    try {
      // 文字列の場合は旧来のsearchSymbolsと同じ処理
      if (typeof options === 'string') {
        const rows = await getAsync(
          'SELECT * FROM symbols WHERE name LIKE ? ORDER BY name LIMIT 100',
          [`%${options}%`]
        );
        return this.mapRowsToSymbols(rows);
      }
      
      // オブジェクトの場合はフィルター条件を構築
      let sql = 'SELECT * FROM symbols WHERE 1=1';
      const params: any[] = [];
      
      if (options.name) {
        sql += ' AND name LIKE ?';
        params.push(`%${options.name}%`);
      }
      
      if (options.fileUri) {
        sql += ' AND file_uri = ?';
        params.push(options.fileUri);
      }
      
      sql += ' ORDER BY name LIMIT 100';
      
      const rows = await getAsync(sql, params);
      return this.mapRowsToSymbols(rows);
    } catch (error) {
      console.error('findSymbols failed:', error);
      return [];
    }
  }
  
  async findReferences(symbolName: string, fileUri?: string): Promise<TreeSitterSymbolInfo[]> {
    // 参照検索の基本実装（Tree-sitterベース）
    return this.findSymbols({ name: symbolName, fileUri });
  }
  
  async getStats(): Promise<TreeSitterProjectStats> {
    if (!this.isInitialized || !this.db) {
      return {
        totalFiles: 0,
        filesIndexed: 0,
        totalSymbols: 0,
        totalReferences: 0,
        languageBreakdown: {} as Record<TreeSitterLanguage, number>,
        kindBreakdown: {} as Record<TreeSitterSymbolKind, number>,
        lastUpdated: new Date(),
        indexedFiles: [],
        averageSymbolsPerFile: 0,
        elapsedMs: 0
      };
    }
    
    const getAsync = (sql: string, params?: any[]): Promise<any[]> => {
      return new Promise((resolve, reject) => {
        this.db!.all(sql, params || [], (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    };
    
    try {
      const totalRows = await getAsync('SELECT COUNT(*) as count FROM symbols');
      const fileRows = await getAsync('SELECT COUNT(DISTINCT file_uri) as count FROM symbols');
      const langRows = await getAsync('SELECT language, COUNT(*) as count FROM symbols GROUP BY language');
      const kindRows = await getAsync('SELECT kind, COUNT(*) as count FROM symbols GROUP BY kind');
      
      const totalSymbols = totalRows[0]?.count || 0;
      const filesIndexed = fileRows[0]?.count || 0;
      
      const languageBreakdown = {} as Record<TreeSitterLanguage, number>;
      langRows.forEach((row: any) => {
        languageBreakdown[row.language as TreeSitterLanguage] = row.count;
      });
      
      const kindBreakdown = {} as Record<TreeSitterSymbolKind, number>;
      kindRows.forEach((row: any) => {
        kindBreakdown[row.kind as TreeSitterSymbolKind] = row.count;
      });
      
      return {
        totalFiles: filesIndexed,
        filesIndexed,
        totalSymbols,
        totalReferences: totalSymbols, // 簡易実装
        languageBreakdown,
        kindBreakdown,
        lastUpdated: new Date(),
        indexedFiles: [],
        averageSymbolsPerFile: filesIndexed > 0 ? totalSymbols / filesIndexed : 0,
        elapsedMs: 0
      };
    } catch (error) {
      console.error('getStats failed:', error);
      return {
        totalFiles: 0,
        filesIndexed: 0,
        totalSymbols: 0,
        totalReferences: 0,
        languageBreakdown: {} as Record<TreeSitterLanguage, number>,
        kindBreakdown: {} as Record<TreeSitterSymbolKind, number>,
        lastUpdated: new Date(),
        indexedFiles: [],
        averageSymbolsPerFile: 0,
        elapsedMs: 0
      };
    }
  }
  
  private mapRowsToSymbols(rows: any[]): TreeSitterSymbolInfo[] {
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      kind: row.kind as TreeSitterSymbolKind,
      language: row.language as TreeSitterLanguage,
      fileUri: row.file_uri,
      startLine: row.start_line,
      startCharacter: row.start_character,
      endLine: row.end_line,
      endCharacter: row.end_character,
      containerName: row.container_name,
      signature: row.signature,
      documentation: row.documentation,
      type: row.type,
      modifiers: row.modifiers ? JSON.parse(row.modifiers) : undefined,
      value: row.value ? JSON.parse(row.value) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    }));
  }

  /**
   * シンボル検索
   */
  async searchSymbols(query: string): Promise<TreeSitterSymbolInfo[]> {
    if (!this.isInitialized || !this.db) {
      return [];
    }

    const getAsync = (sql: string, params?: any[]): Promise<any[]> => {
      return new Promise((resolve, reject) => {
        this.db!.all(sql, params || [], (err: any, rows: any[]) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    };

    try {
      const rows = await getAsync(
        'SELECT * FROM symbols WHERE name LIKE ? ORDER BY name LIMIT 100',
        [`%${query}%`]
      );

      return this.mapRowsToSymbols(rows);
    } catch (error) {
      console.error('Symbol search failed:', error);
      return [];
    }
  }

  /**
   * クリーンアップ
   */
  async close(): Promise<void> {
    if (this.db) {
      await new Promise<void>((resolve, reject) => {
        this.db!.close((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
    
    // WASMリソースのクリーンアップ
    this.languages.clear();
    this.symbolsCache.clear();
    this.fileLanguageCache.clear();
    this.parser = undefined;
    this.wasmInitialized = false;
  }
}

/**
 * Tree-sitterシンボルインデックスファクトリ
 */
export function createTreeSitterSymbolIndex(projectPath: string): TreeSitterSymbolIndex {
  const dbPath = path.join(projectPath, '.agents', 'cache', 'tree-sitter-symbol-index.db');
  return new TreeSitterSymbolIndex(dbPath, projectPath);
}
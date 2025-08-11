/**
 * 多言語対応シンボルインデックス
 * TypeScript、JavaScript、Python、Java、Go、Rust、C#、PHP、Ruby等に対応
 */

import { Database } from 'sqlite3';
import { promisify } from 'util';
import { URI } from 'vscode-uri';
import * as path from 'path';
import * as fs from 'fs/promises';
import { glob } from 'glob';
import * as ts from 'typescript';

// Babelパーサー（JavaScript/JSX解析用）
let babelParser: any;
let babelTraverse: any;
try {
  babelParser = require('@babel/parser');
  babelTraverse = require('@babel/traverse').default;
} catch (e) {
  console.warn('Babel parser not available, JavaScript parsing will be limited');
}

/**
 * サポートされる言語
 */
export enum SupportedLanguage {
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
 * 多言語対応シンボル種類
 */
export enum SymbolKind {
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
  EnumMember = 'enumMember',
  Struct = 'struct',
  Event = 'event',
  Operator = 'operator',
  TypeParameter = 'typeParameter',
  Import = 'import',
  Export = 'export',
  Decorator = 'decorator',
  Trait = 'trait',
  Macro = 'macro'
}

export interface SymbolIndexInfo {
  id: string;
  name: string;
  kind: SymbolKind;
  language: string; // 互換性のためstringに変更
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
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface ReferenceInfo {
  id: string;
  symbolId: string;
  fileUri: string;
  startLine: number;
  startCharacter: number;
  context?: string;
  isWriteAccess?: boolean;
  isDefinition?: boolean;
  createdAt: Date;
}

/**
 * シンボル検索クエリ
 */
export interface SymbolQuery {
  name?: string;
  kind?: SymbolKind | string;
  language?: SupportedLanguage;
  fileUri?: string;
  containerName?: string;
  exactMatch?: boolean;
  caseSensitive?: boolean;
  limit?: number;
}

export interface ProjectIndexStats {
  totalFiles: number;
  totalSymbols: number;
  totalReferences: number;
  languageBreakdown: Record<SupportedLanguage, number>;
  kindBreakdown: Record<SymbolKind, number>;
  lastUpdated: Date;
  indexedFiles: string[];
  averageSymbolsPerFile: number;
}

/**
 * 言語パーサーインターフェース
 */
interface LanguageParser {
  language: SupportedLanguage;
  extensions: string[];
  parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]>;
  findReferences?(symbol: SymbolIndexInfo, allFiles: string[]): Promise<ReferenceInfo[]>;
}

/**
 * 多言語対応シンボルインデックス
 * TypeScript、JavaScript、Python、Java、Go、Rust等をサポート
 */
export class SymbolIndex {
  private db?: Database;
  private isInitialized = false;
  private parsers: Map<SupportedLanguage, LanguageParser> = new Map();
  private fileLanguageCache: Map<string, SupportedLanguage> = new Map();
  private symbolsCache: Map<string, SymbolIndexInfo[]> = new Map();
  private referencesCache: Map<string, ReferenceInfo[]> = new Map();

  constructor(
    private dbPath: string,
    private workspaceRoot: string
  ) {
    this.initializeParsers();
  }

  /**
   * 言語パーサーを初期化
   */
  private initializeParsers(): void {
    this.parsers.set(SupportedLanguage.TypeScript, new TypeScriptParser());
    this.parsers.set(SupportedLanguage.JavaScript, new JavaScriptParser());
    this.parsers.set(SupportedLanguage.Python, new PythonParser());
    this.parsers.set(SupportedLanguage.Java, new JavaParser());
    this.parsers.set(SupportedLanguage.Go, new GoParser());
    this.parsers.set(SupportedLanguage.Rust, new RustParser());
    this.parsers.set(SupportedLanguage.CSharp, new CSharpParser());
    this.parsers.set(SupportedLanguage.PHP, new PHPParser());
    this.parsers.set(SupportedLanguage.Ruby, new RubyParser());
    this.parsers.set(SupportedLanguage.Swift, new SwiftParser());
    this.parsers.set(SupportedLanguage.Kotlin, new KotlinParser());
    this.parsers.set(SupportedLanguage.Cpp, new CppParser());
    this.parsers.set(SupportedLanguage.C, new CParser());
  }

  /**
   * ファイルの言語を判定
   */
  private detectLanguage(filePath: string): SupportedLanguage | null {
    const ext = path.extname(filePath).toLowerCase();
    
    const languageMap: Record<string, SupportedLanguage> = {
      '.ts': SupportedLanguage.TypeScript,
      '.tsx': SupportedLanguage.TypeScript,
      '.js': SupportedLanguage.JavaScript,
      '.jsx': SupportedLanguage.JavaScript,
      '.mjs': SupportedLanguage.JavaScript,
      '.cjs': SupportedLanguage.JavaScript,
      '.py': SupportedLanguage.Python,
      '.pyi': SupportedLanguage.Python,
      '.java': SupportedLanguage.Java,
      '.go': SupportedLanguage.Go,
      '.rs': SupportedLanguage.Rust,
      '.cs': SupportedLanguage.CSharp,
      '.php': SupportedLanguage.PHP,
      '.rb': SupportedLanguage.Ruby,
      '.swift': SupportedLanguage.Swift,
      '.kt': SupportedLanguage.Kotlin,
      '.kts': SupportedLanguage.Kotlin,
      '.cpp': SupportedLanguage.Cpp,
      '.cc': SupportedLanguage.Cpp,
      '.cxx': SupportedLanguage.Cpp,
      '.hpp': SupportedLanguage.Cpp,
      '.c': SupportedLanguage.C,
      '.h': SupportedLanguage.C
    };

    return languageMap[ext] || null;
  }

  /**
   * データベースを初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // データベースディレクトリを作成
    const dbDir = path.dirname(this.dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    // SQLiteデータベース初期化
    const sqlite3 = require('sqlite3');
    this.db = new sqlite3.Database(this.dbPath);
    await this.setupDatabase();

    this.isInitialized = true;
    console.log(`多言語対応シンボルインデックス初期化完了: ${this.dbPath}`);
  }

  /**
   * データベーススキーマの作成（多言語対応）
   */
  private async setupDatabase(): Promise<void> {
    const runAsync = (sql: string, params?: any[]): Promise<any> => {
      return new Promise((resolve, reject) => {
        this.db!.run(sql, params || [], function(err: any) {
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

    await runAsync(`
      CREATE TABLE IF NOT EXISTS symbol_references (
        id TEXT PRIMARY KEY,
        symbol_id TEXT,
        file_uri TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        start_character INTEGER NOT NULL,
        context TEXT,
        is_write_access INTEGER DEFAULT 0,
        is_definition INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (symbol_id) REFERENCES symbols (id) ON DELETE CASCADE
      )
    `);

    await runAsync(`
      CREATE TABLE IF NOT EXISTS project_metadata (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // インデックス作成（多言語対応）
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_language ON symbols(language)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_uri)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_name_language ON symbols(name, language)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_references_symbol ON symbol_references(symbol_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_references_file ON symbol_references(file_uri)');
  }

  /**
   * プロジェクト全体のインデックス作成（多言語対応）
   */
  async indexProject(): Promise<ProjectIndexStats> {
    await this.ensureInitialized();

    console.log('多言語プロジェクトのインデックスを開始...');
    const startTime = Date.now();

    // 全言語のソースファイルを検索
    const files = await this.discoverSourceFiles();
    console.log(`${files.length}個のソースファイルを発見`);

    const stats: ProjectIndexStats = {
      totalFiles: files.length,
      totalSymbols: 0,
      totalReferences: 0,
      languageBreakdown: {} as Record<SupportedLanguage, number>,
      kindBreakdown: {} as Record<SymbolKind, number>,
      lastUpdated: new Date(),
      indexedFiles: [],
      averageSymbolsPerFile: 0
    };

    // 言語別統計を初期化
    Object.values(SupportedLanguage).forEach(lang => {
      stats.languageBreakdown[lang] = 0;
    });
    Object.values(SymbolKind).forEach(kind => {
      stats.kindBreakdown[kind] = 0;
    });

    // 並列処理でファイルをインデックス
    const batchSize = 10; // 並列度制限
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);
      const batchPromises = batch.map(file => this.indexFile(file));
      
      try {
        const results = await Promise.allSettled(batchPromises);
        
        for (let j = 0; j < results.length; j++) {
          const result = results[j];
          const file = batch[j];
          const language = this.detectLanguage(file);
          
          if (result.status === 'fulfilled') {
            stats.totalSymbols += result.value.symbolCount;
            if (language) {
              stats.languageBreakdown[language] += result.value.symbolCount;
            }
            stats.indexedFiles.push(file);
            console.log(`インデックス完了: ${file} (${result.value.symbolCount}シンボル, ${language})`);
          } else {
            console.error(`インデックスに失敗 ${file}:`, result.reason);
          }
        }

        // 進捗表示
        const progress = Math.round(((i + batchSize) / files.length) * 100);
        console.log(`進捗: ${progress}% (${Math.min(i + batchSize, files.length)}/${files.length})`);
      } catch (error) {
        console.error('バッチインデックスエラー:', error);
      }
    }

    // 平均値を計算
    stats.averageSymbolsPerFile = stats.indexedFiles.length > 0 
      ? stats.totalSymbols / stats.indexedFiles.length 
      : 0;

    // 統計情報を保存
    await this.saveProjectStats(stats);

    const duration = Date.now() - startTime;
    console.log(`多言語インデックス完了: ${duration}ms`);
    console.log(`${stats.indexedFiles.length}ファイルから${stats.totalSymbols}シンボルをインデックス`);
    console.log('言語別内訳:', stats.languageBreakdown);

    return stats;
  }

  /**
   * 単一ファイルのインデックス作成（多言語対応）
   */
  async indexFile(filePath: string): Promise<{ symbolCount: number }> {
    await this.ensureInitialized();

    const fileUri = URI.file(filePath).toString();
    
    // 言語を判定
    const language = this.detectLanguage(filePath);
    if (!language) {
      console.warn(`未サポートのファイル: ${filePath}`);
      return { symbolCount: 0 };
    }

    // パーサーを取得
    const parser = this.parsers.get(language);
    if (!parser) {
      console.warn(`${language}用のパーサーが見つかりません: ${filePath}`);
      return { symbolCount: 0 };
    }

    // 既存のシンボルを削除
    await this.removeFileSymbols(fileUri);

    try {
      // ファイル内容を読み取り
      const content = await fs.readFile(filePath, 'utf-8');
      
      // 言語固有のパーサーでシンボルを抽出
      const symbols = await parser.parseFile(filePath, content);
      
      // シンボルをデータベースに保存
      for (const symbol of symbols) {
        symbol.language = language;
        symbol.fileUri = fileUri;
        await this.insertSymbol(symbol);
      }

      // 言語とファイルをキャッシュ
      this.fileLanguageCache.set(fileUri, language);

      return { symbolCount: symbols.length };
    } catch (error) {
      console.error(`ファイルのインデックス作成に失敗 ${filePath}:`, error);
      return { symbolCount: 0 };
    }
  }

  /**
   * シンボル検索（多言語対応）
   */
  async findSymbols(query: SymbolQuery): Promise<SymbolIndexInfo[]> {
    await this.ensureInitialized();

    const conditions: string[] = [];
    const params: any[] = [];

    if (query.name) {
      if (query.exactMatch) {
        conditions.push('name = ?');
        params.push(query.name);
      } else if (query.caseSensitive) {
        conditions.push('name LIKE ?');
        params.push(`%${query.name}%`);
      } else {
        conditions.push('LOWER(name) LIKE LOWER(?)');
        params.push(`%${query.name}%`);
      }
    }

    if (query.kind) {
      conditions.push('kind = ?');
      params.push(query.kind);
    }

    if (query.language) {
      conditions.push('language = ?');
      params.push(query.language);
    }

    if (query.fileUri) {
      conditions.push('file_uri = ?');
      params.push(query.fileUri);
    }

    if (query.containerName) {
      conditions.push('container_name = ?');
      params.push(query.containerName);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = query.limit ? `LIMIT ${query.limit}` : '';
    
    const sql = `
      SELECT * FROM symbols 
      ${whereClause} 
      ORDER BY language, name, file_uri
      ${limitClause}
    `;

    return new Promise((resolve, reject) => {
      this.db!.all(sql, params, (err: any, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const symbols = rows.map(this.rowToSymbolInfo);
          resolve(symbols);
        }
      });
    });
  }

  /**
   * シンボルの参照検索（Serenaのfind_referencing_symbolsと同等）
   */
  async findReferences(symbolName: string, fileUri?: string): Promise<ReferenceInfo[]> {
    await this.ensureInitialized();

    // まずシンボルを特定
    const symbols = await this.findSymbols({ name: symbolName, fileUri });
    if (symbols.length === 0) return [];

    const symbolId = symbols[0].id;

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT * FROM symbol_references 
        WHERE symbol_id = ? 
        ORDER BY file_uri, start_line
      `;
      
      this.db!.all(sql, [symbolId], (err: any, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const references = rows.map(this.rowToReferenceInfo);
          resolve(references);
        }
      });
    });
  }

  /**
   * プロジェクト統計情報を取得
   */
  async getProjectStats(): Promise<ProjectIndexStats | null> {
    await this.ensureInitialized();

    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          (SELECT COUNT(*) FROM symbols) as total_symbols,
          (SELECT COUNT(*) FROM symbol_references) as total_references,
          (SELECT COUNT(DISTINCT file_uri) FROM symbols) as total_files
      `;
      
      this.db!.get(sql, (err: any, row: any) => {
        if (err) {
          reject(err);
        } else if (row) {
          resolve({
            totalSymbols: row.total_symbols,
            totalReferences: row.total_references,
            totalFiles: row.total_files,
            lastUpdated: new Date(),
            indexedFiles: [], // 簡略化
            languageBreakdown: {} as Record<SupportedLanguage, number>,
            kindBreakdown: {} as Record<SymbolKind, number>,
            averageSymbolsPerFile: row.total_files > 0 ? row.total_symbols / row.total_files : 0
          });
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * データベースを閉じる
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

    this.isInitialized = false;
    if (this.symbolsCache) this.symbolsCache.clear();
    if (this.referencesCache) this.referencesCache.clear();
  }

  // プライベートメソッド

  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  private async discoverSourceFiles(): Promise<string[]> {
    // 多言語対応のファイルパターン
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
      // C#
      '**/*.cs',
      // PHP
      '**/*.php',
      // Ruby
      '**/*.rb',
      // Swift
      '**/*.swift',
      // Kotlin
      '**/*.kt', '**/*.kts',
      // C/C++
      '**/*.c', '**/*.h', '**/*.cpp', '**/*.cc', '**/*.cxx', '**/*.hpp'
    ];

    const ignorePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/__pycache__/**',
      '**/target/**',     // Rust/Java
      '**/bin/**',        // C#
      '**/obj/**',        // C#
      '**/vendor/**',     // Go/PHP
      '**/.venv/**',      // Python
      '**/venv/**',       // Python
      '**/.pytest_cache/**',
      '**/cmake-build*/**'
    ];

    const files = await glob(patterns, {
      cwd: this.workspaceRoot,
      ignore: ignorePatterns,
      absolute: true
    });

    return files;
  }

  private async processDocumentSymbols(symbols: any[], fileUri: string, containerName?: string): Promise<void> {
    for (const symbol of symbols) {
      const symbolId = this.generateDocumentSymbolId(symbol, fileUri);
      
      await this.insertSymbol({
        id: symbolId,
        name: symbol.name,
        kind: symbol.kind,
        language: this.detectLanguageFromUri(fileUri),
        fileUri,
        startLine: symbol.range.start.line,
        startCharacter: symbol.range.start.character,
        endLine: symbol.range.end.line,
        endCharacter: symbol.range.end.character,
        containerName,
        signature: symbol.detail,
        documentation: undefined, // DocumentSymbolにはdocumentationプロパティがない
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // 子シンボルを再帰処理
      if (symbol.children && symbol.children.length > 0) {
        await this.processDocumentSymbols(symbol.children, fileUri, symbol.name);
      }
    }
  }

  private async insertSymbol(symbol: SymbolIndexInfo): Promise<void> {
    const runAsync = (sql: string, params?: any[]): Promise<any> => {
      return new Promise((resolve, reject) => {
        this.db!.run(sql, params || [], function(err: any) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    };
    
    await runAsync(`
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

  private async removeFileSymbols(fileUri: string): Promise<void> {
    const runAsync = (sql: string, params?: any[]): Promise<any> => {
      return new Promise((resolve, reject) => {
        this.db!.run(sql, params || [], function(err: any) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    };
    await runAsync('DELETE FROM symbols WHERE file_uri = ?', [fileUri]);
    await runAsync('DELETE FROM symbol_references WHERE file_uri = ?', [fileUri]);
  }

  private async countSymbolsInFile(fileUri: string): Promise<number> {
    return new Promise((resolve, reject) => {
      this.db!.get(
        'SELECT COUNT(*) as count FROM symbols WHERE file_uri = ?',
        [fileUri],
        (err: any, row: any) => {
          if (err) reject(err);
          else resolve(row.count);
        }
      );
    });
  }

  private async saveProjectStats(stats: ProjectIndexStats): Promise<void> {
    const runAsync = (sql: string, params?: any[]): Promise<any> => {
      return new Promise((resolve, reject) => {
        this.db!.run(sql, params || [], function(err: any) {
          if (err) reject(err);
          else resolve(this);
        });
      });
    };
    
    await runAsync(`
      INSERT OR REPLACE INTO project_metadata (key, value) 
      VALUES ('stats', ?)`, [JSON.stringify(stats)]);
  }

  private generateDocumentSymbolId(symbol: any, fileUri: string): string {
    const location = `${fileUri}:${symbol.range.start.line}:${symbol.range.start.character}`;
    return `${symbol.name}@${location}`;
  }

  private rowToSymbolInfo(row: any): SymbolIndexInfo {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      language: row.language,
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
    };
  }

  private rowToReferenceInfo(row: any): ReferenceInfo {
    return {
      id: row.id,
      symbolId: row.symbol_id,
      fileUri: row.file_uri,
      startLine: row.start_line,
      startCharacter: row.start_character,
      context: row.context,
      isWriteAccess: Boolean(row.is_write_access),
      isDefinition: Boolean(row.is_definition),
      createdAt: new Date(row.created_at)
    };
  }

  /**
   * シンボルIDを生成
   */
  private generateSymbolId(name: string, fileUri: string, line: number, character: number): string {
    return `${name}@${fileUri}:${line}:${character}_${Date.now()}`;
  }

  /**
   * ファイルURIから言語を推定
   */
  private detectLanguageFromUri(fileUri: string): string {
    const parsed = URI.parse(fileUri);
    const ext = path.extname(parsed.path).toLowerCase();
    
    const languageMap: Record<string, string> = {
      '.ts': SupportedLanguage.TypeScript,
      '.tsx': SupportedLanguage.TypeScript,
      '.js': SupportedLanguage.JavaScript,
      '.jsx': SupportedLanguage.JavaScript,
      '.py': SupportedLanguage.Python,
      '.java': SupportedLanguage.Java,
      '.go': SupportedLanguage.Go,
      '.rs': SupportedLanguage.Rust,
      '.cs': SupportedLanguage.CSharp,
      '.php': SupportedLanguage.PHP,
      '.rb': SupportedLanguage.Ruby,
      '.swift': SupportedLanguage.Swift,
      '.kt': SupportedLanguage.Kotlin,
      '.cpp': SupportedLanguage.Cpp,
      '.cc': SupportedLanguage.Cpp,
      '.cxx': SupportedLanguage.Cpp,
      '.c': SupportedLanguage.C,
      '.h': SupportedLanguage.C,
      '.hpp': SupportedLanguage.Cpp
    };
    
    return languageMap[ext] || SupportedLanguage.JavaScript;
  }
}

// 言語別パーサー実装

/**
 * TypeScriptパーサー
 */
class TypeScriptParser implements LanguageParser {
  language = SupportedLanguage.TypeScript;
  extensions = ['.ts', '.tsx'];

  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    const symbols: SymbolIndexInfo[] = [];
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );

    const visit = (node: ts.Node, containerName?: string) => {
      const symbol = this.extractSymbol(node, sourceFile, filePath, containerName);
      if (symbol) {
        symbols.push(symbol);
        ts.forEachChild(node, child => visit(child, symbol.name));
      } else {
        ts.forEachChild(node, child => visit(child, containerName));
      }
    };

    visit(sourceFile);
    return symbols;
  }

  private extractSymbol(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    filePath: string,
    containerName?: string
  ): SymbolIndexInfo | null {
    let name: string | undefined;
    let kind: SymbolKind | undefined;
    let signature: string | undefined;
    let modifiers: string[] = [];

    if (ts.isClassDeclaration(node) && node.name) {
      name = node.name.text;
      kind = SymbolKind.Class;
      signature = `class ${name}`;
    } else if (ts.isFunctionDeclaration(node) && node.name) {
      name = node.name.text;
      kind = SymbolKind.Function;
      signature = this.getFunctionSignature(node);
    } else if (ts.isMethodDeclaration(node) && node.name) {
      name = (node.name as ts.Identifier).text;
      kind = SymbolKind.Method;
      signature = this.getMethodSignature(node);
    } else if (ts.isPropertyDeclaration(node) && node.name) {
      name = (node.name as ts.Identifier).text;
      kind = SymbolKind.Property;
    } else if (ts.isVariableDeclaration(node) && node.name) {
      name = (node.name as ts.Identifier).text;
      kind = SymbolKind.Variable;
    } else if (ts.isInterfaceDeclaration(node) && node.name) {
      name = node.name.text;
      kind = SymbolKind.Interface;
    } else if (ts.isEnumDeclaration(node) && node.name) {
      name = node.name.text;
      kind = SymbolKind.Enum;
    }

    if (!name || !kind) return null;

    // 修飾子を抽出
    const nodeModifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    if (nodeModifiers) {
      modifiers = nodeModifiers.map(mod => {
        switch (mod.kind) {
          case ts.SyntaxKind.PublicKeyword: return 'public';
          case ts.SyntaxKind.PrivateKeyword: return 'private';
          case ts.SyntaxKind.ProtectedKeyword: return 'protected';
          case ts.SyntaxKind.StaticKeyword: return 'static';
          case ts.SyntaxKind.AsyncKeyword: return 'async';
          case ts.SyntaxKind.ExportKeyword: return 'export';
          default: return '';
        }
      }).filter(Boolean);
    }

    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    const fileUri = URI.file(filePath).toString();

    return {
      id: this.generateId(name, fileUri, start.line, start.character),
      name,
      kind,
      language: SupportedLanguage.TypeScript,
      fileUri: '',
      startLine: start.line,
      startCharacter: start.character,
      endLine: end.line,
      endCharacter: end.character,
      containerName,
      signature,
      modifiers,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  private getFunctionSignature(node: ts.FunctionDeclaration): string {
    const params = node.parameters.map(p => (p.name as ts.Identifier).text).join(', ');
    const returnType = node.type ? `: ${node.type.getText()}` : '';
    return `function ${node.name?.text}(${params})${returnType}`;
  }

  private getMethodSignature(node: ts.MethodDeclaration): string {
    const params = node.parameters.map(p => (p.name as ts.Identifier).text).join(', ');
    const returnType = node.type ? `: ${node.type.getText()}` : '';
    return `method ${(node.name as ts.Identifier).text}(${params})${returnType}`;
  }

  private generateId(name: string, fileUri: string, line: number, character: number): string {
    return `${name}@${fileUri}:${line}:${character}_${Date.now()}`;
  }
}

/**
 * JavaScriptパーサー
 */
class JavaScriptParser implements LanguageParser {
  language = SupportedLanguage.JavaScript;
  extensions = ['.js', '.jsx', '.mjs', '.cjs'];

  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    const symbols: SymbolIndexInfo[] = [];
    
    if (!babelParser || !babelTraverse) {
      // Babelが利用できない場合は正規表現ベースのパース
      return this.parseWithRegex(filePath, content);
    }

    try {
      const ast = babelParser.parse(content, {
        sourceType: 'module',
        plugins: ['jsx', 'typescript'],
        errorRecovery: true
      });

      const fileUri = URI.file(filePath).toString();

      babelTraverse(ast, {
        ClassDeclaration: (path: any) => {
          if (path.node.id) {
            symbols.push(this.createSymbol(
              path.node.id.name, 
              SymbolKind.Class, 
              path.node.loc,
              filePath
            ));
          }
        },
        FunctionDeclaration: (path: any) => {
          if (path.node.id) {
            symbols.push(this.createSymbol(
              path.node.id.name, 
              SymbolKind.Function, 
              path.node.loc,
              filePath
            ));
          }
        },
        VariableDeclarator: (path: any) => {
          if (path.node.id && path.node.id.type === 'Identifier') {
            symbols.push(this.createSymbol(
              path.node.id.name, 
              SymbolKind.Variable, 
              path.node.loc,
              filePath
            ));
          }
        }
      });
    } catch (error) {
      console.error('JavaScript parsing error:', error);
      // フォールバック
      return this.parseWithRegex(filePath, content);
    }

    return symbols;
  }

  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    
    const patterns = {
      class: /class\s+(\w+)/,
      function: /function\s+(\w+)/,
      arrowFunction: /(?:const|let|var)\s+(\w+)\s*=\s*(?:\(.*?\)\s*=>|\w+\s*=>)/,
      variable: /(?:const|let|var)\s+(\w+)/
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      for (const [type, pattern] of Object.entries(patterns)) {
        const match = pattern.exec(line);
        if (match && match[1]) {
          const kind = type === 'class' ? SymbolKind.Class :
                       type.includes('function') ? SymbolKind.Function :
                       SymbolKind.Variable;
          
          symbols.push(this.createSymbol(match[1], kind, { start: { line: i, column: match.index } }, filePath));
          break;
        }
      }
    }

    return symbols;
  }

  private createSymbol(name: string, kind: SymbolKind, loc: any, filePath: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    const line = loc?.start?.line || 0;
    const column = loc?.start?.column || 0;
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.JavaScript,
      fileUri: '',
      startLine: line,
      startCharacter: column,
      endLine: loc?.end?.line || line,
      endCharacter: loc?.end?.column || column + name.length,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

/**
 * Pythonパーサー（正規表現ベース）
 */
class PythonParser implements LanguageParser {
  language = SupportedLanguage.Python;
  extensions = ['.py', '.pyi'];

  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      class: /^(\s*)class\s+(\w+)/,
      function: /^(\s*)def\s+(\w+)/,
      asyncFunction: /^(\s*)async\s+def\s+(\w+)/,
      variable: /^(\w+)\s*=/
    };

    let currentClass: string | undefined;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // クラス検出
      let match = patterns.class.exec(line);
      if (match) {
        const indent = match[1];
        const name = match[2];
        if (indent === '') { // トップレベルクラス
          currentClass = name;
        }
        symbols.push(this.createSymbol(name, SymbolKind.Class, i, match.index || 0, filePath, indent === '' ? undefined : currentClass));
        continue;
      }
      
      // 関数検出
      match = patterns.function.exec(line) || patterns.asyncFunction.exec(line);
      if (match) {
        const indent = match[1];
        const name = match[2];
        const isMethod = indent !== '';
        symbols.push(this.createSymbol(
          name, 
          isMethod ? SymbolKind.Method : SymbolKind.Function, 
          i, 
          match.index || 0, 
          filePath,
          isMethod ? currentClass : undefined
        ));
        continue;
      }
      
      // トップレベル変数
      if (!/^\s/.test(line)) {
        match = patterns.variable.exec(line);
        if (match) {
          const varName = match[1];
          // 予約語でない場合のみ変数として扱う
          if (!['class', 'def', 'import', 'from', 'if', 'for', 'while', 'try', 'elif', 'else', 'except', 'finally', 'with', 'as', 'return'].includes(varName)) {
            symbols.push(this.createSymbol(varName, SymbolKind.Variable, i, match.index || 0, filePath));
          }
        }
      }
    }

    return symbols;
  }

  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.Python,
      fileUri: fileUri,
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

// 他の言語パーサー（簡易実装）
class JavaParser implements LanguageParser {
  language = SupportedLanguage.Java;
  extensions = ['.java'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      // パッケージ宣言
      package: /^package\s+([\w\.]+);/,
      // インポート文
      import: /^import\s+(?:static\s+)?([\w\.]+(?:\.\*)?);/,
      // クラス宣言
      class: /^(?:\s*(?:public|private|protected)?\s*)?(?:abstract\s+|final\s+)?class\s+(\w+)/,
      // インターフェース宣言
      interface: /^(?:\s*(?:public|private|protected)?\s*)?interface\s+(\w+)/,
      // 列挙型宣言
      enum: /^(?:\s*(?:public|private|protected)?\s*)?enum\s+(\w+)/,
      // メソッド宣言
      method: /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:final\s+)?(?:abstract\s+)?(?:synchronized\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/,
      // フィールド宣言
      field: /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:final\s+)?[\w<>\[\]]+\s+(\w+)(?:\s*=.*)?;/,
      // 定数宣言
      constant: /^\s*(?:public\s+)?static\s+final\s+[\w<>\[\]]+\s+(\w+)\s*=/
    };

    let currentClass: string | undefined;
    let currentPackage: string | undefined;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('//') || line.startsWith('/*')) continue;
      
      // パッケージ宣言
      let match = patterns.package.exec(line);
      if (match) {
        currentPackage = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Package, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // インポート文
      match = patterns.import.exec(line);
      if (match) {
        const importName = match[1].split('.').pop() || match[1];
        symbols.push(this.createSymbol(importName, SymbolKind.Import, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // クラス宣言
      match = patterns.class.exec(line);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // インターフェース宣言
      match = patterns.interface.exec(line);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Interface, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // 列挙型宣言
      match = patterns.enum.exec(line);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Enum, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // メソッド宣言
      match = patterns.method.exec(line);
      if (match && currentClass && !line.includes('=')) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Method, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // 定数宣言
      match = patterns.constant.exec(line);
      if (match && currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Constant, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // フィールド宣言
      match = patterns.field.exec(line);
      if (match && currentClass && !line.includes('(')) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Field, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
    }

    return symbols;
  }
  
  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.Java,
      fileUri: '',
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

class GoParser implements LanguageParser {
  language = SupportedLanguage.Go;
  extensions = ['.go'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      // パッケージ宣言
      package: /^package\s+(\w+)/,
      // インポート文
      import: /^\s*"([^"]+)"/,
      importAlias: /^\s*(\w+)\s+"([^"]+)"/,
      // 関数宣言
      function: /^func\s+(\w+)\s*\(/,
      // メソッド宣言
      method: /^func\s*\([^)]*\)\s*(\w+)\s*\(/,
      // 型宣言
      type: /^type\s+(\w+)\s+(?:struct|interface)/,
      // 構造体宣言
      struct: /^type\s+(\w+)\s+struct/,
      // インターフェース宣言
      interface: /^type\s+(\w+)\s+interface/,
      // 変数宣言
      variable: /^var\s+(\w+)/,
      // 定数宣言
      constant: /^const\s+(\w+)/,
      // 構造体フィールド
      field: /^\s+(\w+)\s+[\w\[\]\.]+(?:\s+`[^`]*`)?$/
    };

    let currentStruct: string | undefined;
    let currentPackage: string | undefined;
    let inStructBody = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('//')) continue;
      
      // パッケージ宣言
      let match = patterns.package.exec(trimmedLine);
      if (match) {
        currentPackage = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Package, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // インポート文（エイリアスあり）
      match = patterns.importAlias.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Import, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // インポート文（エイリアスなし）
      match = patterns.import.exec(trimmedLine);
      if (match) {
        const importName = match[1].split('/').pop() || match[1];
        symbols.push(this.createSymbol(importName, SymbolKind.Import, i, trimmedLine.indexOf(match[1]), filePath));
        continue;
      }
      
      // 構造体宣言
      match = patterns.struct.exec(trimmedLine);
      if (match) {
        currentStruct = match[1];
        inStructBody = true;
        symbols.push(this.createSymbol(match[1], SymbolKind.Struct, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // インターフェース宣言
      match = patterns.interface.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Interface, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // 型宣言
      match = patterns.type.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // 関数宣言
      match = patterns.function.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Function, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // メソッド宣言
      match = patterns.method.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Method, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // 変数宣言
      match = patterns.variable.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Variable, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // 定数宣言
      match = patterns.constant.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Constant, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // 構造体のフィールド
      if (inStructBody && currentStruct) {
        if (trimmedLine === '}') {
          inStructBody = false;
          currentStruct = undefined;
        } else {
          match = patterns.field.exec(line);
          if (match && !match[1].includes('func')) {
            symbols.push(this.createSymbol(match[1], SymbolKind.Field, i, line.indexOf(match[1]), filePath, currentStruct));
          }
        }
      }
    }

    return symbols;
  }
  
  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.Go,
      fileUri: fileUri,
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

class RustParser implements LanguageParser {
  language = SupportedLanguage.Rust;
  extensions = ['.rs'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      // 構造体宣言
      struct: /^(?:pub\s+)?struct\s+(\w+)/,
      // 列挙型宣言
      enum: /^(?:pub\s+)?enum\s+(\w+)/,
      // トレイト宣言
      trait: /^(?:pub\s+)?trait\s+(\w+)/,
      // 実装ブロック
      impl: /^impl(?:\s*<[^>]*>)?\s+(\w+)/,
      // 関数宣言
      function: /^(?:pub\s+)?(?:unsafe\s+)?(?:extern\s+(?:"[^"]*"\s+)?)?fn\s+(\w+)/,
      // モジュール宣言
      module: /^(?:pub\s+)?mod\s+(\w+)/,
      // 定数宣言
      constant: /^(?:pub\s+)?const\s+(\w+)/,
      // 静的変数宣言
      static: /^(?:pub\s+)?static\s+(?:mut\s+)?(\w+)/,
      // 型エイリアス
      typeAlias: /^(?:pub\s+)?type\s+(\w+)/,
      // マクロ宣言
      macro: /^macro_rules!\s+(\w+)/,
      // use文
      use: /^use\s+.*::(\w+)/,
      // 構造体フィールド
      field: /^\s*(?:pub\s+)?(\w+):\s*[\w<>]+/
    };

    let currentStruct: string | undefined;
    let currentImpl: string | undefined;
    let inStructBody = false;
    let inImplBody = false;
    let braceDepth = 0;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('//')) continue;
      
      // 構造体宣言
      let match = patterns.struct.exec(trimmedLine);
      if (match) {
        currentStruct = match[1];
        inStructBody = trimmedLine.includes('{') && !trimmedLine.includes('}');
        symbols.push(this.createSymbol(match[1], SymbolKind.Struct, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 列挙型宣言
      match = patterns.enum.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Enum, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // トレイト宣言
      match = patterns.trait.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Trait, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // impl宣言
      match = patterns.impl.exec(trimmedLine);
      if (match) {
        currentImpl = match[1];
        inImplBody = trimmedLine.includes('{') && !trimmedLine.includes('}');
        continue;
      }
      
      // 関数宣言
      match = patterns.function.exec(trimmedLine);
      if (match) {
        const containerName = inImplBody ? currentImpl : undefined;
        const kind = inImplBody ? SymbolKind.Method : SymbolKind.Function;
        symbols.push(this.createSymbol(match[1], kind, i, line.indexOf(match[1]), filePath, containerName));
        continue;
      }
      
      // モジュール宣言
      match = patterns.module.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Module, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 定数宣言
      match = patterns.constant.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Constant, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 静的変数宣言
      match = patterns.static.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Variable, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 型エイリアス
      match = patterns.typeAlias.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // マクロ宣言
      match = patterns.macro.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Macro, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // use文
      match = patterns.use.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Import, i, trimmedLine.indexOf(match[1]), filePath));
        continue;
      }
      
      // 構造体フィールド
      if (inStructBody && currentStruct) {
        if (trimmedLine.includes('}')) {
          inStructBody = false;
          currentStruct = undefined;
        } else {
          match = patterns.field.exec(line);
          if (match) {
            symbols.push(this.createSymbol(match[1], SymbolKind.Field, i, line.indexOf(match[1]), filePath, currentStruct));
          }
        }
      }
      
      // ブロックの深さを追跡
      if (inImplBody) {
        braceDepth += (trimmedLine.match(/{/g) || []).length;
        braceDepth -= (trimmedLine.match(/}/g) || []).length;
        if (braceDepth <= 0) {
          inImplBody = false;
          currentImpl = undefined;
          braceDepth = 0;
        }
      }
    }

    return symbols;
  }
  
  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.Rust,
      fileUri: fileUri,
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

class CSharpParser implements LanguageParser {
  language = SupportedLanguage.CSharp;
  extensions = ['.cs'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      // 名前空間宣言
      namespace: /^namespace\s+([\w\.]+)/,
      // using文
      using: /^using\s+([\w\.]+)/,
      // クラス宣言
      class: /^(?:\s*(?:public|private|protected|internal)?\s*)?(?:abstract\s+|sealed\s+|static\s+)?class\s+(\w+)/,
      // インターフェース宣言
      interface: /^(?:\s*(?:public|private|protected|internal)?\s*)?interface\s+(\w+)/,
      // 構造体宣言
      struct: /^(?:\s*(?:public|private|protected|internal)?\s*)?struct\s+(\w+)/,
      // 列挙型宣言
      enum: /^(?:\s*(?:public|private|protected|internal)?\s*)?enum\s+(\w+)/,
      // メソッド宣言
      method: /^\s*(?:(?:public|private|protected|internal)\s+)?(?:static\s+)?(?:virtual\s+)?(?:override\s+)?(?:abstract\s+)?[\w<>\[\]]+\s+(\w+)\s*\(/,
      // プロパティ宣言
      property: /^\s*(?:(?:public|private|protected|internal)\s+)?(?:static\s+)?[\w<>\[\]]+\s+(\w+)\s*\{/,
      // フィールド宣言
      field: /^\s*(?:(?:public|private|protected|internal)\s+)?(?:static\s+)?(?:readonly\s+)?[\w<>\[\]]+\s+(\w+)(?:\s*[=;])/,
      // 定数宣言
      constant: /^\s*(?:public\s+)?const\s+[\w<>\[\]]+\s+(\w+)\s*=/,
      // イベント宣言
      event: /^\s*(?:(?:public|private|protected|internal)\s+)?event\s+[\w<>\[\]]+\s+(\w+)/,
      // デリゲート宣言
      delegate: /^(?:\s*(?:public|private|protected|internal)?\s*)?delegate\s+[\w<>\[\]]+\s+(\w+)/
    };

    let currentNamespace: string | undefined;
    let currentClass: string | undefined;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) continue;
      
      // 名前空間宣言
      let match = patterns.namespace.exec(trimmedLine);
      if (match) {
        currentNamespace = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Namespace, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // using文
      match = patterns.using.exec(trimmedLine);
      if (match) {
        const importName = match[1].split('.').pop() || match[1];
        symbols.push(this.createSymbol(importName, SymbolKind.Import, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // クラス宣言
      match = patterns.class.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // インターフェース宣言
      match = patterns.interface.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Interface, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // 構造体宣言
      match = patterns.struct.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Struct, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // 列挙型宣言
      match = patterns.enum.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Enum, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // デリゲート宣言
      match = patterns.delegate.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Function, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // メソッド宣言
      match = patterns.method.exec(line);
      if (match && currentClass && !trimmedLine.includes('=') && !trimmedLine.includes('{') && trimmedLine.includes('(')) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Method, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // プロパティ宣言
      match = patterns.property.exec(line);
      if (match && currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Property, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // イベント宣言
      match = patterns.event.exec(line);
      if (match && currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Event, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // 定数宣言
      match = patterns.constant.exec(line);
      if (match && currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Constant, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // フィールド宣言
      match = patterns.field.exec(line);
      if (match && currentClass && !trimmedLine.includes('(') && !trimmedLine.includes('{')) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Field, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
    }

    return symbols;
  }
  
  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.CSharp,
      fileUri: '',
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

class PHPParser implements LanguageParser {
  language = SupportedLanguage.PHP;
  extensions = ['.php'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      // 名前空間宣言
      namespace: /^namespace\s+([\w\\]+);/,
      // use文
      use: /^use\s+([\w\\]+)/,
      // クラス宣言
      class: /^(?:(?:final|abstract)\s+)?class\s+(\w+)/,
      // インターフェース宣言
      interface: /^interface\s+(\w+)/,
      // トレイト宣言
      trait: /^trait\s+(\w+)/,
      // 関数宣言
      function: /^function\s+(\w+)\s*\(/,
      // メソッド宣言
      method: /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:final\s+)?function\s+(\w+)\s*\(/,
      // プロパティ宣言
      property: /^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?\$?(\w+)\s*[=;]/,
      // 定数宣言
      constant: /^\s*(?:const\s+|define\([\'"](\w+)[\'"])/
    };

    let currentNamespace: string | undefined;
    let currentClass: string | undefined;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*') || trimmedLine.startsWith('#')) continue;
      
      // 名前空間宣言
      let match = patterns.namespace.exec(trimmedLine);
      if (match) {
        currentNamespace = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Namespace, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // use文
      match = patterns.use.exec(trimmedLine);
      if (match) {
        const importName = match[1].split('\\').pop() || match[1];
        symbols.push(this.createSymbol(importName, SymbolKind.Import, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // クラス宣言
      match = patterns.class.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // インターフェース宣言
      match = patterns.interface.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Interface, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // トレイト宣言
      match = patterns.trait.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Trait, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // 関数宣言（グローバル）
      match = patterns.function.exec(trimmedLine);
      if (match && !currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Function, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // メソッド宣言
      match = patterns.method.exec(line);
      if (match && currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Method, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // プロパティ宣言
      match = patterns.property.exec(line);
      if (match && currentClass && !line.includes('(')) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Property, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // 定数宣言
      match = patterns.constant.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Constant, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
    }

    return symbols;
  }
  
  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.PHP,
      fileUri: '',
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

class RubyParser implements LanguageParser {
  language = SupportedLanguage.Ruby;
  extensions = ['.rb'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      // モジュール宣言
      module: /^module\s+(\w+)/,
      // クラス宣言
      class: /^class\s+(\w+)/,
      // メソッド宣言
      method: /^\s*def\s+(\w+)/,
      // 定数宣言
      constant: /^(\w+)\s*=\s*[A-Z]/,
      // インスタンス変数
      instanceVar: /@(\w+)/,
      // クラス変数
      classVar: /@@(\w+)/
    };

    let currentModule: string | undefined;
    let currentClass: string | undefined;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('#')) continue;
      
      // モジュール宣言
      let match = patterns.module.exec(trimmedLine);
      if (match) {
        currentModule = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Module, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // クラス宣言
      match = patterns.class.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath, currentModule));
        continue;
      }
      
      // メソッド宣言
      match = patterns.method.exec(line);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Method, i, line.indexOf(match[1]), filePath, currentClass || currentModule));
        continue;
      }
      
      // 定数宣言
      match = patterns.constant.exec(trimmedLine);
      if (match && match[1].match(/^[A-Z]/)) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Constant, i, line.indexOf(match[1]), filePath, currentClass || currentModule));
        continue;
      }
      
      // インスタンス変数
      match = patterns.instanceVar.exec(trimmedLine);
      if (match && currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Property, i, line.indexOf('@' + match[1]), filePath, currentClass));
      }
      
      // クラス変数
      match = patterns.classVar.exec(trimmedLine);
      if (match && currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Variable, i, line.indexOf('@@' + match[1]), filePath, currentClass));
      }
    }

    return symbols;
  }
  
  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.Ruby,
      fileUri: '',
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

class SwiftParser implements LanguageParser {
  language = SupportedLanguage.Swift;
  extensions = ['.swift'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      // インポート文
      import: /^import\s+(\w+)/,
      // クラス宣言
      class: /^(?:(?:public|private|internal|fileprivate|open)\s+)?(?:final\s+)?class\s+(\w+)/,
      // 構造体宣言
      struct: /^(?:(?:public|private|internal|fileprivate)\s+)?struct\s+(\w+)/,
      // プロトコル宣言
      protocol: /^(?:(?:public|private|internal|fileprivate)\s+)?protocol\s+(\w+)/,
      // 列挙型宣言
      enum: /^(?:(?:public|private|internal|fileprivate)\s+)?enum\s+(\w+)/,
      // 関数宣言
      function: /^(?:(?:public|private|internal|fileprivate)\s+)?(?:static\s+)?func\s+(\w+)\s*\(/,
      // イニシャライザ
      initializer: /^(?:(?:public|private|internal|fileprivate)\s+)?(?:convenience\s+|required\s+)?init\s*\(/,
      // プロパティ宣言
      property: /^\s*(?:(?:public|private|internal|fileprivate)\s+)?(?:static\s+)?(?:let|var)\s+(\w+)/,
      // タイプエイリアス
      typeAlias: /^(?:(?:public|private|internal|fileprivate)\s+)?typealias\s+(\w+)/,
      // 拡張
      extension: /^extension\s+(\w+)/
    };

    let currentClass: string | undefined;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) continue;
      
      // インポート文
      let match = patterns.import.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Import, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // クラス宣言
      match = patterns.class.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 構造体宣言
      match = patterns.struct.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Struct, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // プロトコル宣言
      match = patterns.protocol.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Interface, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 列挙型宣言
      match = patterns.enum.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Enum, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 拡張
      match = patterns.extension.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        continue;
      }
      
      // 関数宣言
      match = patterns.function.exec(line);
      if (match) {
        const kind = currentClass ? SymbolKind.Method : SymbolKind.Function;
        symbols.push(this.createSymbol(match[1], kind, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // イニシャライザ
      match = patterns.initializer.exec(line);
      if (match && currentClass) {
        symbols.push(this.createSymbol('init', SymbolKind.Constructor, i, line.indexOf('init'), filePath, currentClass));
        continue;
      }
      
      // プロパティ宣言
      match = patterns.property.exec(line);
      if (match && currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Property, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // タイプエイリアス
      match = patterns.typeAlias.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath));
        continue;
      }
    }

    return symbols;
  }
  
  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.Swift,
      fileUri: '',
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

class KotlinParser implements LanguageParser {
  language = SupportedLanguage.Kotlin;
  extensions = ['.kt', '.kts'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      // パッケージ宣言
      package: /^package\s+([\.\w]+)/,
      // インポート文
      import: /^import\s+([\.\w]+)/,
      // クラス宣言
      class: /^(?:(?:public|private|protected|internal)\s+)?(?:abstract\s+|final\s+|open\s+|sealed\s+|data\s+|inner\s+)?class\s+(\w+)/,
      // インターフェース宣言
      interface: /^(?:(?:public|private|protected|internal)\s+)?interface\s+(\w+)/,
      // オブジェクト宣言
      object: /^(?:(?:public|private|protected|internal)\s+)?object\s+(\w+)/,
      // 列挙型宣言
      enum: /^(?:(?:public|private|protected|internal)\s+)?enum\s+class\s+(\w+)/,
      // 関数宣言
      function: /^(?:(?:public|private|protected|internal)\s+)?(?:suspend\s+)?fun\s+(<[^>]+>\s+)?(\w+)\s*\(/,
      // プロパティ宣言
      property: /^\s*(?:(?:public|private|protected|internal)\s+)?(?:val|var)\s+(\w+)/,
      // 定数宣言
      constant: /^\s*const\s+val\s+(\w+)/,
      // タイプエイリアス
      typeAlias: /^(?:(?:public|private|protected|internal)\s+)?typealias\s+(\w+)/
    };

    let currentPackage: string | undefined;
    let currentClass: string | undefined;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) continue;
      
      // パッケージ宣言
      let match = patterns.package.exec(trimmedLine);
      if (match) {
        currentPackage = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Package, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // インポート文
      match = patterns.import.exec(trimmedLine);
      if (match) {
        const importName = match[1].split('.').pop() || match[1];
        symbols.push(this.createSymbol(importName, SymbolKind.Import, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // クラス宣言
      match = patterns.class.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // インターフェース宣言
      match = patterns.interface.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Interface, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // オブジェクト宣言
      match = patterns.object.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Object, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // 列挙型宣言
      match = patterns.enum.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Enum, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
      
      // 関数宣言
      match = patterns.function.exec(line);
      if (match) {
        const functionName = match[2];
        const kind = currentClass ? SymbolKind.Method : SymbolKind.Function;
        symbols.push(this.createSymbol(functionName, kind, i, line.indexOf(functionName), filePath, currentClass || currentPackage));
        continue;
      }
      
      // 定数宣言
      match = patterns.constant.exec(line);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Constant, i, line.indexOf(match[1]), filePath, currentClass || currentPackage));
        continue;
      }
      
      // プロパティ宣言
      match = patterns.property.exec(line);
      if (match && currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Property, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // タイプエイリアス
      match = patterns.typeAlias.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath, currentPackage));
        continue;
      }
    }

    return symbols;
  }
  
  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.Kotlin,
      fileUri: '',
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

class CppParser implements LanguageParser {
  language = SupportedLanguage.Cpp;
  extensions = ['.cpp', '.cc', '.cxx', '.hpp'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      // 名前空間宣言
      namespace: /^namespace\s+(\w+)/,
      // インクルード文
      include: /^#include\s*[<"](\w+)[">]/,
      // クラス宣言
      class: /^(?:template\s*<[^>]*>\s*)?class\s+(\w+)/,
      // 構造体宣言
      struct: /^(?:template\s*<[^>]*>\s*)?struct\s+(\w+)/,
      // 列挙型宣言
      enum: /^enum\s+(?:class\s+)?(\w+)/,
      // 関数宣言
      function: /^(?:template\s*<[^>]*>\s*)?(?:(?:inline|static|virtual|explicit|friend)\s+)*[\w:<>\*&\s]+\s+(\w+)\s*\([^)]*\)\s*(?:const)?\s*[;{]/,
      // コンストラクタ
      constructor: /^\s*(\w+)\s*\([^)]*\)\s*:/,
      // デストラクタ
      destructor: /^\s*~(\w+)\s*\([^)]*\)/,
      // マクロ
      macro: /^#define\s+(\w+)/,
      // using文
      using: /^using\s+(?:namespace\s+)?(\w+)/,
      // typedef
      typedef: /^typedef\s+[^;]+\s+(\w+)\s*;/
    };

    let currentNamespace: string | undefined;
    let currentClass: string | undefined;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) continue;
      
      // 名前空間宣言
      let match = patterns.namespace.exec(trimmedLine);
      if (match) {
        currentNamespace = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Namespace, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // インクルード文
      match = patterns.include.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Import, i, trimmedLine.indexOf(match[1]), filePath));
        continue;
      }
      
      // クラス宣言
      match = patterns.class.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // 構造体宣言
      match = patterns.struct.exec(trimmedLine);
      if (match) {
        currentClass = match[1];
        symbols.push(this.createSymbol(match[1], SymbolKind.Struct, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
      
      // 列挙型宣言
      match = patterns.enum.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Enum, i, line.indexOf(match[1]), filePath, currentClass || currentNamespace));
        continue;
      }
      
      // コンストラクタ
      match = patterns.constructor.exec(line);
      if (match && currentClass && match[1] === currentClass) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Constructor, i, line.indexOf(match[1]), filePath, currentClass));
        continue;
      }
      
      // デストラクタ
      match = patterns.destructor.exec(line);
      if (match && currentClass && match[1] === currentClass) {
        symbols.push(this.createSymbol('~' + match[1], SymbolKind.Method, i, line.indexOf('~' + match[1]), filePath, currentClass));
        continue;
      }
      
      // 関数宣言
      match = patterns.function.exec(line);
      if (match && !['if', 'for', 'while', 'switch'].includes(match[1])) {
        const kind = currentClass ? SymbolKind.Method : SymbolKind.Function;
        symbols.push(this.createSymbol(match[1], kind, i, line.indexOf(match[1]), filePath, currentClass || currentNamespace));
        continue;
      }
      
      // マクロ
      match = patterns.macro.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Macro, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // using文
      match = patterns.using.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Import, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // typedef
      match = patterns.typedef.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath, currentNamespace));
        continue;
      }
    }

    return symbols;
  }
  
  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.Cpp,
      fileUri: '',
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

class CParser implements LanguageParser {
  language = SupportedLanguage.C;
  extensions = ['.c', '.h'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    const symbols: SymbolIndexInfo[] = [];
    const lines = content.split('\n');
    const fileUri = URI.file(filePath).toString();
    
    const patterns = {
      // インクルード文
      include: /^#include\s*[<"](\w+)[">]/,
      // 構造体宣言
      struct: /^(?:typedef\s+)?struct\s+(\w+)/,
      // 列挙型宣言
      enum: /^(?:typedef\s+)?enum\s+(\w+)/,
      // 関数宣言
      function: /^(?:static\s+|extern\s+|inline\s+)*[\w\s\*]+\s+(\w+)\s*\([^)]*\)\s*[{;]/,
      // 関数プロトタイプ
      prototype: /^(?:static\s+|extern\s+)*[\w\s\*]+\s+(\w+)\s*\([^)]*\)\s*;/,
      // マクロ
      macro: /^#define\s+(\w+)/,
      // typedef
      typedef: /^typedef\s+[^;]+\s+(\w+)\s*;/,
      // 全域変数
      globalVar: /^(?:static\s+|extern\s+)?(?:const\s+)?[\w\s\*]+\s+(\w+)\s*(?:=.*)?;/
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) continue;
      
      // インクルード文
      let match = patterns.include.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Import, i, trimmedLine.indexOf(match[1]), filePath));
        continue;
      }
      
      // 構造体宣言
      match = patterns.struct.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Struct, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 列挙型宣言
      match = patterns.enum.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Enum, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 関数プロトタイプ
      match = patterns.prototype.exec(line);
      if (match && !['if', 'for', 'while', 'switch', 'return'].includes(match[1])) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Function, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 関数宣言
      match = patterns.function.exec(line);
      if (match && !['if', 'for', 'while', 'switch', 'return'].includes(match[1]) && !trimmedLine.includes('=')) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Function, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // マクロ
      match = patterns.macro.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Macro, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // typedef
      match = patterns.typedef.exec(trimmedLine);
      if (match) {
        symbols.push(this.createSymbol(match[1], SymbolKind.Class, i, line.indexOf(match[1]), filePath));
        continue;
      }
      
      // 全域変数（関数外）
      if (!line.startsWith(' ') && !line.startsWith('\t')) {
        match = patterns.globalVar.exec(line);
        if (match && !line.includes('(') && !['if', 'for', 'while', 'switch', 'return', 'int', 'char', 'float', 'double', 'void'].includes(match[1])) {
          symbols.push(this.createSymbol(match[1], SymbolKind.Variable, i, line.indexOf(match[1]), filePath));
        }
      }
    }

    return symbols;
  }
  
  private createSymbol(name: string, kind: SymbolKind, line: number, column: number, filePath: string, containerName?: string): SymbolIndexInfo {
    const fileUri = URI.file(filePath).toString();
    
    return {
      id: `${name}@${fileUri}:${line}:${column}_${Date.now()}`,
      name,
      kind,
      language: SupportedLanguage.C,
      fileUri: '',
      startLine: line,
      startCharacter: column,
      endLine: line,
      endCharacter: column + name.length,
      containerName,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }
}

/**
 * プロジェクト用のシンボルインデックスファクトリ（多言語対応）
 */
export function createSymbolIndex(projectPath: string): SymbolIndex {
  const dbPath = path.join(projectPath, '.agents', 'cache', 'symbol-index.db');
  return new SymbolIndex(dbPath, projectPath);
}
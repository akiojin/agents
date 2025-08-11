/**
 * 多言語対応シンボルインデックス
 * TypeScript、JavaScript、Python、Java、Go、Rust、C#、PHP、Ruby等に対応
 */

import sqlite3, { Database } from 'sqlite3';
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
  language: SupportedLanguage;
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
            indexedFiles: [] // 簡略化
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
    if (this.lspClient) {
      await this.lspClient.disconnect();
    }

    if (this.db) {
      await new Promise<void>((resolve, reject) => {
        this.db!.close((err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    this.isInitialized = false;
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

  private async processDocumentSymbols(symbols: DocumentSymbol[], fileUri: string, containerName?: string): Promise<void> {
    for (const symbol of symbols) {
      const symbolId = this.generateSymbolId(symbol, fileUri);
      
      await this.insertSymbol({
        id: symbolId,
        name: symbol.name,
        kind: symbol.kind,
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

  private generateSymbolId(symbol: DocumentSymbol, fileUri: string): string {
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
    if (node.modifiers) {
      modifiers = node.modifiers.map(mod => {
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
        if (match && !['class', 'def', 'import', 'from', 'if', 'for', 'while', 'try'].includes(match[1])) {
          symbols.push(this.createSymbol(match[1], SymbolKind.Variable, i, match.index || 0, filePath));
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

// 他の言語パーサー（簡易実装）
class JavaParser implements LanguageParser {
  language = SupportedLanguage.Java;
  extensions = ['.java'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return this.parseWithRegex(filePath, content);
  }
  
  private parseWithRegex(filePath: string, content: string): SymbolIndexInfo[] {
    // Java用の正規表現パース実装（簡易版）
    return [];
  }
}

class GoParser implements LanguageParser {
  language = SupportedLanguage.Go;
  extensions = ['.go'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return [];
  }
}

class RustParser implements LanguageParser {
  language = SupportedLanguage.Rust;
  extensions = ['.rs'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return [];
  }
}

class CSharpParser implements LanguageParser {
  language = SupportedLanguage.CSharp;
  extensions = ['.cs'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return [];
  }
}

class PHPParser implements LanguageParser {
  language = SupportedLanguage.PHP;
  extensions = ['.php'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return [];
  }
}

class RubyParser implements LanguageParser {
  language = SupportedLanguage.Ruby;
  extensions = ['.rb'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return [];
  }
}

class SwiftParser implements LanguageParser {
  language = SupportedLanguage.Swift;
  extensions = ['.swift'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return [];
  }
}

class KotlinParser implements LanguageParser {
  language = SupportedLanguage.Kotlin;
  extensions = ['.kt', '.kts'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return [];
  }
}

class CppParser implements LanguageParser {
  language = SupportedLanguage.Cpp;
  extensions = ['.cpp', '.cc', '.cxx', '.hpp'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return [];
  }
}

class CParser implements LanguageParser {
  language = SupportedLanguage.C;
  extensions = ['.c', '.h'];
  
  async parseFile(filePath: string, content: string): Promise<SymbolIndexInfo[]> {
    return [];
  }
}

/**
 * プロジェクト用のシンボルインデックスファクトリ（多言語対応）
 */
export function createSymbolIndex(projectPath: string): SymbolIndex {
  const dbPath = path.join(projectPath, '.agents', 'symbol-index.db');
  return new SymbolIndex(dbPath, projectPath);
}
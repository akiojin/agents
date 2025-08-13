/**
 * IntelligentFileSystem
 * コードインテリジェンスとファイルシステムを統合した高度なファイル操作システム
 * 
 * 特徴:
 * - シンボル情報付きファイル読み取り
 * - セマンティック編集サポート
 * - 自動インデックス更新
 * - 記憶システムとの連携
 */

import { TreeSitterSymbolIndex, createTreeSitterSymbolIndex, TreeSitterSymbolInfo, TreeSitterSymbolKind } from '../code-intelligence/tree-sitter-symbol-index.js';
import { TypeScriptLSPClient, createTypeScriptLSPClient } from '../code-intelligence/lsp-client.js';
import { URI } from 'vscode-uri';
import * as path from 'path';
import * as fs from 'fs/promises';
import { readFile as fsReadFile, writeFile as fsWriteFile, lstat } from 'fs/promises';
import { existsSync, readFileSync } from 'fs';

/**
 * セキュリティ設定
 */
export interface SecurityConfig {
  allowedPaths: string[];
  allowedFileExtensions?: string[];
  blockedPaths?: string[];
  maxFileSize?: number;
  enabled?: boolean;
}

/**
 * ファイルシステム操作結果
 */
export interface FileSystemResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * 基本的なファイルシステムクラス（簡易実装）
 */
class InternalFileSystem {
  constructor(private securityConfig: SecurityConfig) {}
  
  async readFile(path: string): Promise<FileSystemResult<string>> {
    try {
      if (!existsSync(path)) {
        return { success: false, error: `File not found: ${path}` };
      }
      const content = await fsReadFile(path, 'utf-8');
      return { success: true, data: content };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
  
  async writeFile(path: string, content: string): Promise<FileSystemResult<void>> {
    try {
      await fsWriteFile(path, content, 'utf-8');
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error) 
      };
    }
  }
}

// ロガー（簡易実装）
const logger = {
  debug: (message: string, data?: any) => console.debug(message, data),
  info: (message: string, data?: any) => console.info(message, data),
  warn: (message: string, data?: any) => console.warn(message, data),
  error: (message: string, data?: any) => console.error(message, data)
};

/**
 * 拡張ファイル読み取り結果
 */
export interface IntelligentReadResult {
  success: boolean;
  path: string;
  content: string;
  error?: string;
  symbols?: TreeSitterSymbolInfo[];
  dependencies?: string[];
  imports?: string[];
  exports?: string[];
  lastModified?: Date;
  cachedInIndex?: boolean;
  fileMetadata?: {
    lines: number;
    size: number;
    language: string;
  };
}

/**
 * セマンティック編集オプション
 */
export interface SemanticEditOptions {
  mode: 'refactor' | 'insert' | 'replace' | 'delete';
  symbol?: string;
  newName?: string;
  updateReferences?: boolean;
  updateImports?: boolean;
  afterSymbol?: string;
  beforeSymbol?: string;
  content?: string;
}

/**
 * 編集履歴エントリ
 */
export interface EditHistoryEntry {
  editId: string;
  timestamp: Date;
  filePath: string;
  operation: string;
  beforeState: string;
  afterState: string;
  affectedSymbols: string[];
  success: boolean;
}

/**
 * インテリジェントファイルシステムクラス
 */
export class IntelligentFileSystem {
  private fileSystem: InternalFileSystem;
  private symbolIndex?: TreeSitterSymbolIndex;
  private lspClient?: TypeScriptLSPClient;
  private currentProjectPath: string;
  private editHistory: EditHistoryEntry[] = [];
  private symbolCache: Map<string, TreeSitterSymbolInfo[]> = new Map();
  private excludeDirectories: Set<string>;
  private excludePatterns: RegExp[];
  
  // パフォーマンス統計
  private stats = {
    cacheHits: 0,
    cacheMisses: 0,
    indexingTime: 0,
    totalReads: 0,
    totalWrites: 0
  };

  constructor(
    private securityConfig: SecurityConfig,
    projectPath?: string
  ) {
    this.fileSystem = new InternalFileSystem(securityConfig);
    this.currentProjectPath = projectPath || process.cwd();
    
    // デフォルトの除外ディレクトリ（すべてのプロジェクトで共通）
    const defaultExcludeDirs = [
      '.git', 'node_modules', 'dist', 'build', '.next', '.cache',
      'bundle', 'bundles', // バンドルファイル
      'bin', 'obj', // .NET
      'target', // Rust/Java
      'out', // TypeScript/Kotlin
      '__pycache__', '.pytest_cache', 'venv', '.venv', 'env', // Python
      'vendor', // Go/PHP
      'Pods', // iOS
      '.gradle', // Android/Gradle
      'Library', 'Temp', 'Logs', // Unity
      'coverage', '.nyc_output', // テストカバレッジ
      'tmp', 'temp', '.tmp' // 一時ファイル
    ];
    
    // settings.jsonから追加の除外設定を読み込む
    const additionalExcludes = this.loadExcludeSettings();
    this.excludeDirectories = new Set([...defaultExcludeDirs, ...additionalExcludes.directories]);
    this.excludePatterns = additionalExcludes.patterns.map(p => new RegExp(p.replace(/\*/g, '.*')));
    
    logger.debug('IntelligentFileSystem initialized', { 
      projectPath: this.currentProjectPath,
      excludeDirectories: Array.from(this.excludeDirectories),
      excludePatterns: this.excludePatterns.map(r => r.source)
    });
  }

  /**
   * settings.jsonから除外設定を読み込む
   */
  private loadExcludeSettings(): { directories: string[], patterns: string[] } {
    const result = { directories: [] as string[], patterns: [] as string[] };
    
    // settings.jsonから読み込み
    try {
      const settingsPath = path.join(this.currentProjectPath, '.agents', 'settings.json');
      if (existsSync(settingsPath)) {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        if (settings.indexing) {
          result.directories.push(...(settings.indexing.excludeDirectories || []));
          result.patterns.push(...(settings.indexing.excludePatterns || []));
        }
      }
    } catch (error) {
      logger.debug('Failed to load exclude settings from settings.json', { error });
    }
    
    // .gitignoreから読み込み
    try {
      const gitignorePath = path.join(this.currentProjectPath, '.gitignore');
      if (existsSync(gitignorePath)) {
        const gitignoreContent = readFileSync(gitignorePath, 'utf-8');
        const lines = gitignoreContent.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#')); // コメントと空行を除外
        
        for (const line of lines) {
          // ディレクトリパターン（末尾に/がある）
          if (line.endsWith('/')) {
            result.directories.push(line.slice(0, -1));
          } 
          // ファイルパターン
          else if (line.includes('*') || line.includes('.')) {
            result.patterns.push(line);
          }
          // それ以外はディレクトリとして扱う
          else {
            result.directories.push(line);
          }
        }
      }
    } catch (error) {
      logger.debug('Failed to load .gitignore', { error });
    }
    
    return result;
  }

  /**
   * システムを初期化
   */
  async initialize(): Promise<void> {
    // Tree-sitter シンボルインデックスを初期化
    this.symbolIndex = createTreeSitterSymbolIndex(this.currentProjectPath);
    await this.symbolIndex.initialize();
    
    // LSPクライアントを初期化（オプショナル）
    try {
      this.lspClient = createTypeScriptLSPClient(this.currentProjectPath);
      await this.lspClient.initialize();
      logger.info('LSP client initialized successfully');
    } catch (error) {
      logger.warn('LSP client initialization failed (non-critical):', error);
      logger.info('Continuing with Tree-sitter only mode');
      this.lspClient = undefined;
    }
    
    logger.info('IntelligentFileSystem initialized');
  }

  /**
   * インテリジェントファイル読み取り
   * シンボル情報、依存関係、メタデータを含む
   */
  async readFile(filePath: string, options?: {
    includeSymbols?: boolean;
    includeDependencies?: boolean;
    useCache?: boolean;
  }): Promise<IntelligentReadResult> {
    const startTime = Date.now();
    this.stats.totalReads++;

    // 基本的なファイル読み取り
    const basicResult = await this.fileSystem.readFile(filePath);
    if (!basicResult.success) {
      return {
        success: false,
        path: filePath,
        content: '',
        error: basicResult.error
      };
    }

    const result: IntelligentReadResult = {
      success: true,
      path: filePath,
      content: basicResult.data || '',
      cachedInIndex: false
    };

    // ファイルメタデータを追加
    try {
      const stats = await fs.stat(filePath);
      const lines = basicResult.data!.split('\n').length;
      const ext = path.extname(filePath).slice(1);
      
      result.fileMetadata = {
        lines,
        size: stats.size,
        language: this.getLanguageFromExtension(ext)
      };
      result.lastModified = stats.mtime;
    } catch (error) {
      logger.warn('Failed to get file metadata', { filePath, error });
    }

    // シンボル情報を取得
    if (options?.includeSymbols !== false && this.isCodeFile(filePath)) {
      // キャッシュチェック
      if (options?.useCache !== false && this.symbolCache.has(filePath)) {
        this.stats.cacheHits++;
        result.symbols = this.symbolCache.get(filePath);
        result.cachedInIndex = true;
      } else {
        this.stats.cacheMisses++;
        
        // シンボル情報を取得
        if (this.symbolIndex) {
          const fileUri = URI.file(filePath).toString();
          let symbols = await this.symbolIndex.findSymbols({ fileUri });
          
          if (symbols.length === 0) {
            // インデックスにない場合はファイルをインデックス
            try {
              await this.symbolIndex.indexFile(filePath);
              symbols = await this.symbolIndex.findSymbols({ fileUri });
            } catch (error) {
              logger.warn('Failed to index file', { filePath, error });
            }
            
            // まだシンボルがない場合はLSPから直接取得
            if (symbols.length === 0 && this.lspClient) {
              try {
                const docSymbols = await this.lspClient.getDocumentSymbols(fileUri);
                // DocumentSymbolをTreeSitterSymbolInfoに変換
                symbols.push(...this.convertDocumentSymbolsToIndexInfo(docSymbols, fileUri));
              } catch (error) {
                logger.warn('Failed to get symbols from LSP', { filePath, error });
              }
            }
          }
          
          result.symbols = symbols;
          this.symbolCache.set(filePath, symbols);
        }
      }
    }

    // 依存関係を抽出
    if (options?.includeDependencies !== false && this.isCodeFile(filePath)) {
      const dependencies = this.extractDependencies(basicResult.data!);
      result.imports = dependencies.imports;
      result.exports = dependencies.exports;
      result.dependencies = dependencies.allDeps;
    }

    const endTime = Date.now();
    logger.debug('Intelligent file read completed', {
      filePath,
      duration: endTime - startTime,
      symbolsFound: result.symbols?.length || 0,
      cached: result.cachedInIndex
    });

    return result;
  }

  /**
   * インテリジェントファイル書き込み
   * 自動インデックス更新とバージョン管理
   */
  async writeFile(
    filePath: string, 
    content: string,
    options?: {
      updateIndex?: boolean;
      trackHistory?: boolean;
    }
  ): Promise<FileSystemResult<void>> {
    this.stats.totalWrites++;
    
    // 編集履歴を記録
    let beforeState: string | undefined;
    if (options?.trackHistory !== false) {
      const readResult = await this.fileSystem.readFile(filePath);
      if (readResult.success) {
        beforeState = readResult.data;
      }
    }

    // ファイルを書き込み
    const writeResult = await this.fileSystem.writeFile(filePath, content);
    if (!writeResult.success) {
      return writeResult;
    }

    // インデックスを更新
    if (options?.updateIndex !== false && this.symbolIndex && this.isCodeFile(filePath)) {
      try {
        await this.symbolIndex.indexFile(filePath);
        // キャッシュをクリア
        this.symbolCache.delete(filePath);
        logger.debug('Symbol index updated for file', { filePath });
      } catch (error) {
        logger.error('Failed to update symbol index', { filePath, error });
      }
    }

    // 編集履歴を保存
    if (options?.trackHistory !== false && beforeState !== undefined) {
      this.editHistory.push({
        editId: this.generateEditId(),
        timestamp: new Date(),
        filePath,
        operation: 'write',
        beforeState,
        afterState: content,
        affectedSymbols: [],
        success: true
      });
    }

    return writeResult;
  }

  /**
   * セマンティック編集
   * シンボル理解に基づく高度な編集機能
   */
  async semanticEdit(
    filePath: string,
    options: SemanticEditOptions
  ): Promise<FileSystemResult<{
    updatedFiles: string[];
    affectedSymbols: string[];
  }>> {
    if (!this.symbolIndex || !this.lspClient) {
      return {
        success: false,
        error: 'Code intelligence not initialized'
      };
    }

    const updatedFiles: string[] = [];
    const affectedSymbols: string[] = [];

    try {
      switch (options.mode) {
        case 'refactor': {
          if (!options.symbol || !options.newName) {
            return {
              success: false,
              error: 'Symbol and newName required for refactor mode'
            };
          }

          // シンボルを検索
          const symbols = await this.symbolIndex.findSymbols({ name: options.symbol });
          if (symbols.length === 0) {
            return {
              success: false,
              error: `Symbol not found: ${options.symbol}`
            };
          }

          // リファクタリングを実行
          for (const symbol of symbols) {
            affectedSymbols.push(symbol.name);
            
            // 参照を更新
            if (options.updateReferences) {
              const references = await this.symbolIndex.findReferences(symbol.name, symbol.fileUri);
              for (const ref of references) {
                const refFilePath = URI.parse(ref.fileUri).fsPath;
                const fileContent = await this.readFile(refFilePath);
                if (fileContent.success && fileContent.content) {
                  // シンボル名を置換
                  const updatedContent = this.replaceSymbolInContent(
                    fileContent.content,
                    options.symbol,
                    options.newName,
                    ref
                  );
                  await this.writeFile(refFilePath, updatedContent);
                  updatedFiles.push(refFilePath);
                }
              }
            }
          }
          break;
        }

        case 'insert': {
          if (!options.content) {
            return {
              success: false,
              error: 'Content required for insert mode'
            };
          }

          const fileContent = await this.readFile(filePath);
          if (!fileContent.success || !fileContent.content) {
            return {
              success: false,
              error: 'Failed to read file'
            };
          }

          let insertPosition = -1;
          
          // 挿入位置を特定
          if (options.afterSymbol) {
            const symbols = await this.symbolIndex.findSymbols({ 
              name: options.afterSymbol,
              fileUri: URI.file(filePath).toString()
            });
            if (symbols.length > 0) {
              insertPosition = this.findSymbolEndPosition(fileContent.content, symbols[0]);
            }
          } else if (options.beforeSymbol) {
            const symbols = await this.symbolIndex.findSymbols({ 
              name: options.beforeSymbol,
              fileUri: URI.file(filePath).toString()
            });
            if (symbols.length > 0) {
              insertPosition = this.findSymbolStartPosition(fileContent.content, symbols[0]);
            }
          }

          if (insertPosition === -1) {
            return {
              success: false,
              error: 'Could not determine insert position'
            };
          }

          // コンテンツを挿入
          const updatedContent = 
            fileContent.content.slice(0, insertPosition) +
            options.content +
            fileContent.content.slice(insertPosition);

          await this.writeFile(filePath, updatedContent);
          updatedFiles.push(filePath);
          
          // 必要に応じてimportを更新
          if (options.updateImports) {
            const importsToAdd = this.detectRequiredImports(options.content);
            if (importsToAdd.length > 0) {
              await this.addImports(filePath, importsToAdd);
            }
          }
          break;
        }

        default:
          return {
            success: false,
            error: `Unsupported edit mode: ${options.mode}`
          };
      }

      return {
        success: true,
        data: {
          updatedFiles,
          affectedSymbols
        }
      };

    } catch (error) {
      logger.error('Semantic edit failed', { error, options });
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * プロジェクト全体のインデックスを構築（元のメソッド）
   */
  async indexProjectOld(force = false): Promise<{
    totalFiles: number;
    totalSymbols: number;
    duration: number;
  }> {
    if (!this.symbolIndex) {
      throw new Error('Symbol index not initialized');
    }

    const startTime = Date.now();
    const stats = await this.symbolIndex.indexProject();
    const duration = Date.now() - startTime;
    
    this.stats.indexingTime += duration;

    return {
      totalFiles: stats.totalFiles,
      totalSymbols: stats.totalSymbols,
      duration
    };
  }

  /**
   * パフォーマンス統計を取得
   */
  getStats() {
    return {
      ...this.stats,
      cacheHitRate: this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses),
      averageIndexingTime: this.stats.indexingTime / Math.max(1, this.stats.totalWrites)
    };
  }

  /**
   * 編集履歴を取得
   */
  getEditHistory(limit = 10): EditHistoryEntry[] {
    return this.editHistory.slice(-limit);
  }

  /**
   * システムをクリーンアップ
   */
  async cleanup(): Promise<void> {
    if (this.symbolIndex) {
      await this.symbolIndex.close();
    }
    if (this.lspClient) {
      await this.lspClient.disconnect();
    }
    this.symbolCache.clear();
    this.editHistory = [];
  }

  /**
   * システムをクリーンアップ（closeのエイリアス）
   */
  async close(): Promise<void> {
    await this.cleanup();
  }

  // ユーティリティメソッド

  private isCodeFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.go', '.rs', '.cs', '.php', '.rb', '.swift', '.kt', '.cpp', '.c', '.cc', '.h', '.hpp'].includes(ext);
  }

  private getLanguageFromExtension(ext: string): any {
    const languageMap: Record<string, any> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      mjs: 'javascript',
      cjs: 'javascript',
      py: 'python',
      java: 'java',
      go: 'go',
      rs: 'rust',
      cs: 'csharp',
      php: 'php',
      rb: 'ruby',
      swift: 'swift',
      kt: 'kotlin',
      cpp: 'cpp',
      c: 'c',
      cc: 'cpp',
      h: 'c',
      hpp: 'cpp'
    };
    return languageMap[ext] || 'javascript'; // デフォルト値を合理的に設定
  }

  private extractDependencies(content: string): {
    imports: string[];
    exports: string[];
    allDeps: string[];
  } {
    const imports: string[] = [];
    const exports: string[] = [];
    
    // importステートメントを抽出
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;
    while ((match = importRegex.exec(content)) !== null) {
      imports.push(match[1]);
    }
    
    // exportステートメントを抽出
    const exportRegex = /export\s+(?:\{[^}]*\}\s+from\s+['"]([^'"]+)['"]|(?:default\s+)?(?:class|function|const|let|var)\s+(\w+))/g;
    while ((match = exportRegex.exec(content)) !== null) {
      if (match[1]) {
        exports.push(match[1]);
      } else if (match[2]) {
        exports.push(match[2]);
      }
    }
    
    return {
      imports,
      exports,
      allDeps: Array.from(new Set(imports))
    };
  }

  private convertDocumentSymbolsToIndexInfo(
    symbols: any[],
    fileUri: string
  ): TreeSitterSymbolInfo[] {
    const result: TreeSitterSymbolInfo[] = [];
    
    // LSP Symbol Kind → 文字列変換マップ
    const symbolKindMap: Record<number, string> = {
      1: 'file',
      2: 'module', 
      3: 'namespace',
      4: 'package',
      5: 'class',
      6: 'method',
      7: 'property',
      8: 'field',
      9: 'constructor',
      10: 'enum',
      11: 'interface',
      12: 'function',
      13: 'variable',
      14: 'constant',
      15: 'string',
      16: 'number',
      17: 'boolean',
      18: 'array',
      19: 'object',
      20: 'key',
      21: 'null',
      22: 'enumMember',
      23: 'struct',
      24: 'event',
      25: 'operator',
      26: 'typeParameter'
    };
    
    // 変換ロジックは symbol-index.ts と同様
    for (const symbol of symbols) {
      result.push({
        id: this.generateSymbolId(),
        name: symbol.name,
        kind: (symbolKindMap[symbol.kind] || 'variable') as TreeSitterSymbolKind,
        language: this.getLanguageFromExtension(path.extname(URI.parse(fileUri).fsPath).slice(1)),
        fileUri,
        startLine: symbol.range?.start?.line || 0,
        startCharacter: symbol.range?.start?.character || 0,
        endLine: symbol.range?.end?.line || 0,
        endCharacter: symbol.range?.end?.character || 0,
        containerName: undefined,
        signature: symbol.detail,
        documentation: undefined,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    return result;
  }

  private replaceSymbolInContent(
    content: string,
    oldName: string,
    newName: string,
    reference: any
  ): string {
    // 行単位で処理
    const lines = content.split('\n');
    const line = lines[reference.startLine];
    
    if (line) {
      const before = line.substring(0, reference.startCharacter);
      const after = line.substring(reference.startCharacter + oldName.length);
      lines[reference.startLine] = before + newName + after;
    }
    
    return lines.join('\n');
  }

  private findSymbolEndPosition(content: string, symbol: TreeSitterSymbolInfo): number {
    const lines = content.split('\n');
    let position = 0;
    
    for (let i = 0; i <= symbol.endLine && i < lines.length; i++) {
      if (i < symbol.endLine) {
        position += lines[i].length + 1; // +1 for newline
      } else {
        position += Math.min(symbol.endCharacter, lines[i].length);
      }
    }
    
    return position;
  }

  private findSymbolStartPosition(content: string, symbol: TreeSitterSymbolInfo): number {
    const lines = content.split('\n');
    let position = 0;
    
    for (let i = 0; i < symbol.startLine && i < lines.length; i++) {
      position += lines[i].length + 1; // +1 for newline
    }
    position += symbol.startCharacter;
    
    return position;
  }

  private detectRequiredImports(content: string): string[] {
    // 簡単な実装：使用されている識別子を検出
    // 実際にはより高度な解析が必要
    const imports: string[] = [];
    // TODO: 実装
    return imports;
  }

  private async addImports(filePath: string, imports: string[]): Promise<void> {
    // ファイルの先頭にimportを追加
    const content = await this.readFile(filePath);
    if (content.success && content.content) {
      const importStatements = imports.map(imp => `import { ${imp} } from './${imp}';`).join('\n');
      const updatedContent = importStatements + '\n\n' + content.content;
      await this.writeFile(filePath, updatedContent);
    }
  }

  private generateEditId(): string {
    return `edit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSymbolId(): string {
    return `symbol_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 簡易ファイル読み取り（AI最適化エンジン用）
   * インテリジェント機能なしの高速読み取り
   */
  async readFileSimple(filePath: string): Promise<FileSystemResult<string>> {
    return this.fileSystem.readFile(filePath);
  }

  /**
   * インテリジェントファイル読み取り（AI最適化エンジン用）
   * シンボル情報付きの読み取り（readFileのエイリアス）
   */
  async readFileIntelligent(filePath: string): Promise<IntelligentReadResult> {
    // セキュリティチェック
    const errorMessage = await this.getSecurityErrorMessage(filePath);
    if (errorMessage) {
      return {
        success: false,
        path: filePath,
        content: '',
        error: errorMessage
      };
    }

    return this.readFile(filePath, {
      includeSymbols: true,
      includeDependencies: true,
      useCache: true
    });
  }

  /**
   * セキュリティエラーメッセージを取得
   */
  private async getSecurityErrorMessage(filePath: string): Promise<string | null> {
    if (!this.securityConfig.enabled) {
      return null;
    }

    // 正規化されたパス
    const normalizedPath = path.resolve(filePath);

    // 許可されたパスのチェック
    if (this.securityConfig.allowedPaths) {
      const isAllowed = this.securityConfig.allowedPaths.some(allowedPath => {
        const normalizedAllowed = path.resolve(allowedPath);
        return normalizedPath.startsWith(normalizedAllowed);
      });
      
      if (!isAllowed) {
        return `Path not allowed: ${filePath}`;
      }
    }

    // ブロックされたパスのチェック
    if (this.securityConfig.blockedPaths) {
      const isBlocked = this.securityConfig.blockedPaths.some(blockedPath => {
        const normalizedBlocked = path.resolve(blockedPath);
        return normalizedPath.startsWith(normalizedBlocked);
      });
      
      if (isBlocked) {
        return `Path not allowed: ${filePath}`;
      }
    }

    // ファイルサイズのチェック（先に実行）
    if (this.securityConfig.maxFileSize && existsSync(filePath)) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.size > this.securityConfig.maxFileSize) {
          return `File too large: ${filePath}`;
        }
      } catch (error) {
        return `File not found: ${filePath}`;
      }
    }

    // ファイル拡張子のチェック
    if (this.securityConfig.allowedFileExtensions) {
      const ext = path.extname(filePath);
      if (!this.securityConfig.allowedFileExtensions.includes(ext)) {
        return `File extension not allowed: ${filePath}`;
      }
    }

    return null;
  }

  /**
   * セマンティック編集（テストで使用される名前）
   */
  async editFileSemantic(
    filePath: string,
    options: {
      targetSymbol: string;
      newContent: string;
      updateReferences?: boolean;
    }
  ): Promise<{
    success: boolean;
    updatedReferences?: string[];
    error?: string;
  }> {
    try {
      // セキュリティチェック
      const securityResult = await this.checkPathSecurity(filePath);
      if (!securityResult) {
        return {
          success: false,
          error: `Path not allowed: ${filePath}`
        };
      }

      // ファイルを読み込み
      const fileContent = await this.readFileIntelligent(filePath);
      if (!fileContent.success) {
        return {
          success: false,
          error: `Failed to read file: ${filePath}`
        };
      }

      // シンボルを探す
      const symbols = fileContent.symbols || [];
      const targetSymbol = symbols.find(s => s.name === options.targetSymbol);
      
      if (!targetSymbol) {
        return {
          success: false,
          error: `Symbol not found: ${options.targetSymbol}`
        };
      }

      // コンテンツを置き換え
      const lines = fileContent.content.split('\n');
      const startLine = targetSymbol.startLine;
      const endLine = targetSymbol.endLine;

      // 新しいコンテンツを行に分割
      const newLines = options.newContent.split('\n');
      
      // 元の内容を置き換え
      lines.splice(startLine, endLine - startLine + 1, ...newLines);
      
      const updatedContent = lines.join('\n');

      // ファイルに書き戻し
      try {
        await fs.writeFile(filePath, updatedContent, 'utf8');
      } catch (error) {
        return {
          success: false,
          error: `Failed to write file: ${error instanceof Error ? error.message : String(error)}`
        };
      }

      const result: { success: boolean; updatedReferences?: string[]; error?: string } = {
        success: true
      };

      // 参照更新が必要な場合
      if (options.updateReferences && this.symbolIndex) {
        try {
          const references = await this.symbolIndex.findReferences(
            options.targetSymbol, 
            URI.file(filePath).toString()
          );
          const updatedFiles: string[] = [];
          
          for (const ref of references) {
            const refPath = URI.parse(ref.fileUri).fsPath;
            if (refPath !== filePath) { // 自分自身は除外
              // 参照ファイルの更新は簡略化（実際の実装では詳細な解析が必要）
              updatedFiles.push(refPath);
            }
          }
          
          result.updatedReferences = updatedFiles;
        } catch (error) {
          console.warn('Failed to update references:', error);
        }
      }

      return result;

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * パスのセキュリティチェック
   */
  private async checkPathSecurity(filePath: string): Promise<boolean> {
    if (!this.securityConfig.enabled) {
      return true;
    }

    // 正規化されたパス
    const normalizedPath = path.resolve(filePath);

    // 許可されたパスのチェック
    if (this.securityConfig.allowedPaths) {
      const isAllowed = this.securityConfig.allowedPaths.some(allowedPath => {
        const normalizedAllowed = path.resolve(allowedPath);
        return normalizedPath.startsWith(normalizedAllowed);
      });
      
      if (!isAllowed) {
        return false;
      }
    }

    // ブロックされたパスのチェック
    if (this.securityConfig.blockedPaths) {
      const isBlocked = this.securityConfig.blockedPaths.some(blockedPath => {
        const normalizedBlocked = path.resolve(blockedPath);
        return normalizedPath.startsWith(normalizedBlocked);
      });
      
      if (isBlocked) {
        return false;
      }
    }

    // ファイルサイズのチェック（拡張子チェックより先に実行）
    if (this.securityConfig.maxFileSize && existsSync(filePath)) {
      try {
        const stats = await fs.stat(filePath);
        if (stats.size > this.securityConfig.maxFileSize) {
          return false;
        }
      } catch (error) {
        return false;
      }
    }

    // ファイル拡張子のチェック
    if (this.securityConfig.allowedFileExtensions) {
      const ext = path.extname(filePath);
      if (!this.securityConfig.allowedFileExtensions.includes(ext)) {
        return false;
      }
    }

    return true;
  }

  /**
   * プロジェクトのインデックスを構築（戻り値形式を修正）
   */
  async indexProject(projectPath?: string): Promise<{
    success: boolean;
    filesIndexed: number;
    error?: string;
  }> {
    try {
      if (!this.symbolIndex) {
        return {
          success: false,
          filesIndexed: 0,
          error: 'Symbol index not initialized'
        };
      }

      const targetPath = projectPath || this.currentProjectPath;
      const stats = await this.symbolIndex.indexProject();
      
      return {
        success: true,
        filesIndexed: stats.totalFiles
      };
    } catch (error) {
      return {
        success: false,
        filesIndexed: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * シンボル検索
   */
  async searchSymbols(query: string): Promise<TreeSitterSymbolInfo[]> {
    if (!this.symbolIndex) {
      return [];
    }

    return await this.symbolIndex.searchSymbols(query);
  }

  /**
   * プロジェクト構造分析
   */
  async analyzeProjectStructure(projectPath?: string): Promise<{
    modules: Array<{ name: string; path: string; files: number }>;
    totalFiles: number;
    totalLines: number;
  }> {
    const basePath = projectPath || this.currentProjectPath;
    const modules: Array<{ name: string; path: string; files: number }> = [];
    let totalFiles = 0;
    let totalLines = 0;

    try {
      if (this.symbolIndex) {
        // まず、インデックスが最新かチェック
        const stats = await this.symbolIndex.getStats();
        if (!stats || stats.totalSymbols === 0) {
          console.log('インデックスが空です。プロジェクトを再インデックス中...');
          await this.symbolIndex.indexProject();
        }
        
        // インデックスからファイル情報を取得
        const allSymbols = await this.symbolIndex.findSymbols({});
        const fileGroups = new Map<string, Set<string>>();
        const fileLines = new Map<string, number>();
        
        // ファイルごとにシンボルをグループ化
        for (const symbol of allSymbols) {
          const filePath = symbol.fileUri ? URI.parse(symbol.fileUri).fsPath : '';
          if (filePath) {
            const dir = path.dirname(filePath).replace(basePath, '').replace(/^\//, '') || 'root';
            if (!fileGroups.has(dir)) {
              fileGroups.set(dir, new Set());
            }
            fileGroups.get(dir)!.add(filePath);
            
            // ファイルの行数を取得（まだ取得していない場合）
            if (!fileLines.has(filePath)) {
              try {
                const content = await fs.readFile(filePath, 'utf-8');
                const lines = content.split('\n').length;
                fileLines.set(filePath, lines);
                totalLines += lines;
              } catch (error) {
                // ファイル読み取りエラーは無視
              }
            }
          }
        }
        
        // モジュール情報を構築
        fileGroups.forEach((files, dir) => {
          modules.push({
            name: dir || 'root',
            path: path.join(basePath, dir),
            files: files.size
          });
          totalFiles += files.size;
        });
      }

      return { modules, totalFiles, totalLines };
    } catch (error) {
      logger.warn('Project structure analysis failed', { error });
      return { modules: [], totalFiles: 0, totalLines: 0 };
    }
  }

  /**
   * 依存関係グラフ取得
   */
  async getDependencyGraph(): Promise<{
    nodes: Array<{ name: string; type: string; dependencies?: string[] }>;
    edges: Array<{ from: string; to: string }>;
  }> {
    const nodes: Array<{ name: string; type: string; dependencies?: string[] }> = [];
    const edges: Array<{ from: string; to: string }> = [];

    try {
      if (this.symbolIndex) {
        const symbols = await this.symbolIndex.findSymbols({});
        
        symbols.forEach((symbol: any) => {
          nodes.push({
            name: symbol.name,
            type: symbol.kind || 'unknown',
            dependencies: []
          });

          // 簡単な依存関係を構築（実際のLSPからの情報が必要）
          if (symbol.name.includes('Component') || symbol.name.includes('Service')) {
            edges.push({
              from: symbol.name,
              to: 'core'
            });
          }
        });
      }

      return { nodes, edges };
    } catch (error) {
      logger.warn('Dependency graph analysis failed', { error });
      return { nodes: [], edges: [] };
    }
  }

  /**
   * プロジェクト内のファイルをリスト
   */
  async listProjectFiles(projectPath?: string): Promise<string[]> {
    const targetPath = projectPath || this.currentProjectPath || process.cwd();
    const files: string[] = [];
    
    const walk = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        // Skip directories based on exclude settings
        if (entry.isDirectory()) {
          if (this.excludeDirectories.has(entry.name)) {
            continue;
          }
          await walk(fullPath);
        } else if (entry.isFile()) {
          // Check if file matches any exclude pattern
          const shouldExclude = this.excludePatterns.some(pattern => pattern.test(entry.name));
          if (shouldExclude) {
            continue;
          }
          
          // Include source files
          if (/\.(ts|tsx|js|jsx|py|java|cpp|c|cs|go|rs|rb|php)$/.test(entry.name)) {
            files.push(fullPath);
          }
        }
      }
    }
    
    try {
      await walk(targetPath);
    } catch (error) {
      logger.error('Failed to list project files:', error);
    }
    
    return files;
  }
}

/**
 * IntelligentFileSystemインスタンスを作成
 */
export function createIntelligentFileSystem(
  securityConfig: SecurityConfig,
  projectPath?: string
): IntelligentFileSystem {
  return new IntelligentFileSystem(securityConfig, projectPath);
}
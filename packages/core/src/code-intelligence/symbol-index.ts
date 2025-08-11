/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import sqlite3, { Database } from 'sqlite3';
import { promisify } from 'util';
import { TypeScriptLSPClient, createTypeScriptLSPClient, SymbolQuery } from './lsp-client.js';
import { URI } from 'vscode-uri';
import { SymbolInformation, DocumentSymbol, Location, SymbolKind } from 'vscode-languageserver-protocol';
import * as path from 'path';
import * as fs from 'fs/promises';
import { glob } from 'glob';

export interface SymbolIndexInfo {
  id: string;
  name: string;
  kind: SymbolKind;
  fileUri: string;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
  containerName?: string;
  signature?: string;
  documentation?: string;
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
  createdAt: Date;
}

export interface ProjectIndexStats {
  totalFiles: number;
  totalSymbols: number;
  totalReferences: number;
  lastUpdated: Date;
  indexedFiles: string[];
}

/**
 * SQLiteベースのシンボルインデックス
 * Serenaのsymbol.pyと同等機能をTypeScript環境で提供
 */
export class SymbolIndex {
  private db?: Database;
  private lspClient?: TypeScriptLSPClient;
  private isInitialized = false;

  constructor(
    private dbPath: string,
    private workspaceRoot: string
  ) {}

  /**
   * データベースとLSPクライアントを初期化
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // データベースディレクトリを作成
    const dbDir = path.dirname(this.dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    // SQLiteデータベース初期化
    this.db = new sqlite3.Database(this.dbPath);
    await this.setupDatabase();

    // LSPクライアント初期化
    this.lspClient = createTypeScriptLSPClient(this.workspaceRoot);
    await this.lspClient.initialize();

    this.isInitialized = true;
    console.log(`Symbol index initialized: ${this.dbPath}`);
  }

  /**
   * データベーススキーマの作成
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
        kind INTEGER NOT NULL,
        file_uri TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        start_character INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        end_character INTEGER NOT NULL,
        container_name TEXT,
        signature TEXT,
        documentation TEXT,
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

    // インデックス作成
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_uri)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_references_symbol ON symbol_references(symbol_id)');
    await runAsync('CREATE INDEX IF NOT EXISTS idx_references_file ON symbol_references(file_uri)');
  }

  /**
   * プロジェクト全体のインデックス作成（Serenaのonboarding相当）
   */
  async indexProject(): Promise<ProjectIndexStats> {
    await this.ensureInitialized();

    console.log('Starting project indexing...');
    const startTime = Date.now();

    // TypeScript/JavaScriptファイルを検索
    const files = await this.discoverSourceFiles();
    console.log(`Found ${files.length} source files`);

    const stats: ProjectIndexStats = {
      totalFiles: files.length,
      totalSymbols: 0,
      totalReferences: 0,
      lastUpdated: new Date(),
      indexedFiles: []
    };

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
          
          if (result.status === 'fulfilled') {
            stats.totalSymbols += result.value.symbolCount;
            stats.indexedFiles.push(file);
            console.log(`Indexed: ${file} (${result.value.symbolCount} symbols)`);
          } else {
            console.error(`Failed to index ${file}:`, result.reason);
          }
        }
      } catch (error) {
        console.error('Batch indexing error:', error);
      }
    }

    // 統計情報を保存
    await this.saveProjectStats(stats);

    const duration = Date.now() - startTime;
    console.log(`Project indexing completed in ${duration}ms`);
    console.log(`Indexed ${stats.totalSymbols} symbols from ${stats.indexedFiles.length} files`);

    return stats;
  }

  /**
   * 単一ファイルのインデックス作成
   */
  async indexFile(filePath: string): Promise<{ symbolCount: number }> {
    await this.ensureInitialized();

    const fileUri = URI.file(filePath).toString();
    
    // 既存のシンボルを削除
    await this.removeFileSymbols(fileUri);

    try {
      // LSPからシンボル情報を取得
      const symbols = await this.lspClient!.getDocumentSymbols(fileUri);
      let symbolCount = 0;

      // シンボルを再帰的に処理
      await this.processDocumentSymbols(symbols, fileUri);
      symbolCount = await this.countSymbolsInFile(fileUri);

      return { symbolCount };
    } catch (error) {
      console.error(`Failed to index file ${filePath}:`, error);
      return { symbolCount: 0 };
    }
  }

  /**
   * シンボル検索（Serenaのfind_symbolと同等）
   */
  async findSymbols(query: SymbolQuery): Promise<SymbolIndexInfo[]> {
    await this.ensureInitialized();

    const conditions: string[] = [];
    const params: any[] = [];

    if (query.name) {
      conditions.push('name LIKE ?');
      params.push(`%${query.name}%`);
    }

    if (query.kind) {
      conditions.push('kind = ?');
      params.push(parseInt(query.kind));
    }

    if (query.fileUri) {
      conditions.push('file_uri = ?');
      params.push(query.fileUri);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT * FROM symbols 
      ${whereClause} 
      ORDER BY name, file_uri
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
    const patterns = [
      '**/*.ts',
      '**/*.tsx',
      '**/*.js',
      '**/*.jsx'
    ];

    const ignorePatterns = [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**'
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
        id, name, kind, file_uri, start_line, start_character, 
        end_line, end_character, container_name, signature, documentation
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
      symbol.id, symbol.name, symbol.kind, symbol.fileUri,
      symbol.startLine, symbol.startCharacter, symbol.endLine, symbol.endCharacter,
      symbol.containerName, symbol.signature, symbol.documentation
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
      fileUri: row.file_uri,
      startLine: row.start_line,
      startCharacter: row.start_character,
      endLine: row.end_line,
      endCharacter: row.end_character,
      containerName: row.container_name,
      signature: row.signature,
      documentation: row.documentation,
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
      createdAt: new Date(row.created_at)
    };
  }
}

/**
 * プロジェクト用のシンボルインデックスファクトリ
 */
export function createSymbolIndex(projectPath: string): SymbolIndex {
  const dbPath = path.join(projectPath, '.agents', 'symbol-index.db');
  return new SymbolIndex(dbPath, projectPath);
}
/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { spawn, ChildProcess } from 'child_process';
import { 
  createMessageConnection, 
  MessageConnection,
  InitializeRequest,
  InitializeParams,
  ServerCapabilities,
  DocumentSymbolRequest,
  DocumentSymbol,
  WorkspaceSymbolRequest,
  SymbolInformation,
  DefinitionRequest,
  ReferencesRequest,
  Location,
  Position,
  TextDocumentIdentifier,
  ReferenceParams,
  DefinitionParams,
  WorkspaceSymbolParams,
  DidOpenTextDocumentNotification,
  DidCloseTextDocumentNotification,
  TextDocumentItem
} from 'vscode-languageserver-protocol';
import { 
  StreamMessageReader, 
  StreamMessageWriter 
} from 'vscode-languageserver-protocol/node.js';
import { URI } from 'vscode-uri';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface LSPClientConfig {
  serverCommand: string;
  serverArgs: string[];
  workspaceRoot: string;
  timeout: number;
}

export interface SymbolQuery {
  name?: string;
  kind?: string;
  fileUri?: string;
  includeReferences?: boolean;
}

/**
 * TypeScript Language Server クライアント
 * Serenaと同様のLSP統合によるシンボル情報取得
 */
export class TypeScriptLSPClient {
  private connection?: MessageConnection;
  private serverProcess?: ChildProcess;
  private capabilities?: ServerCapabilities;
  private initialized = false;
  private initializePromise?: Promise<void>;
  private openDocuments = new Set<string>();

  constructor(private config: LSPClientConfig) {}

  /**
   * LSPサーバーとの接続を初期化
   */
  async initialize(): Promise<void> {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = this._initialize();
    return this.initializePromise;
  }

  private async _initialize(): Promise<void> {
    try {
      // TypeScript Language Serverを起動
      this.serverProcess = spawn(this.config.serverCommand, this.config.serverArgs, {
        stdio: 'pipe',
        cwd: this.config.workspaceRoot,
      });

      if (!this.serverProcess.stdout || !this.serverProcess.stdin) {
        throw new Error('Failed to create server process streams');
      }

      // LSP接続を作成
      this.connection = createMessageConnection(
        new StreamMessageReader(this.serverProcess.stdout),
        new StreamMessageWriter(this.serverProcess.stdin)
      );

      // エラーハンドリング
      this.connection.onError((error: any) => {
        console.error('LSP Connection Error:', error);
      });

      this.connection.onClose(() => {
        console.log('LSP Connection closed');
        this.initialized = false;
      });

      // 接続開始
      this.connection.listen();

      // 初期化リクエスト送信
      const initParams: InitializeParams = {
        processId: process.pid,
        rootUri: URI.file(this.config.workspaceRoot).toString(),
        capabilities: {
          workspace: {
            symbol: {
              symbolKind: {
                valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
              }
            }
          },
          textDocument: {
            documentSymbol: {
              symbolKind: {
                valueSet: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26]
              },
              hierarchicalDocumentSymbolSupport: true
            },
            definition: {
              linkSupport: true
            },
            references: {}
          }
        }
      };

      const initResult = await this.connection.sendRequest(InitializeRequest.type, initParams);
      this.capabilities = initResult.capabilities;

      // initialized notification
      await this.connection.sendNotification('initialized', {});
      
      this.initialized = true;
      console.log('TypeScript LSP Client initialized successfully');
    } catch (error) {
      this.initialized = false;
      throw new Error(`Failed to initialize LSP client: ${error}`);
    }
  }

  /**
   * ドキュメントを開く
   */
  private async openDocument(fileUri: string): Promise<void> {
    if (this.openDocuments.has(fileUri)) {
      return;
    }

    const fileContent = await fs.readFile(URI.parse(fileUri).fsPath, 'utf-8');
    
    await this.connection!.sendNotification(
      DidOpenTextDocumentNotification.type,
      {
        textDocument: {
          uri: fileUri,
          languageId: 'typescript',
          version: 1,
          text: fileContent
        } as TextDocumentItem
      }
    );
    
    this.openDocuments.add(fileUri);
  }

  /**
   * ドキュメントを閉じる
   */
  private async closeDocument(fileUri: string): Promise<void> {
    if (!this.openDocuments.has(fileUri)) {
      return;
    }

    await this.connection!.sendNotification(
      DidCloseTextDocumentNotification.type,
      {
        textDocument: { uri: fileUri }
      }
    );
    
    this.openDocuments.delete(fileUri);
  }

  /**
   * ファイル内のシンボル一覧を取得
   */
  async getDocumentSymbols(fileUri: string): Promise<DocumentSymbol[]> {
    await this.ensureInitialized();

    // ファイルを開く
    await this.openDocument(fileUri);

    const symbols = await this.connection!.sendRequest(
      DocumentSymbolRequest.type,
      {
        textDocument: { uri: fileUri }
      }
    );

    // ファイルを閉じる
    await this.closeDocument(fileUri);

    // DocumentSymbol[] または SymbolInformation[] の可能性があるため正規化
    return Array.isArray(symbols) ? symbols.filter(s => 'range' in s) as DocumentSymbol[] : [];
  }

  /**
   * ワークスペース全体からシンボルを検索
   */
  async findWorkspaceSymbols(query: string): Promise<SymbolInformation[]> {
    await this.ensureInitialized();

    if (!this.capabilities?.workspaceSymbolProvider) {
      return [];
    }

    const params: WorkspaceSymbolParams = { query };
    const symbols = await this.connection!.sendRequest(
      WorkspaceSymbolRequest.type,
      params
    );

    // WorkspaceSymbolをSymbolInformationに正規化
    if (Array.isArray(symbols)) {
      return symbols.map(symbol => {
        if ('location' in symbol && typeof symbol.location === 'object' && 'uri' in symbol.location && !('range' in symbol.location)) {
          // WorkspaceSymbolの場合はLocationに変換
          return {
            ...symbol,
            location: {
              uri: symbol.location.uri,
              range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }
            }
          } as SymbolInformation;
        }
        return symbol as SymbolInformation;
      });
    }
    return [];
  }

  /**
   * シンボルの定義場所を取得
   */
  async findDefinition(fileUri: string, position: Position): Promise<Location[]> {
    await this.ensureInitialized();

    const params: DefinitionParams = {
      textDocument: { uri: fileUri },
      position
    };

    const result = await this.connection!.sendRequest(DefinitionRequest.type, params);
    
    if (!result) return [];
    if (Array.isArray(result)) {
      // LocationLinkをLocationに変換
      return result.map(item => {
        if ('targetUri' in item) {
          // LocationLink
          return {
            uri: item.targetUri,
            range: item.targetRange
          } as Location;
        }
        return item as Location;
      });
    }
    
    // 単一の結果の場合
    if ('targetUri' in result) {
      return [{
        uri: (result as any).targetUri,
        range: (result as any).targetRange
      } as Location];
    }
    return [result as Location];
  }

  /**
   * シンボルの参照箇所を取得
   */
  async findReferences(fileUri: string, position: Position, includeDeclaration = false): Promise<Location[]> {
    await this.ensureInitialized();

    const params: ReferenceParams = {
      textDocument: { uri: fileUri },
      position,
      context: { includeDeclaration }
    };

    const result = await this.connection!.sendRequest(ReferencesRequest.type, params);
    return Array.isArray(result) ? result : [];
  }

  /**
   * 複合的なシンボル検索（Serenaスタイル）
   */
  async findSymbols(query: SymbolQuery): Promise<SymbolInformation[]> {
    await this.ensureInitialized();

    const results: SymbolInformation[] = [];

    // 名前による検索
    if (query.name) {
      const workspaceSymbols = await this.findWorkspaceSymbols(query.name);
      results.push(...workspaceSymbols);
    }

    // ファイル内検索
    if (query.fileUri) {
      const documentSymbols = await this.getDocumentSymbols(query.fileUri);
      const converted = this.convertDocumentSymbolsToSymbolInformation(documentSymbols, query.fileUri);
      results.push(...converted);
    }

    // 結果をフィルタリング
    return results.filter(symbol => {
      if (query.kind && symbol.kind !== parseInt(query.kind)) return false;
      if (query.name && !symbol.name.includes(query.name)) return false;
      return true;
    });
  }

  /**
   * 接続を終了
   */
  async disconnect(): Promise<void> {
    // 開いているドキュメントをすべて閉じる
    for (const fileUri of Array.from(this.openDocuments)) {
      try {
        await this.closeDocument(fileUri);
      } catch (error) {
        // エラーは無視
      }
    }
    
    if (this.connection) {
      this.connection.dispose();
    }
    
    if (this.serverProcess) {
      this.serverProcess.kill();
    }
    
    this.initialized = false;
    this.initializePromise = undefined;
  }

  /**
   * 初期化状態を確認
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * DocumentSymbolをSymbolInformationに変換
   */
  private convertDocumentSymbolsToSymbolInformation(
    symbols: DocumentSymbol[], 
    uri: string,
    containerName?: string
  ): SymbolInformation[] {
    const results: SymbolInformation[] = [];

    for (const symbol of symbols) {
      const symbolInfo: SymbolInformation = {
        name: symbol.name,
        kind: symbol.kind,
        location: {
          uri,
          range: symbol.selectionRange
        },
        containerName
      };

      results.push(symbolInfo);

      // 子シンボルも再帰的に処理
      if (symbol.children && symbol.children.length > 0) {
        const childSymbols = this.convertDocumentSymbolsToSymbolInformation(
          symbol.children,
          uri,
          symbol.name
        );
        results.push(...childSymbols);
      }
    }

    return results;
  }
}

/**
 * TypeScript専用のLSPクライアントファクトリ
 */
export function createTypeScriptLSPClient(workspaceRoot: string): TypeScriptLSPClient {
  const config: LSPClientConfig = {
    serverCommand: 'typescript-language-server',
    serverArgs: ['--stdio'],
    workspaceRoot,
    timeout: 30000
  };

  return new TypeScriptLSPClient(config);
}

/**
 * デフォルト設定でのLSPクライアント作成
 */
export function createDefaultLSPClient(): TypeScriptLSPClient {
  return createTypeScriptLSPClient(process.cwd());
}
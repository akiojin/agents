/**
 * Serena MCP連携ドキュメントアダプター
 * DocumentManagerとSerenaメモリシステムの橋渡し
 */

import type { Document, FrontMatter, DocType, SearchResult } from '../types/document.js';
import type { DocumentManager } from './document-manager.js';
import { generateMarkdown, parseFrontMatter } from '../utils/front-matter.js';
import { logger } from '../utils/logger.js';

/**
 * Serenaメモリファイル情報
 */
interface SerenaMemoryFile {
  name: string;
  content: string;
  type: DocType;
  docId: string;
}

/**
 * Serenaメモリ連携設定
 */
interface SerenaAdapterConfig {
  /** メモリファイル名プレフィックス */
  memoryPrefix?: string;
  
  /** 自動バックアップ */
  autoBackup?: boolean;
  
  /** メモリ構造の有効化（階層化） */
  enableStructure?: boolean;
  
  /** キャッシュ有効時間（分） */
  cacheTimeout?: number;
}

/**
 * Serenaドキュメントアダプター
 * DocumentManagerで作成・管理されたドキュメントをSerenaメモリに保存・取得
 */
export class SerenaDocumentAdapter {
  private documentManager: DocumentManager;
  private config: Required<SerenaAdapterConfig>;
  private memoryCache: Map<string, { document: Document; timestamp: number }> = new Map();

  constructor(documentManager: DocumentManager, config: SerenaAdapterConfig = {}) {
    this.documentManager = documentManager;
    this.config = {
      memoryPrefix: config.memoryPrefix || 'doc',
      autoBackup: config.autoBackup ?? true,
      enableStructure: config.enableStructure ?? true,
      cacheTimeout: config.cacheTimeout || 30
    };

    logger.debug('SerenaDocumentAdapter初期化完了', this.config);
  }

  /**
   * ドキュメントをSerenaメモリに保存
   * writeMemoryツールを使用
   */
  async saveToSerenaMemory(document: Document): Promise<void> {
    try {
      const memoryName = this.generateMemoryName(document);
      const markdown = generateMarkdown(document.frontMatter, document.content);

      // Serenaメモリ書き込みのAPIを呼び出す
      logger.info(`Serenaメモリに保存中: ${memoryName}`);
      await this.writeToSerenaMemory(memoryName, markdown);
      
      // キャッシュ更新
      this.updateCache(document);

      logger.debug(`ドキュメント保存完了: ${document.frontMatter.doc_id}`);
    } catch (error) {
      logger.error('Serenaメモリ保存エラー:', error);
      throw error;
    }
  }

  /**
   * Serenaメモリからドキュメントを読み込み
   * readMemoryツールを使用
   */
  async loadFromSerenaMemory(docId: string): Promise<Document | null> {
    try {
      // キャッシュから確認
      const cached = this.getFromCache(docId);
      if (cached) {
        return cached.document;
      }

      const memoryName = this.generateMemoryNameFromId(docId);
      
      // Serenaメモリ読み込みのAPIを呼び出す
      // 注意: 実際のSerena MCP呼び出しは、AgentCore経由で行う
      logger.info(`Serenaメモリから読み込み中: ${memoryName}`);
      
      // プレースホルダー: 実際の実装ではSerena MCPからコンテンツを取得
      const markdownContent = await this.readFromSerenaMemory(memoryName);
      
      if (!markdownContent) {
        return null;
      }

      const parseResult = parseFrontMatter(markdownContent);
      if (!parseResult.frontMatter) {
        throw new Error(`Invalid front matter in memory: ${memoryName}`);
      }

      const document: Document = {
        frontMatter: parseResult.frontMatter,
        content: parseResult.content,
        filePath: `memory://${memoryName}`,
        createdAt: new Date(parseResult.frontMatter.created),
        updatedAt: new Date()
      };

      // キャッシュに保存
      this.updateCache(document);

      return document;
    } catch (error) {
      logger.error('Serenaメモリ読み込みエラー:', error);
      return null;
    }
  }

  /**
   * 全メモリファイルを一覧取得
   * listMemoriesツールを使用
   */
  async listAllDocuments(): Promise<string[]> {
    try {
      // Serenaメモリ一覧取得のAPIを呼び出す
      // 注意: 実際のSerena MCP呼び出しは、AgentCore経由で行う
      logger.info('Serenaメモリ一覧を取得中...');
      
      // プレースホルダー: 実際の実装ではSerena MCPから一覧を取得
      const memoryList = await this.listSerenaMemories();
      
      // ドキュメントプレフィックスでフィルタ
      const documentMemories = memoryList.filter(name => 
        name.startsWith(this.config.memoryPrefix)
      );

      logger.debug(`ドキュメントメモリ件数: ${documentMemories.length}`);
      return documentMemories;
    } catch (error) {
      logger.error('メモリ一覧取得エラー:', error);
      return [];
    }
  }

  /**
   * ドキュメント検索をSerenaメモリベースで実行
   */
  async searchInSerenaMemories(query: string): Promise<SearchResult[]> {
    try {
      const memoryNames = await this.listAllDocuments();
      const results: SearchResult[] = [];

      // 各メモリファイルを並列で読み込み・検索
      const searchPromises = memoryNames.map(async (memoryName) => {
        const docId = this.extractDocIdFromMemoryName(memoryName);
        const document = await this.loadFromSerenaMemory(docId);
        
        if (!document) return null;

        // DocumentManagerの検索機能を活用
        const searchResults = await this.documentManager.searchDocuments(query, { limit: 1 });
        return searchResults.length > 0 ? searchResults[0] : null;
      });

      const searchResults = await Promise.allSettled(searchPromises);
      
      for (const result of searchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }

      // 類似度でソート
      results.sort((a, b) => b.similarity - a.similarity);
      
      logger.debug(`Serenaメモリ検索完了: ${results.length}件の結果`);
      return results;
    } catch (error) {
      logger.error('Serenaメモリ検索エラー:', error);
      return [];
    }
  }

  /**
   * ドキュメント重複チェック（Serenaメモリベース）
   */
  async checkDuplicatesInSerenaMemory(
    title: string,
    content: string,
    type: DocType
  ): Promise<{ isDuplicate: boolean; similarDocuments: Document[] }> {
    try {
      logger.info(`重複チェック実行: ${title} (${type})`);
      
      // 既存ドキュメントを取得
      const memoryNames = await this.listAllDocuments();
      const existingDocuments: Document[] = [];

      for (const memoryName of memoryNames) {
        const docId = this.extractDocIdFromMemoryName(memoryName);
        const document = await this.loadFromSerenaMemory(docId);
        
        if (document && document.frontMatter.type === type) {
          existingDocuments.push(document);
        }
      }

      // DocumentManagerの重複チェック機能を活用
      const duplicates = await this.documentManager.checkDuplicates(
        { title, content, type },
        0.8 // 80%の類似度閾値
      );

      const isDuplicate = duplicates.length > 0;
      const similarDocuments = duplicates.map(d => d.existing);

      logger.debug(`重複チェック完了: ${isDuplicate ? '重複あり' : '重複なし'} (${similarDocuments.length}件の類似文書)`);
      
      return {
        isDuplicate,
        similarDocuments
      };
    } catch (error) {
      logger.error('重複チェックエラー:', error);
      return {
        isDuplicate: false,
        similarDocuments: []
      };
    }
  }

  /**
   * メモリのアーカイブ（古いドキュメントを別の場所に移動）
   */
  async archiveOldDocuments(olderThanMonths: number = 12): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - olderThanMonths);
      
      const memoryNames = await this.listAllDocuments();
      let archivedCount = 0;

      for (const memoryName of memoryNames) {
        const docId = this.extractDocIdFromMemoryName(memoryName);
        const document = await this.loadFromSerenaMemory(docId);
        
        if (document && document.updatedAt < cutoffDate) {
          await this.archiveDocument(document, memoryName);
          archivedCount++;
        }
      }

      logger.info(`ドキュメントアーカイブ完了: ${archivedCount}件`);
      return archivedCount;
    } catch (error) {
      logger.error('ドキュメントアーカイブエラー:', error);
      return 0;
    }
  }

  // プライベートメソッド

  private generateMemoryName(document: Document): string {
    const { doc_id, type } = document.frontMatter;
    
    if (this.config.enableStructure) {
      // 階層構造: doc-type-specific-id
      return `${this.config.memoryPrefix}-${type}-${doc_id}`;
    } else {
      // フラット構造
      return `${this.config.memoryPrefix}-${doc_id}`;
    }
  }

  private generateMemoryNameFromId(docId: string): string {
    // docIdからtypeを抽出（AGENTS-AREA-TYPE-DATE-SEQ 形式）
    const parts = docId.split('-');
    if (parts.length >= 3) {
      const type = parts[2].toLowerCase();
      return this.config.enableStructure 
        ? `${this.config.memoryPrefix}-${type}-${docId}`
        : `${this.config.memoryPrefix}-${docId}`;
    }
    
    return `${this.config.memoryPrefix}-${docId}`;
  }

  private extractDocIdFromMemoryName(memoryName: string): string {
    // メモリ名からdocIdを抽出
    const prefix = this.config.memoryPrefix + '-';
    
    if (this.config.enableStructure) {
      // doc-type-AGENTS-AREA-TYPE-DATE-SEQ -> AGENTS-AREA-TYPE-DATE-SEQ
      const parts = memoryName.replace(prefix, '').split('-');
      return parts.slice(1).join('-'); // typeを除去
    } else {
      // doc-AGENTS-AREA-TYPE-DATE-SEQ -> AGENTS-AREA-TYPE-DATE-SEQ
      return memoryName.replace(prefix, '');
    }
  }

  private updateCache(document: Document): void {
    const docId = document.frontMatter.doc_id;
    const now = Date.now();
    
    this.memoryCache.set(docId, {
      document,
      timestamp: now
    });

    // キャッシュクリーンアップ
    this.cleanupCache();
  }

  private getFromCache(docId: string): { document: Document } | null {
    const cached = this.memoryCache.get(docId);
    
    if (!cached) {
      return null;
    }

    // キャッシュタイムアウトチェック
    const now = Date.now();
    const timeoutMs = this.config.cacheTimeout * 60 * 1000;
    
    if (now - cached.timestamp > timeoutMs) {
      this.memoryCache.delete(docId);
      return null;
    }

    return cached;
  }

  private cleanupCache(): void {
    const now = Date.now();
    const timeoutMs = this.config.cacheTimeout * 60 * 1000;
    
    for (const [docId, cached] of this.memoryCache.entries()) {
      if (now - cached.timestamp > timeoutMs) {
        this.memoryCache.delete(docId);
      }
    }
  }

  // Serena MCPツール呼び出しインターフェース
  private serenaInterface?: {
    writeMemory: (name: string, content: string) => Promise<void>;
    readMemory: (name: string) => Promise<string | null>;
    listMemories: () => Promise<string[]>;
    deleteMemory: (name: string) => Promise<void>;
  };

  private async readFromSerenaMemory(memoryName: string): Promise<string | null> {
    if (!this.serenaInterface) {
      throw new Error('Serena MCPインターフェースが設定されていません');
    }

    try {
      const content = await this.serenaInterface.readMemory(memoryName);
      logger.debug(`Serenaメモリ読み込み完了: ${memoryName} (${content ? 'データあり' : 'データなし'})`);
      return content;
    } catch (error) {
      logger.error(`Serenaメモリ読み込みエラー: ${memoryName}`, error);
      return null;
    }
  }

  private async listSerenaMemories(): Promise<string[]> {
    if (!this.serenaInterface) {
      throw new Error('Serena MCPインターフェースが設定されていません');
    }

    try {
      const memories = await this.serenaInterface.listMemories();
      logger.debug(`Serenaメモリ一覧取得完了: ${memories.length}件`);
      return memories;
    } catch (error) {
      logger.error('Serenaメモリ一覧取得エラー:', error);
      return [];
    }
  }

  private async writeToSerenaMemory(memoryName: string, content: string): Promise<void> {
    if (!this.serenaInterface) {
      throw new Error('Serena MCPインターフェースが設定されていません');
    }

    try {
      await this.serenaInterface.writeMemory(memoryName, content);
      logger.debug(`Serenaメモリ書き込み完了: ${memoryName} (${content.length}文字)`);
    } catch (error) {
      logger.error(`Serenaメモリ書き込みエラー: ${memoryName}`, error);
      throw error;
    }
  }

  private async archiveDocument(document: Document, memoryName: string): Promise<void> {
    if (!this.serenaInterface) {
      throw new Error('Serena MCPインターフェースが設定されていません');
    }

    try {
      // アーカイブ名を生成（日付サフィックス付き）
      const archiveName = `${memoryName}-archived-${new Date().toISOString().slice(0, 10)}`;
      
      // 現在のコンテンツを読み込み
      const content = await this.readFromSerenaMemory(memoryName);
      if (!content) {
        logger.warn(`アーカイブ対象のメモリが見つかりません: ${memoryName}`);
        return;
      }

      // アーカイブとして新規保存
      await this.serenaInterface.writeMemory(archiveName, content);
      
      // 元のメモリを削除
      await this.serenaInterface.deleteMemory(memoryName);
      
      logger.info(`ドキュメントアーカイブ完了: ${memoryName} -> ${archiveName}`);
    } catch (error) {
      logger.error(`ドキュメントアーカイブエラー: ${memoryName}`, error);
      throw error;
    }
  }

  /**
   * Serena MCPツール実行インターフェースを設定
   * AgentCoreから注入される
   */
  setSerenaInterface(serenaInterface: {
    writeMemory: (name: string, content: string) => Promise<void>;
    readMemory: (name: string) => Promise<string | null>;
    listMemories: () => Promise<string[]>;
    deleteMemory: (name: string) => Promise<void>;
  }): void {
    this.serenaInterface = serenaInterface;
    logger.debug('Serena MCPインターフェースを設定完了');
  }
}
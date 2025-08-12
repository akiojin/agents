/**
 * CLIツール用のIntelligentFileSystemサービス
 * パッケージ境界を越えてIntelligentFileSystemにアクセスするためのサービス層
 */

// logger の代わりにconsoleを使用（クロスパッケージインポートを回避）

// IntelligentFileSystemの型定義
interface IntelligentReadResult {
  success: boolean;
  data?: {
    content: string;
    symbols?: Array<{
      name: string;
      kind: string;
      location: { line: number; column: number };
    }>;
    dependencies?: string[];
    metrics?: {
      complexity: number;
      maintainability: number;
      lines: number;
    };
  };
  error?: string;
}

interface IntelligentWriteResult {
  success: boolean;
  data?: {
    symbolsUpdated?: number;
    referencesUpdated?: number;
    validationErrors?: string[];
  };
  error?: string;
}

/**
 * IntelligentFileSystemの機能をCLIツールから利用するためのサービス
 */
export class IntelligentFileService {
  private static instance: IntelligentFileService | null = null;
  private intelligentFS: any = null;
  private initialized = false;

  private constructor() {}

  public static getInstance(): IntelligentFileService {
    if (!IntelligentFileService.instance) {
      IntelligentFileService.instance = new IntelligentFileService();
    }
    return IntelligentFileService.instance;
  }

  /**
   * IntelligentFileSystemを初期化
   */
  public async initialize(): Promise<boolean> {
    if (this.initialized && this.intelligentFS) {
      return true;
    }

    try {
      console.log('[IntelligentFileService] Initializing IntelligentFileSystem...');
      
      // ディレクトリ存在確認
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      
      const projectPath = process.cwd();
      const cacheDir = pathModule.join(projectPath, '.agents', 'cache');
      
      console.log(`[IntelligentFileService] Project path: ${projectPath}`);
      console.log(`[IntelligentFileService] Cache directory: ${cacheDir}`);
      
      try {
        await fs.mkdir(cacheDir, { recursive: true });
        console.log('[IntelligentFileService] Cache directory created successfully');
      } catch (dirError) {
        console.warn('[IntelligentFileService] Cache directory creation warning:', dirError);
      }
      
      // 実際のIntelligentFileSystemを初期化
      console.log('[IntelligentFileService] Importing IntelligentFileSystem...');
      const { IntelligentFileSystem } = await import('../intelligent-fs/intelligent-filesystem.js');
      
      // セキュリティ設定
      const securityConfig = {
        allowedPaths: [projectPath],
        allowedFileExtensions: ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rs', '.cs', '.php', '.rb', '.swift', '.kt', '.cpp', '.c', '.json', '.md'],
        maxFileSize: 10 * 1024 * 1024, // 10MB
        enabled: true
      };
      
      console.log('[IntelligentFileService] Creating IntelligentFileSystem instance...');
      this.intelligentFS = new IntelligentFileSystem(securityConfig, projectPath);
      
      console.log('[IntelligentFileService] Calling initialize()...');
      await this.intelligentFS.initialize();
      
      this.initialized = true;
      console.log('[IntelligentFileService] IntelligentFileSystem initialized successfully');
      return true;
    } catch (error) {
      console.error('[IntelligentFileService] Detailed error during initialization:');
      console.error('[IntelligentFileService] Error type:', error?.constructor?.name);
      console.error('[IntelligentFileService] Error message:', error instanceof Error ? error.message : String(error));
      console.error('[IntelligentFileService] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      
      this.initialized = false;
      throw new Error(`IntelligentFileSystem initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * IntelligentFileSystemが利用可能かチェック
   */
  public isAvailable(): boolean {
    return this.initialized && this.intelligentFS !== null;
  }

  /**
   * ファイルをインテリジェントに読み取り
   */
  public async readFileIntelligent(filePath: string): Promise<IntelligentReadResult> {
    console.log(`[IntelligentFileService] readFileIntelligent called for: ${filePath}`);
    
    if (!this.isAvailable()) {
      console.log(`[IntelligentFileService] Not available, attempting initialization`);
      const initSuccess = await this.initialize();
      if (!initSuccess) {
        console.log(`[IntelligentFileService] Initialization failed`);
        return {
          success: false,
          error: 'IntelligentFileSystem is required but not available'
        };
      }
      console.log(`[IntelligentFileService] Initialization successful`);
    }

    try {
      const result = await this.intelligentFS.readFile(filePath, {
        includeSymbols: true,
        includeDependencies: true,
        useCache: true
      });
      
      return {
        success: result.success,
        data: {
          content: result.content,
          symbols: result.symbols?.map((s: any) => ({
            name: s.name,
            kind: s.kind || 'unknown',
            location: { line: 0, column: 0 }
          })) || [],
          dependencies: result.dependencies,
          metrics: {
            complexity: 1.0,
            maintainability: 80.0,
            lines: result.content.split('\n').length
          }
        },
        error: result.error
      };
    } catch (error) {
      console.error('IntelligentFileService read failed:', error);
      throw new Error(`IntelligentFileSystem read failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * ファイルをインテリジェントに書き込み
   */
  public async writeFileIntelligent(
    filePath: string,
    content: string,
    options: {
      updateIndex?: boolean;
      trackHistory?: boolean;
      validateSemantics?: boolean;
      updateReferences?: boolean;
      encoding?: string;
    } = {}
  ): Promise<IntelligentWriteResult> {
    if (!this.isAvailable()) {
      const initSuccess = await this.initialize();
      if (!initSuccess) {
        return {
          success: false,
          error: 'IntelligentFileSystem is required but not available'
        };
      }
    }

    try {
      const result = await this.intelligentFS.writeFileIntelligent(filePath, content, {
        updateIndex: options.updateIndex ?? true,
        trackHistory: options.trackHistory ?? true,
        validateSemantics: options.validateSemantics ?? false,
        updateReferences: options.updateReferences ?? false,
        encoding: options.encoding || 'utf-8'
      });
      return result;
    } catch (error) {
      console.debug('IntelligentFileService write failed:', error);
      return {
        success: false,
        error: `IntelligentFileSystem write failed: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * プロジェクト構造を分析
   */
  public async analyzeProjectStructure(projectPath?: string): Promise<any> {
    if (!this.isAvailable()) {
      const initSuccess = await this.initialize();
      if (!initSuccess) {
        throw new Error('IntelligentFileSystem is required but not available');
      }
    }

    try {
      return await this.intelligentFS.analyzeProjectStructure(projectPath || process.cwd());
    } catch (error) {
      console.debug('Project structure analysis failed:', error);
      throw error;
    }
  }

  /**
   * 依存関係グラフを取得
   */
  public async getDependencyGraph(): Promise<any> {
    if (!this.isAvailable()) {
      const initSuccess = await this.initialize();
      if (!initSuccess) {
        throw new Error('IntelligentFileSystem is required but not available');
      }
    }

    try {
      return await this.intelligentFS.getDependencyGraph();
    } catch (error) {
      console.debug('Dependency graph analysis failed:', error);
      throw error;
    }
  }

  /**
   * シンボル検索を実行
   */
  public async searchSymbols(query: string = '', options?: any): Promise<any[]> {
    if (!this.isAvailable()) {
      const initSuccess = await this.initialize();
      if (!initSuccess) {
        throw new Error('IntelligentFileSystem is required but not available');
      }
    }

    try {
      return await this.intelligentFS.searchSymbols(query);
    } catch (error) {
      console.error('Symbol search failed:', error);
      throw error;
    }
  }
}

/**
 * グローバルインスタンスを取得する便利関数
 */
export const getIntelligentFileService = () => IntelligentFileService.getInstance();
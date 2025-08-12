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
      // 絶対パスでgetOrCreateInstancesをインポート
      const registryModulePath = '/agents/src/functions/intelligent-registry-integration.js';
      const registryModule = await import(registryModulePath);
      
      if (registryModule?.getOrCreateInstances) {
        const { intelligentFS } = await registryModule.getOrCreateInstances();
        this.intelligentFS = intelligentFS;
        this.initialized = true;
        console.log('IntelligentFileService initialized successfully via registry');
        return true;
      }

      throw new Error('IntelligentFileSystem getOrCreateInstances not available');
    } catch (error) {
      console.debug('Failed to initialize IntelligentFileService:', error);
      this.initialized = false;
      return false;
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
      const result = await this.intelligentFS.readFileIntelligent(filePath);
      return result;
    } catch (error) {
      console.debug('IntelligentFileService read failed:', error);
      return {
        success: false,
        error: `IntelligentFileSystem read failed: ${error instanceof Error ? error.message : String(error)}`
      };
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
}

/**
 * グローバルインスタンスを取得する便利関数
 */
export const getIntelligentFileService = () => IntelligentFileService.getInstance();
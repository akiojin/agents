/**
 * Serena MCP統合クライアント
 * プロジェクト固有の記憶と知識を管理
 */
export interface ProjectMemory {
    projectName: string;
    buildCommands: string[];
    testCommands: string[];
    directoryStructure: Record<string, string>;
    namingConventions: Record<string, string>;
    dependencies: string[];
    configFiles: Record<string, any>;
}
export declare class SerenaMCPClient {
    private projectMemories;
    private currentProject;
    /**
     * プロジェクトのアクティベート
     */
    activateProject(projectName: string): Promise<void>;
    /**
     * プロジェクト記憶の書き込み
     */
    writeMemory(key: string, value: any): Promise<void>;
    /**
     * プロジェクト記憶の読み取り
     */
    readMemory(key?: string): ProjectMemory | any;
    /**
     * シンボル検索（コード構造の理解）
     */
    findSymbol(symbolName: string, includeBody?: boolean): Promise<any>;
    /**
     * パターン検索
     */
    searchPattern(pattern: string): Promise<string[]>;
    /**
     * 参照検索
     */
    findReferences(symbolName: string): Promise<any[]>;
    /**
     * 全プロジェクトの記憶を取得
     */
    getAllProjects(): string[];
    /**
     * プロジェクト記憶を削除
     */
    deleteProject(projectName: string): void;
    /**
     * プロジェクト記憶をエクスポート（バックアップ用）
     */
    exportMemories(): Record<string, ProjectMemory>;
    /**
     * プロジェクト記憶をインポート（復元用）
     */
    importMemories(memories: Record<string, ProjectMemory>): void;
}

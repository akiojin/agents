/**
 * ファイルシステムアクセスのセキュリティ設定
 */
export interface SecurityConfig {
    /** アクセス許可パスのリスト */
    allowedPaths: string[];
    /** カレントディレクトリ変更許可 */
    allowCurrentDirectoryChange: boolean;
    /** 開始ディレクトリ配下に制限 */
    restrictToStartupDirectory: boolean;
}
/**
 * ファイルシステムセキュリティ管理クラス
 */
export declare class FileSystemSecurity {
    private config;
    private startupDirectory;
    private currentDirectory;
    private allowedPaths;
    constructor(config: SecurityConfig);
    /**
     * パスを正規化（絶対パス化、シンボリックリンク解決）
     */
    private normalizePath;
    /**
     * パスがアクセス許可範囲内かチェック
     */
    validatePath(path: string): {
        allowed: boolean;
        reason?: string;
        normalizedPath: string;
    };
    /**
     * カレントディレクトリを変更
     */
    changeDirectory(path: string): {
        success: boolean;
        newDirectory?: string;
        error?: string;
    };
    /**
     * 現在のディレクトリを取得
     */
    getCurrentDirectory(): string;
    /**
     * 開始ディレクトリを取得
     */
    getStartupDirectory(): string;
    /**
     * 許可パス一覧を取得
     */
    getAllowedPaths(): string[];
    /**
     * セキュリティ設定を更新
     */
    updateConfig(newConfig: Partial<SecurityConfig>): void;
    /**
     * セキュリティ情報を取得
     */
    getSecurityInfo(): {
        startupDirectory: string;
        currentDirectory: string;
        allowedPaths: string[];
        allowCurrentDirectoryChange: boolean;
        restrictToStartupDirectory: boolean;
    };
}

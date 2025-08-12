import { SecurityConfig } from './security.js';
/**
 * ファイル情報
 */
export interface FileInfo {
    name: string;
    path: string;
    size: number;
    isFile: boolean;
    isDirectory: boolean;
    isSymbolicLink: boolean;
    createdAt: Date;
    modifiedAt: Date;
    permissions: string;
}
/**
 * ディレクトリエントリ
 */
export interface DirectoryEntry {
    name: string;
    type: 'file' | 'directory' | 'symlink' | 'other';
    size?: number;
}
/**
 * ファイルシステム操作の結果
 */
export interface FileSystemResult<T = any> {
    success: boolean;
    data?: T;
    error?: string;
}
/**
 * 内部ファイルシステム関数クラス
 */
export declare class InternalFileSystem {
    private security;
    constructor(securityConfig: SecurityConfig);
    /**
     * ファイルを読み取り
     */
    readFile(path: string, encoding?: BufferEncoding): Promise<FileSystemResult<string>>;
    /**
     * ファイルに書き込み
     */
    writeFile(path: string, content: string, encoding?: BufferEncoding): Promise<FileSystemResult<void>>;
    /**
     * ディレクトリ一覧を取得
     */
    listDirectory(path: string, includeDetails?: boolean): Promise<FileSystemResult<DirectoryEntry[]>>;
    /**
     * ディレクトリを作成
     */
    createDirectory(path: string, recursive?: boolean): Promise<FileSystemResult<void>>;
    /**
     * ファイルを削除
     */
    deleteFile(path: string): Promise<FileSystemResult<void>>;
    /**
     * ディレクトリを削除
     */
    deleteDirectory(path: string, recursive?: boolean): Promise<FileSystemResult<void>>;
    /**
     * ファイル/ディレクトリ情報を取得
     */
    getFileInfo(path: string): Promise<FileSystemResult<FileInfo>>;
    /**
     * カレントディレクトリを変更
     */
    changeDirectory(path: string): Promise<FileSystemResult<string>>;
    /**
     * 現在のディレクトリを取得
     */
    getCurrentDirectory(): string;
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
    /**
     * セキュリティ設定を更新
     */
    updateSecurityConfig(config: Partial<SecurityConfig>): void;
}

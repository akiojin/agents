import { FileSystemSecurity } from './security.js';
/**
 * Bash実行のセキュリティ設定
 */
export interface BashSecurityConfig {
    /** コマンド実行を許可するか */
    enabled: boolean;
    /** 許可されたコマンドのリスト（空の場合は全て許可） */
    allowedCommands: string[];
    /** 禁止されたコマンドのリスト */
    blockedCommands: string[];
    /** 実行時間制限（ミリ秒） */
    timeout: number;
    /** 作業ディレクトリの制限を有効にするか */
    restrictWorkingDirectory: boolean;
    /** 環境変数の制限 */
    allowedEnvVars: string[];
    /** シェルの制限 */
    allowedShells: string[];
}
/**
 * コマンド実行結果
 */
export interface BashExecutionResult {
    success: boolean;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    error?: string;
    duration: number;
}
/**
 * 内部Bash実行クラス
 */
export declare class InternalBash {
    private security;
    private config;
    constructor(fileSystemSecurity: FileSystemSecurity, config: BashSecurityConfig);
    /**
     * コマンドが実行許可されているかチェック
     */
    private validateCommand;
    /**
     * コマンド文字列からベースコマンドを抽出
     */
    private extractBaseCommand;
    /**
     * 作業ディレクトリを検証
     */
    private validateWorkingDirectory;
    /**
     * 環境変数をフィルタリング
     */
    private filterEnvironmentVariables;
    /**
     * コマンドを実行（非同期、出力をストリーミング）
     */
    executeCommand(command: string, options?: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
        shell?: string;
    }): Promise<BashExecutionResult>;
    /**
     * コマンドを実行（同期的、対話式）
     */
    executeCommandInteractive(command: string, options?: {
        cwd?: string;
        env?: Record<string, string>;
        timeout?: number;
    }): Promise<BashExecutionResult>;
    /**
     * 現在の作業ディレクトリを取得
     */
    getCurrentDirectory(): string;
    /**
     * セキュリティ設定を更新
     */
    updateConfig(newConfig: Partial<BashSecurityConfig>): void;
    /**
     * セキュリティ情報を取得
     */
    getSecurityInfo(): {
        enabled: boolean;
        allowedCommands: string[];
        blockedCommands: string[];
        timeout: number;
        restrictWorkingDirectory: boolean;
        allowedShells: string[];
        currentDirectory: string;
    };
}

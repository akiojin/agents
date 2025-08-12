import { resolve, relative, isAbsolute, join } from 'path';
import { existsSync, lstatSync } from 'fs';
import { logger } from '../utils/logger.js';
/**
 * ファイルシステムセキュリティ管理クラス
 */
export class FileSystemSecurity {
    config;
    startupDirectory;
    currentDirectory;
    allowedPaths;
    constructor(config) {
        this.config = config;
        this.startupDirectory = process.cwd();
        this.currentDirectory = this.startupDirectory;
        // 許可パスを正規化してSetに格納
        this.allowedPaths = new Set(config.allowedPaths.map(path => this.normalizePath(path)));
        // 開始ディレクトリ配下に制限する場合は開始ディレクトリを許可パスに追加
        if (config.restrictToStartupDirectory) {
            this.allowedPaths.add(this.startupDirectory);
        }
        logger.debug('FileSystemSecurity initialized', {
            startupDirectory: this.startupDirectory,
            allowedPaths: Array.from(this.allowedPaths),
            restrictToStartup: config.restrictToStartupDirectory
        });
    }
    /**
     * パスを正規化（絶対パス化、シンボリックリンク解決）
     */
    normalizePath(path) {
        try {
            // 相対パスの場合は現在のディレクトリを基準に絶対パス化
            const absolutePath = isAbsolute(path) ? path : join(this.currentDirectory, path);
            // パスを正規化
            const normalizedPath = resolve(absolutePath);
            // シンボリックリンクがある場合は実際のパスを解決
            if (existsSync(normalizedPath)) {
                const stats = lstatSync(normalizedPath);
                if (stats.isSymbolicLink()) {
                    return resolve(normalizedPath);
                }
            }
            return normalizedPath;
        }
        catch (error) {
            logger.warn(`Path normalization failed for: ${path}`, error);
            return resolve(path);
        }
    }
    /**
     * パスがアクセス許可範囲内かチェック
     */
    validatePath(path) {
        try {
            const normalizedPath = this.normalizePath(path);
            // 開始ディレクトリ配下制限チェック
            if (this.config.restrictToStartupDirectory) {
                const relativePath = relative(this.startupDirectory, normalizedPath);
                if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
                    return {
                        allowed: false,
                        reason: `Path '${path}' is outside startup directory '${this.startupDirectory}'`,
                        normalizedPath
                    };
                }
            }
            // 許可パスチェック
            for (const allowedPath of this.allowedPaths) {
                const relativePath = relative(allowedPath, normalizedPath);
                if (!relativePath.startsWith('..') && !isAbsolute(relativePath)) {
                    return { allowed: true, normalizedPath };
                }
            }
            return {
                allowed: false,
                reason: `Path '${path}' is not within allowed paths: ${Array.from(this.allowedPaths).join(', ')}`,
                normalizedPath
            };
        }
        catch (error) {
            return {
                allowed: false,
                reason: `Path validation error: ${error instanceof Error ? error.message : String(error)}`,
                normalizedPath: path
            };
        }
    }
    /**
     * カレントディレクトリを変更
     */
    changeDirectory(path) {
        if (!this.config.allowCurrentDirectoryChange) {
            return {
                success: false,
                error: 'Current directory change is not allowed by security configuration'
            };
        }
        const validation = this.validatePath(path);
        if (!validation.allowed) {
            return {
                success: false,
                error: validation.reason
            };
        }
        try {
            // ディレクトリの存在確認
            if (!existsSync(validation.normalizedPath)) {
                return {
                    success: false,
                    error: `Directory does not exist: ${validation.normalizedPath}`
                };
            }
            const stats = lstatSync(validation.normalizedPath);
            if (!stats.isDirectory()) {
                return {
                    success: false,
                    error: `Path is not a directory: ${validation.normalizedPath}`
                };
            }
            // カレントディレクトリを更新
            this.currentDirectory = validation.normalizedPath;
            process.chdir(validation.normalizedPath);
            logger.debug(`Current directory changed to: ${this.currentDirectory}`);
            return {
                success: true,
                newDirectory: this.currentDirectory
            };
        }
        catch (error) {
            return {
                success: false,
                error: `Failed to change directory: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    /**
     * 現在のディレクトリを取得
     */
    getCurrentDirectory() {
        return this.currentDirectory;
    }
    /**
     * 開始ディレクトリを取得
     */
    getStartupDirectory() {
        return this.startupDirectory;
    }
    /**
     * 許可パス一覧を取得
     */
    getAllowedPaths() {
        return Array.from(this.allowedPaths);
    }
    /**
     * セキュリティ設定を更新
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (newConfig.allowedPaths) {
            this.allowedPaths = new Set(newConfig.allowedPaths.map(path => this.normalizePath(path)));
        }
        logger.debug('Security configuration updated', this.config);
    }
    /**
     * セキュリティ情報を取得
     */
    getSecurityInfo() {
        return {
            startupDirectory: this.startupDirectory,
            currentDirectory: this.currentDirectory,
            allowedPaths: Array.from(this.allowedPaths),
            allowCurrentDirectoryChange: this.config.allowCurrentDirectoryChange,
            restrictToStartupDirectory: this.config.restrictToStartupDirectory
        };
    }
}
//# sourceMappingURL=security.js.map
import { readFile as fsReadFile, writeFile as fsWriteFile, readdir, mkdir, rmdir, unlink, stat, lstat, Stats } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname, basename } from 'path';
import { FileSystemSecurity, SecurityConfig } from './security.js';
import { logger } from '../utils/logger.js';

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
export class InternalFileSystem {
  private security: FileSystemSecurity;

  constructor(securityConfig: SecurityConfig) {
    this.security = new FileSystemSecurity(securityConfig);
    logger.debug('InternalFileSystem initialized');
  }

  /**
   * ファイルを読み取り
   */
  async readFile(path: string, encoding: BufferEncoding = 'utf-8'): Promise<FileSystemResult<string>> {
    try {
      const validation = this.security.validatePath(path);
      if (!validation.allowed) {
        return {
          success: false,
          error: validation.reason
        };
      }

      if (!existsSync(validation.normalizedPath)) {
        return {
          success: false,
          error: `File does not exist: ${validation.normalizedPath}`
        };
      }

      const stats = await lstat(validation.normalizedPath);
      if (!stats.isFile()) {
        return {
          success: false,
          error: `Path is not a file: ${validation.normalizedPath}`
        };
      }

      const content = await fsReadFile(validation.normalizedPath, encoding);
      logger.debug(`File read successfully: ${validation.normalizedPath}`);

      return {
        success: true,
        data: content
      };

    } catch (error) {
      const errorMessage = `Failed to read file '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * ファイルに書き込み
   */
  async writeFile(path: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<FileSystemResult<void>> {
    try {
      const validation = this.security.validatePath(path);
      if (!validation.allowed) {
        return {
          success: false,
          error: validation.reason
        };
      }

      // ディレクトリが存在しない場合は作成
      const dir = dirname(validation.normalizedPath);
      const dirValidation = this.security.validatePath(dir);
      if (!dirValidation.allowed) {
        return {
          success: false,
          error: `Parent directory not allowed: ${dirValidation.reason}`
        };
      }

      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }

      await fsWriteFile(validation.normalizedPath, content, encoding);
      logger.debug(`File written successfully: ${validation.normalizedPath}`);

      return {
        success: true
      };

    } catch (error) {
      const errorMessage = `Failed to write file '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * ディレクトリ一覧を取得
   */
  async listDirectory(path: string, includeDetails: boolean = false): Promise<FileSystemResult<DirectoryEntry[]>> {
    try {
      const validation = this.security.validatePath(path);
      if (!validation.allowed) {
        return {
          success: false,
          error: validation.reason
        };
      }

      if (!existsSync(validation.normalizedPath)) {
        return {
          success: false,
          error: `Directory does not exist: ${validation.normalizedPath}`
        };
      }

      const stats = await lstat(validation.normalizedPath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Path is not a directory: ${validation.normalizedPath}`
        };
      }

      const entries = await readdir(validation.normalizedPath);
      const result: DirectoryEntry[] = [];

      for (const entry of entries) {
        const entryPath = join(validation.normalizedPath, entry);
        let entryType: 'file' | 'directory' | 'symlink' | 'other' = 'other';
        let size: number | undefined;

        try {
          const entryStats = await lstat(entryPath);
          if (entryStats.isFile()) {
            entryType = 'file';
            size = includeDetails ? entryStats.size : undefined;
          } else if (entryStats.isDirectory()) {
            entryType = 'directory';
          } else if (entryStats.isSymbolicLink()) {
            entryType = 'symlink';
          }
        } catch (error) {
          logger.warn(`Failed to get stats for ${entryPath}:`, error);
        }

        result.push({
          name: entry,
          type: entryType,
          size
        });
      }

      logger.debug(`Directory listed successfully: ${validation.normalizedPath}, ${result.length} entries`);

      return {
        success: true,
        data: result
      };

    } catch (error) {
      const errorMessage = `Failed to list directory '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * ディレクトリを作成
   */
  async createDirectory(path: string, recursive: boolean = true): Promise<FileSystemResult<void>> {
    try {
      const validation = this.security.validatePath(path);
      if (!validation.allowed) {
        return {
          success: false,
          error: validation.reason
        };
      }

      if (existsSync(validation.normalizedPath)) {
        const stats = await lstat(validation.normalizedPath);
        if (stats.isDirectory()) {
          return {
            success: true // 既に存在する場合は成功とする
          };
        } else {
          return {
            success: false,
            error: `Path exists but is not a directory: ${validation.normalizedPath}`
          };
        }
      }

      await mkdir(validation.normalizedPath, { recursive });
      logger.debug(`Directory created successfully: ${validation.normalizedPath}`);

      return {
        success: true
      };

    } catch (error) {
      const errorMessage = `Failed to create directory '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * ファイルを削除
   */
  async deleteFile(path: string): Promise<FileSystemResult<void>> {
    try {
      const validation = this.security.validatePath(path);
      if (!validation.allowed) {
        return {
          success: false,
          error: validation.reason
        };
      }

      if (!existsSync(validation.normalizedPath)) {
        return {
          success: false,
          error: `File does not exist: ${validation.normalizedPath}`
        };
      }

      const stats = await lstat(validation.normalizedPath);
      if (!stats.isFile()) {
        return {
          success: false,
          error: `Path is not a file: ${validation.normalizedPath}`
        };
      }

      await unlink(validation.normalizedPath);
      logger.debug(`File deleted successfully: ${validation.normalizedPath}`);

      return {
        success: true
      };

    } catch (error) {
      const errorMessage = `Failed to delete file '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * ディレクトリを削除
   */
  async deleteDirectory(path: string, recursive: boolean = false): Promise<FileSystemResult<void>> {
    try {
      const validation = this.security.validatePath(path);
      if (!validation.allowed) {
        return {
          success: false,
          error: validation.reason
        };
      }

      if (!existsSync(validation.normalizedPath)) {
        return {
          success: false,
          error: `Directory does not exist: ${validation.normalizedPath}`
        };
      }

      const stats = await lstat(validation.normalizedPath);
      if (!stats.isDirectory()) {
        return {
          success: false,
          error: `Path is not a directory: ${validation.normalizedPath}`
        };
      }

      await rmdir(validation.normalizedPath, { recursive });
      logger.debug(`Directory deleted successfully: ${validation.normalizedPath}`);

      return {
        success: true
      };

    } catch (error) {
      const errorMessage = `Failed to delete directory '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * ファイル/ディレクトリ情報を取得
   */
  async getFileInfo(path: string): Promise<FileSystemResult<FileInfo>> {
    try {
      const validation = this.security.validatePath(path);
      if (!validation.allowed) {
        return {
          success: false,
          error: validation.reason
        };
      }

      if (!existsSync(validation.normalizedPath)) {
        return {
          success: false,
          error: `Path does not exist: ${validation.normalizedPath}`
        };
      }

      const stats = await lstat(validation.normalizedPath);
      
      const fileInfo: FileInfo = {
        name: basename(validation.normalizedPath),
        path: validation.normalizedPath,
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        isSymbolicLink: stats.isSymbolicLink(),
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        permissions: stats.mode.toString(8).slice(-3) // 8進数の下3桁
      };

      logger.debug(`File info retrieved successfully: ${validation.normalizedPath}`);

      return {
        success: true,
        data: fileInfo
      };

    } catch (error) {
      const errorMessage = `Failed to get file info '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * カレントディレクトリを変更
   */
  async changeDirectory(path: string): Promise<FileSystemResult<string>> {
    try {
      const result = this.security.changeDirectory(path);
      
      if (result.success) {
        logger.debug(`Current directory changed to: ${result.newDirectory}`);
        return {
          success: true,
          data: result.newDirectory!
        };
      } else {
        return {
          success: false,
          error: result.error
        };
      }

    } catch (error) {
      const errorMessage = `Failed to change directory to '${path}': ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 現在のディレクトリを取得
   */
  getCurrentDirectory(): string {
    return this.security.getCurrentDirectory();
  }

  /**
   * セキュリティ情報を取得
   */
  getSecurityInfo() {
    return this.security.getSecurityInfo();
  }

  /**
   * セキュリティ設定を更新
   */
  updateSecurityConfig(config: Partial<SecurityConfig>): void {
    this.security.updateConfig(config);
  }
}
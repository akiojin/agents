import { InternalFileSystem } from './filesystem.js';
import { InternalBash, BashSecurityConfig } from './bash.js';
import { SecurityConfig, FileSystemSecurity } from './security.js';
import { logger } from '../utils/logger.js';
import type { FunctionDefinition } from '../mcp/function-converter.js';

/**
 * 内部関数の情報
 */
export interface InternalFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
    }>;
    required?: string[];
  };
  handler: (params: Record<string, any>) => Promise<any>;
}

/**
 * 関数実行結果
 */
export interface FunctionExecutionResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * 内部関数登録システム
 */
export class InternalFunctionRegistry {
  private functions: Map<string, InternalFunction> = new Map();
  private fileSystem: InternalFileSystem;
  private bash?: InternalBash;

  constructor(securityConfig: SecurityConfig, bashConfig?: BashSecurityConfig) {
    this.fileSystem = new InternalFileSystem(securityConfig);
    
    // Bash機能の初期化
    if (bashConfig && bashConfig.enabled) {
      this.bash = new InternalBash(new FileSystemSecurity(securityConfig), bashConfig);
    }
    
    this.registerDefaultFunctions();
    logger.debug('InternalFunctionRegistry initialized');
  }

  /**
   * デフォルト関数を登録
   */
  private registerDefaultFunctions(): void {
    // ファイル読み取り
    this.registerFunction({
      name: 'read_text_file',
      description: 'ファイルの内容をテキストとして読み取る',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '読み取るファイルのパス'
          },
          encoding: {
            type: 'string',
            description: '文字エンコーディング（デフォルト: utf-8）',
            enum: ['utf-8', 'ascii', 'latin1', 'base64', 'hex']
          }
        },
        required: ['path']
      },
      handler: async (params) => {
        const result = await this.fileSystem.readFile(params.path, params.encoding || 'utf-8');
        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.error);
        }
      }
    });

    // ファイル書き込み
    this.registerFunction({
      name: 'write_file',
      description: 'ファイルに内容を書き込む',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '書き込み先ファイルのパス'
          },
          content: {
            type: 'string',
            description: '書き込む内容'
          },
          encoding: {
            type: 'string',
            description: '文字エンコーディング（デフォルト: utf-8）',
            enum: ['utf-8', 'ascii', 'latin1', 'base64', 'hex']
          }
        },
        required: ['path', 'content']
      },
      handler: async (params) => {
        const result = await this.fileSystem.writeFile(params.path, params.content, params.encoding || 'utf-8');
        if (result.success) {
          return { success: true };
        } else {
          throw new Error(result.error);
        }
      }
    });

    // ディレクトリ一覧取得
    this.registerFunction({
      name: 'list_directory',
      description: 'ディレクトリの内容を一覧表示する',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '一覧表示するディレクトリのパス'
          },
          include_details: {
            type: 'boolean',
            description: 'ファイルサイズなどの詳細情報を含めるか（デフォルト: false）'
          }
        },
        required: ['path']
      },
      handler: async (params) => {
        const result = await this.fileSystem.listDirectory(params.path, params.include_details || false);
        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.error);
        }
      }
    });

    // ディレクトリ作成
    this.registerFunction({
      name: 'create_directory',
      description: 'ディレクトリを作成する',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '作成するディレクトリのパス'
          },
          recursive: {
            type: 'boolean',
            description: '親ディレクトリも含めて再帰的に作成するか（デフォルト: true）'
          }
        },
        required: ['path']
      },
      handler: async (params) => {
        const result = await this.fileSystem.createDirectory(params.path, params.recursive !== false);
        if (result.success) {
          return { success: true };
        } else {
          throw new Error(result.error);
        }
      }
    });

    // ファイル削除
    this.registerFunction({
      name: 'delete_file',
      description: 'ファイルを削除する',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '削除するファイルのパス'
          }
        },
        required: ['path']
      },
      handler: async (params) => {
        const result = await this.fileSystem.deleteFile(params.path);
        if (result.success) {
          return { success: true };
        } else {
          throw new Error(result.error);
        }
      }
    });

    // ディレクトリ削除
    this.registerFunction({
      name: 'delete_directory',
      description: 'ディレクトリを削除する',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '削除するディレクトリのパス'
          },
          recursive: {
            type: 'boolean',
            description: '中身も含めて再帰的に削除するか（デフォルト: false）'
          }
        },
        required: ['path']
      },
      handler: async (params) => {
        const result = await this.fileSystem.deleteDirectory(params.path, params.recursive || false);
        if (result.success) {
          return { success: true };
        } else {
          throw new Error(result.error);
        }
      }
    });

    // ファイル情報取得
    this.registerFunction({
      name: 'get_file_info',
      description: 'ファイルまたはディレクトリの詳細情報を取得する',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '情報を取得するファイル/ディレクトリのパス'
          }
        },
        required: ['path']
      },
      handler: async (params) => {
        const result = await this.fileSystem.getFileInfo(params.path);
        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.error);
        }
      }
    });

    // カレントディレクトリ変更
    this.registerFunction({
      name: 'change_directory',
      description: 'カレントディレクトリを変更する',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: '変更先ディレクトリのパス'
          }
        },
        required: ['path']
      },
      handler: async (params) => {
        const result = await this.fileSystem.changeDirectory(params.path);
        if (result.success) {
          return { 
            success: true,
            current_directory: result.data
          };
        } else {
          throw new Error(result.error);
        }
      }
    });

    // カレントディレクトリ取得
    this.registerFunction({
      name: 'get_current_directory',
      description: '現在のカレントディレクトリを取得する',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        return {
          current_directory: this.fileSystem.getCurrentDirectory()
        };
      }
    });

    // セキュリティ情報取得
    this.registerFunction({
      name: 'get_security_info',
      description: 'ファイルシステムのセキュリティ設定情報を取得する',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        return this.fileSystem.getSecurityInfo();
      }
    });

    // Bashコマンド実行
    this.registerFunction({
      name: 'execute_command',
      description: 'Bashコマンドを実行する（セキュリティ制限あり）',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '実行するコマンド'
          },
          cwd: {
            type: 'string',
            description: '作業ディレクトリ（オプション）'
          },
          timeout: {
            type: 'number',
            description: 'タイムアウト時間（ミリ秒、オプション）'
          },
          shell: {
            type: 'string',
            description: '使用するシェル（オプション）'
          }
        },
        required: ['command']
      },
      handler: async (params) => {
        if (!this.bash) {
          throw new Error('Bash execution is not available');
        }
        
        const result = await this.bash.executeCommand(params.command, {
          cwd: params.cwd,
          timeout: params.timeout,
          shell: params.shell
        });
        
        if (result.success) {
          return {
            success: true,
            stdout: result.stdout,
            stderr: result.stderr,
            exit_code: result.exitCode,
            duration: result.duration
          };
        } else {
          return {
            success: false,
            error: result.error,
            stderr: result.stderr,
            exit_code: result.exitCode,
            duration: result.duration
          };
        }
      }
    });

    // Bash対話式コマンド実行
    this.registerFunction({
      name: 'execute_command_interactive',
      description: 'Bashコマンドを対話式で実行する（リアルタイム出力）',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: '実行するコマンド'
          },
          cwd: {
            type: 'string',
            description: '作業ディレクトリ（オプション）'
          },
          timeout: {
            type: 'number',
            description: 'タイムアウト時間（ミリ秒、オプション）'
          }
        },
        required: ['command']
      },
      handler: async (params) => {
        if (!this.bash) {
          throw new Error('Bash execution is not available');
        }
        
        const result = await this.bash.executeCommandInteractive(params.command, {
          cwd: params.cwd,
          timeout: params.timeout
        });
        
        return {
          success: result.success,
          stdout: result.stdout,
          stderr: result.stderr,
          exit_code: result.exitCode,
          error: result.error,
          duration: result.duration
        };
      }
    });

    // Bashセキュリティ情報取得
    this.registerFunction({
      name: 'get_bash_security_info',
      description: 'Bash実行のセキュリティ設定情報を取得する',
      parameters: {
        type: 'object',
        properties: {},
        required: []
      },
      handler: async () => {
        if (!this.bash) {
          return { enabled: false, reason: 'Bash execution is not available' };
        }
        return this.bash.getSecurityInfo();
      }
    });

    logger.debug(`Registered ${this.functions.size} default internal functions`);
  }

  /**
   * 関数を登録
   */
  registerFunction(func: InternalFunction): void {
    this.functions.set(func.name, func);
    logger.debug(`Internal function registered: ${func.name}`);
  }

  /**
   * 関数の登録を解除
   */
  unregisterFunction(name: string): boolean {
    const deleted = this.functions.delete(name);
    if (deleted) {
      logger.debug(`Internal function unregistered: ${name}`);
    }
    return deleted;
  }

  /**
   * 関数が登録されているかチェック
   */
  hasFunction(name: string): boolean {
    return this.functions.has(name);
  }

  /**
   * 関数を実行
   */
  async executeFunction(name: string, params: Record<string, any>): Promise<FunctionExecutionResult> {
    const func = this.functions.get(name);
    if (!func) {
      return {
        success: false,
        error: `Internal function '${name}' not found`
      };
    }

    try {
      logger.debug(`Executing internal function: ${name}`, params);
      const result = await func.handler(params);
      logger.debug(`Internal function executed successfully: ${name}`);
      
      return {
        success: true,
        result
      };
    } catch (error) {
      const errorMessage = `Internal function '${name}' failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.error(errorMessage);
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * 登録されている関数の一覧を取得
   */
  listFunctions(): string[] {
    return Array.from(this.functions.keys());
  }

  /**
   * 関数定義を取得
   */
  getFunctionDefinition(name: string): InternalFunction | undefined {
    return this.functions.get(name);
  }

  /**
   * すべての関数定義を取得
   */
  getAllFunctionDefinitions(): InternalFunction[] {
    return Array.from(this.functions.values());
  }

  /**
   * OpenAI Function Calling形式の定義を取得
   */
  getFunctionCallDefinitions(): FunctionDefinition[] {
    return this.getAllFunctionDefinitions().map(func => ({
      name: func.name,
      description: func.description,
      parameters: func.parameters
    }));
  }

  /**
   * セキュリティ設定を更新
   */
  updateSecurityConfig(config: Partial<SecurityConfig>): void {
    this.fileSystem.updateSecurityConfig(config);
    logger.debug('Internal function registry security config updated');
  }
}
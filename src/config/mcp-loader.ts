import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger.js';
import type { MCPJsonConfig, MCPJsonServerEntry, MCPServerConfig } from './types.js';

/**
 * .mcp.json ファイルローダー
 * Claude Code互換の.mcp.jsonファイルを読み込み、MCPServerConfig配列に変換する
 */
export class MCPLoader {
  /**
   * .mcp.jsonファイルを探して読み込む
   * @param projectRoot プロジェクトルートディレクトリ
   * @returns MCPServerConfigの配列
   */
  static async loadMCPConfig(projectRoot: string = process.cwd()): Promise<MCPServerConfig[]> {
    const mcpJsonPath = join(projectRoot, '.mcp.json');
    
    if (!existsSync(mcpJsonPath)) {
      logger.debug(`.mcp.json not found at ${mcpJsonPath}`);
      return [];
    }

    try {
      logger.info(`Loading .mcp.json from ${mcpJsonPath}`);
      const jsonContent = await readFile(mcpJsonPath, 'utf-8');
      const mcpConfig: MCPJsonConfig = JSON.parse(jsonContent);
      
      return this.convertToMCPServerConfigs(mcpConfig);
    } catch (error) {
      logger.error(`Failed to load .mcp.json: ${error}`);
      throw new Error(`Invalid .mcp.json format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * MCPJsonConfigをMCPServerConfig配列に変換
   * @param mcpConfig .mcp.jsonから読み込んだ設定
   * @returns MCPServerConfig配列
   */
  private static convertToMCPServerConfigs(mcpConfig: MCPJsonConfig): MCPServerConfig[] {
    const configs: MCPServerConfig[] = [];

    for (const [serverName, serverEntry] of Object.entries(mcpConfig.mcpServers)) {
      try {
        const config = this.convertServerEntry(serverName, serverEntry);
        if (config) {
          configs.push(config);
        }
      } catch (error) {
        logger.warn(`Skipping server ${serverName}: ${error}`);
      }
    }

    logger.info(`Loaded ${configs.length} MCP servers from .mcp.json`);
    return configs;
  }

  /**
   * 個別のサーバーエントリを変換
   * @param serverName サーバー名
   * @param entry サーバー設定エントリ
   * @returns MCPServerConfig または null（サポートされていない場合）
   */
  private static convertServerEntry(serverName: string, entry: MCPJsonServerEntry): MCPServerConfig | null {
    // 現在はstdio typeのみサポート
    if (entry.type && entry.type !== 'stdio') {
      logger.warn(`Server ${serverName}: type '${entry.type}' is not supported yet. Only 'stdio' is supported.`);
      return null;
    }

    if (!entry.command) {
      throw new Error(`Server ${serverName}: command is required for stdio type`);
    }

    // 環境変数の展開
    const expandedEnv = entry.env ? this.expandEnvironmentVariables(entry.env) : undefined;
    const expandedArgs = entry.args ? entry.args.map(arg => this.expandSpecialVariables(this.expandEnvironmentVariables({ arg }).arg)) : undefined;

    return {
      name: serverName,
      command: entry.command,
      args: expandedArgs,
      env: expandedEnv,
    };
  }

  /**
   * 環境変数の展開処理
   * @param obj 環境変数を含む可能性のあるオブジェクト
   * @returns 環境変数が展開されたオブジェクト
   */
  private static expandEnvironmentVariables(obj: Record<string, string>): Record<string, string> {
    const expanded: Record<string, string> = {};

    for (const [key, value] of Object.entries(obj)) {
      expanded[key] = this.expandString(value);
    }

    return expanded;
  }

  /**
   * 文字列内の環境変数を展開
   * ${VAR_NAME} または ${VAR_NAME:-default} 形式をサポート
   * @param str 展開対象の文字列
   * @returns 環境変数が展開された文字列
   */
  private static expandString(str: string): string {
    return str.replace(/\$\{([^}]+)\}/g, (match, varExpr) => {
      // ${VAR_NAME:-default} 形式の処理
      const [varName, defaultValue] = varExpr.split(':-');
      const envValue = process.env[varName.trim()];
      
      if (envValue !== undefined) {
        return envValue;
      }
      
      if (defaultValue !== undefined) {
        return defaultValue.trim();
      }
      
      // 環境変数が見つからず、デフォルト値もない場合
      logger.warn(`Environment variable ${varName} not found, keeping original: ${match}`);
      return match;
    });
  }

  /**
   * 特別な変数の展開処理
   * $(pwd) などの特殊な変数を処理
   * @param str 展開対象の文字列
   * @returns 特別な変数が展開された文字列
   */
  private static expandSpecialVariables(str: string): string {
    return str.replace(/\$\(pwd\)/g, process.cwd());
  }

  /**
   * .mcp.jsonの存在確認
   * @param projectRoot プロジェクトルートディレクトリ
   * @returns .mcp.jsonファイルが存在するかどうか
   */
  static hasMCPJson(projectRoot: string = process.cwd()): boolean {
    return existsSync(join(projectRoot, '.mcp.json'));
  }

  /**
   * .mcp.jsonの内容を検証
   * @param projectRoot プロジェクトルートディレクトリ
   * @returns 検証結果
   */
  static async validateMCPJson(projectRoot: string = process.cwd()): Promise<{
    valid: boolean;
    errors: string[];
    serverCount: number;
  }> {
    const mcpJsonPath = join(projectRoot, '.mcp.json');
    const errors: string[] = [];
    
    if (!existsSync(mcpJsonPath)) {
      return { valid: false, errors: ['.mcp.json file not found'], serverCount: 0 };
    }

    try {
      const jsonContent = await readFile(mcpJsonPath, 'utf-8');
      const mcpConfig: MCPJsonConfig = JSON.parse(jsonContent);

      if (!mcpConfig.mcpServers || typeof mcpConfig.mcpServers !== 'object') {
        errors.push('mcpServers field is missing or invalid');
        return { valid: false, errors, serverCount: 0 };
      }

      const serverNames = Object.keys(mcpConfig.mcpServers);
      let validServerCount = 0;

      for (const serverName of serverNames) {
        const entry = mcpConfig.mcpServers[serverName];
        
        if (entry.type && !['stdio', 'sse', 'http'].includes(entry.type)) {
          errors.push(`Server ${serverName}: invalid type '${entry.type}'`);
          continue;
        }

        if (!entry.type || entry.type === 'stdio') {
          if (!entry.command) {
            errors.push(`Server ${serverName}: command is required for stdio type`);
            continue;
          }
        }

        validServerCount++;
      }

      return {
        valid: errors.length === 0,
        errors,
        serverCount: validServerCount
      };

    } catch (error) {
      return {
        valid: false,
        errors: [`JSON parsing error: ${error instanceof Error ? error.message : String(error)}`],
        serverCount: 0
      };
    }
  }
}
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
   * .agents/settings.jsonファイルを探して読み込む
   * @param projectRoot プロジェクトルートディレクトリ
   * @returns MCPServerConfigの配列
   */
  static async loadMCPConfig(projectRoot: string = process.cwd()): Promise<MCPServerConfig[]> {
    const settingsJsonPath = join(projectRoot, '.agents', 'settings.json');
    
    if (!existsSync(settingsJsonPath)) {
      logger.debug(`.agents/settings.json not found at ${settingsJsonPath}`);
      return [];
    }

    try {
      logger.info(`Loading MCP settings from ${settingsJsonPath}`);
      const jsonContent = await readFile(settingsJsonPath, 'utf-8');
      const settings = JSON.parse(jsonContent);
      
      // settings.jsonのmcpServersフィールドを確認
      if (!settings.mcpServers || typeof settings.mcpServers !== 'object') {
        logger.debug('No mcpServers configuration found in .agents/settings.json');
        return [];
      }

      return this.convertFromSettingsJson(settings.mcpServers);
    } catch (error) {
      logger.error(`Failed to load .agents/settings.json: ${error}`);
      throw new Error(`Invalid .agents/settings.json format: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * settings.jsonのmcpServers形式をMCPServerConfig配列に変換
   * @param mcpServers settings.jsonから読み込んだMCPサーバー設定
   * @returns MCPServerConfig配列
   */
  static convertFromSettingsJson(mcpServers: Record<string, any>): MCPServerConfig[] {
    const configs: MCPServerConfig[] = [];

    for (const [serverName, serverEntry] of Object.entries(mcpServers)) {
      try {
        const config = this.convertServerEntry(serverName, serverEntry);
        configs.push(config);
        logger.debug(`Successfully converted MCP server: ${serverName}`);
      } catch (error) {
        logger.warn(`Failed to convert MCP server ${serverName}: ${error}`);
      }
    }

    logger.info(`Loaded ${configs.length} MCP servers from .agents/settings.json`);
    return configs;
  }

  /**
   * MCPJsonConfigをMCPServerConfig配列に変換（後方互換性のため残す）
   * @param mcpConfig .mcp.jsonから読み込んだ設定
   * @returns MCPServerConfig配列
   */
  static convertToMCPServerConfigs(mcpConfig: MCPJsonConfig): MCPServerConfig[] {
    const configs: MCPServerConfig[] = [];

    for (const [serverName, serverEntry] of Object.entries(mcpConfig.mcpServers)) {
      try {
        const config = this.convertServerEntry(serverName, serverEntry);
        configs.push(config);
        logger.debug(`Successfully converted MCP server: ${serverName}`);
      } catch (error) {
        logger.warn(`Failed to convert MCP server ${serverName}: ${error}`);
      }
    }

    logger.info(`Loaded ${configs.length} MCP servers from .mcp.json`);
    return configs;
  }

  /**
   * 個別のサーバーエントリをMCPServerConfigに変換
   * @param serverName サーバー名
   * @param serverEntry サーバー設定エントリ
   * @returns MCPServerConfig
   */
  private static convertServerEntry(serverName: string, serverEntry: MCPJsonServerEntry): MCPServerConfig {
    const config: MCPServerConfig = {
      name: serverName,
      command: '',
      args: [],
      env: serverEntry.env || {}
    };

    // 接続タイプに応じた設定
    switch (serverEntry.type) {
      case 'stdio':
        if (!serverEntry.command) {
          throw new Error(`Server ${serverName}: stdio type requires 'command' field`);
        }
        config.command = serverEntry.command;
        config.args = serverEntry.args || [];
        break;

      case 'sse':
        if (!serverEntry.url) {
          throw new Error(`Server ${serverName}: sse type requires 'url' field`);
        }
        config.url = serverEntry.url;
        break;

      case 'http':
        if (!serverEntry.url) {
          throw new Error(`Server ${serverName}: http type requires 'url' field`);
        }
        config.url = serverEntry.url;
        break;

      default:
        // typeが指定されていない場合、commandがあればstdio、urlがあればhttpと推測
        if (serverEntry.command) {
          config.command = serverEntry.command;
          config.args = serverEntry.args || [];
        } else if (serverEntry.url) {
          config.url = serverEntry.url;
        } else {
          throw new Error(`Server ${serverName}: Either 'command' or 'url' must be specified`);
        }
    }

    // プロジェクト固有の設定がある場合は追加
    if (serverEntry.projectPath) {
      config.env.PROJECT_PATH = serverEntry.projectPath;
    }

    logger.debug(`Converted server ${serverName}: type=${serverEntry.type || 'auto'}, command=${config.command || 'N/A'}, url=${config.url || 'N/A'}`);
    return config;
  }

  /**
   * .agents/settings.jsonの存在確認
   * @param projectRoot プロジェクトルートディレクトリ
   * @returns .agents/settings.jsonファイルが存在するかどうか
   */
  static hasSettingsJson(projectRoot: string = process.cwd()): boolean {
    return existsSync(join(projectRoot, '.agents', 'settings.json'));
  }

  /**
   * .mcp.jsonの存在確認（後方互換性のため残す）
   * @param projectRoot プロジェクトルートディレクトリ
   * @returns .mcp.jsonファイルが存在するかどうか
   */
  static hasMCPJson(projectRoot: string = process.cwd()): boolean {
    return existsSync(join(projectRoot, '.mcp.json'));
  }

  /**
   * .agents/settings.jsonの内容を検証
   * @param projectRoot プロジェクトルートディレクトリ
   * @returns 検証結果
   */
  static async validateSettingsJson(projectRoot: string = process.cwd()): Promise<{
    valid: boolean;
    errors: string[];
    serverCount: number;
  }> {
    const settingsJsonPath = join(projectRoot, '.agents', 'settings.json');
    const errors: string[] = [];
    
    if (!existsSync(settingsJsonPath)) {
      return { valid: false, errors: ['.agents/settings.json file not found'], serverCount: 0 };
    }

    try {
      const jsonContent = await readFile(settingsJsonPath, 'utf-8');
      const settings = JSON.parse(jsonContent);

      if (!settings.mcpServers || typeof settings.mcpServers !== 'object') {
        // mcpServersフィールドが無い場合はエラーとせず、0サーバーとして扱う
        return { valid: true, errors: [], serverCount: 0 };
      }

      const serverNames = Object.keys(settings.mcpServers);
      let validServerCount = 0;

      for (const serverName of serverNames) {
        const entry = settings.mcpServers[serverName];
        
        if (entry.type && !['stdio', 'sse', 'http'].includes(entry.type)) {
          errors.push(`Server "${serverName}": Invalid type "${entry.type}"`);
          continue;
        }

        // 必須フィールドの確認
        if (!entry.command && !entry.url) {
          errors.push(`Server "${serverName}": Either 'command' or 'url' must be specified`);
          continue;
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
        errors: [`Failed to parse .agents/settings.json: ${error instanceof Error ? error.message : String(error)}`],
        serverCount: 0
      };
    }
  }

  /**
   * .mcp.jsonの内容を検証（後方互換性のため残す）
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
          errors.push(`Server "${serverName}": Invalid type "${entry.type}"`);
          continue;
        }

        // 必須フィールドの確認
        if (!entry.command && !entry.url) {
          errors.push(`Server "${serverName}": Either 'command' or 'url' must be specified`);
          continue;
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
        errors: [`Failed to parse .mcp.json: ${error instanceof Error ? error.message : String(error)}`],
        serverCount: 0
      };
    }
  }
}
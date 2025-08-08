import { logger } from '../utils/logger.js';
import type { MCPManager } from './manager.js';

/**
 * OpenAI Function Calling形式の関数定義
 */
export interface FunctionDefinition {
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
}

/**
 * MCP ツール情報
 */
interface MCPToolInfo {
  serverName: string;
  name: string;
  description: string;
  inputSchema?: {
    type?: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

/**
 * MCPツールをOpenAI Function Calling形式に変換
 */
export class MCPFunctionConverter {
  private mcpManager: MCPManager;
  private functionDefinitions: Map<string, FunctionDefinition> = new Map();
  private toolMapping: Map<string, string> = new Map(); // function name -> server:tool

  constructor(mcpManager: MCPManager) {
    this.mcpManager = mcpManager;
  }

  /**
   * 全MCPツールをFunction定義に変換
   */
  async convertAllTools(): Promise<FunctionDefinition[]> {
    try {
      logger.info('Converting MCP tools to function definitions...');
      
      // MCPマネージャーから全ツールをサーバー情報付きで取得
      const toolsWithInfo = await this.mcpManager.listToolsWithServerInfo();
      const functions: FunctionDefinition[] = [];

      for (const { serverName, toolName, tool } of toolsWithInfo) {
        try {
          const toolInfo: MCPToolInfo = {
            serverName,
            name: toolName,
            description: tool.description || `Execute ${tool.name}`,
            inputSchema: tool.parameters as any
          };

          const functionDef = this.convertToolToFunction(toolInfo);
          if (functionDef) {
            functions.push(functionDef);
            
            // マッピングを保存（serverName:toolName形式で保存）
            const fullToolName = `${serverName}:${toolName}`;
            this.functionDefinitions.set(functionDef.name, functionDef);
            this.toolMapping.set(functionDef.name, fullToolName);
            
            logger.debug(`Converted tool: ${fullToolName} -> ${functionDef.name}`);
          }
        } catch (error) {
          logger.warn(`Failed to convert tool ${serverName}:${toolName}:`, error);
        }
      }

      logger.info(`Successfully converted ${functions.length} MCP tools to functions`);
      return functions;
    } catch (error) {
      logger.error('Failed to convert MCP tools:', error);
      return [];
    }
  }

  /**
   * 個別のMCPツールをFunction定義に変換
   */
  private convertToolToFunction(tool: MCPToolInfo): FunctionDefinition | null {
    try {
      // Function名を生成（サーバー名_ツール名の形式）
      const functionName = `${tool.serverName}_${tool.name}`;
      
      // パラメータスキーマを変換
      const parameters = this.convertParameterSchema(tool.inputSchema);

      const functionDef: FunctionDefinition = {
        name: functionName,
        description: tool.description,
        parameters
      };

      return functionDef;
    } catch (error) {
      logger.warn(`Failed to convert tool ${tool.serverName}:${tool.name}:`, error);
      return null;
    }
  }

  /**
   * MCPツールのパラメータスキーマをOpenAI形式に変換
   */
  private convertParameterSchema(inputSchema?: MCPToolInfo['inputSchema']): FunctionDefinition['parameters'] {
    const defaultSchema: FunctionDefinition['parameters'] = {
      type: 'object',
      properties: {},
      required: []
    };

    if (!inputSchema || typeof inputSchema !== 'object') {
      return defaultSchema;
    }

    const properties: Record<string, any> = {};
    const required: string[] = [];

    // inputSchemaのpropertiesを変換
    if (inputSchema.properties && typeof inputSchema.properties === 'object') {
      for (const [propName, propSchema] of Object.entries(inputSchema.properties)) {
        if (typeof propSchema === 'object' && propSchema !== null) {
          properties[propName] = {
            type: propSchema.type || 'string',
            description: propSchema.description || `Parameter: ${propName}`
          };

          // enumがある場合は追加
          if (propSchema.enum && Array.isArray(propSchema.enum)) {
            properties[propName].enum = propSchema.enum;
          }
        }
      }
    }

    // required フィールドを処理
    if (inputSchema.required && Array.isArray(inputSchema.required)) {
      required.push(...inputSchema.required);
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined
    };
  }

  /**
   * Function名からMCPツール名を取得
   */
  getMCPToolName(functionName: string): string | undefined {
    return this.toolMapping.get(functionName);
  }

  /**
   * Function定義を取得
   */
  getFunctionDefinition(functionName: string): FunctionDefinition | undefined {
    return this.functionDefinitions.get(functionName);
  }

  /**
   * 全Function定義を取得
   */
  getAllFunctionDefinitions(): FunctionDefinition[] {
    return Array.from(this.functionDefinitions.values());
  }

  /**
   * Function名からMCPツール名を取得
   */
  getMCPToolName(functionName: string): string | undefined {
    return this.toolMapping.get(functionName);
  }

  /**
   * キャッシュクリア
   */
  clearCache(): void {
    this.functionDefinitions.clear();
    this.toolMapping.clear();
    logger.debug('Function converter cache cleared');
  }
}
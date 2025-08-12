import { logger } from '../utils/logger.js';
import { InternalFunctionRegistry } from '../functions/registry.js';
/**
 * MCPツールをOpenAI Function Calling形式に変換
 */
export class MCPFunctionConverter {
    mcpManager;
    functionDefinitions = new Map();
    toolMapping = new Map(); // function name -> server:tool
    internalRegistry;
    internalFunctionPrefix = '';
    constructor(mcpManager, securityConfig, bashConfig) {
        this.mcpManager = mcpManager;
        // 内部関数レジストリを初期化（デフォルトセキュリティ設定を使用）
        const defaultSecurityConfig = securityConfig || {
            allowedPaths: [process.cwd()],
            allowCurrentDirectoryChange: true,
            restrictToStartupDirectory: true
        };
        this.internalRegistry = new InternalFunctionRegistry(defaultSecurityConfig, bashConfig);
        logger.debug('MCPFunctionConverter initialized with internal functions');
    }
    /**
     * 全MCPツールと内部関数をFunction定義に変換
     */
    async convertAllTools() {
        try {
            logger.debug('Converting MCP tools and internal functions to function definitions...');
            const functions = [];
            // 内部関数を最初に追加（優先度が高い）
            const internalFunctions = this.internalRegistry.getFunctionCallDefinitions();
            for (const func of internalFunctions) {
                const prefixedName = `${this.internalFunctionPrefix}${func.name}`;
                const functionDef = {
                    name: prefixedName,
                    description: func.description,
                    parameters: func.parameters
                };
                functions.push(functionDef);
                this.functionDefinitions.set(prefixedName, functionDef);
                this.toolMapping.set(prefixedName, `internal:${func.name}`);
                logger.debug(`Registered internal function: ${func.name} -> ${prefixedName}`);
            }
            // MCPマネージャーから全ツールをサーバー情報付きで取得
            const toolsWithInfo = await this.mcpManager.listToolsWithServerInfo();
            for (const { serverName, toolName, tool } of toolsWithInfo) {
                try {
                    const toolInfo = {
                        serverName,
                        name: toolName,
                        description: tool.description || `Execute ${tool.name}`,
                        inputSchema: tool.parameters
                    };
                    const functionDef = this.convertToolToFunction(toolInfo);
                    if (functionDef) {
                        functions.push(functionDef);
                        // マッピングを保存（serverName:toolName形式で保存）
                        const fullToolName = `${serverName}:${toolName}`;
                        this.functionDefinitions.set(functionDef.name, functionDef);
                        this.toolMapping.set(functionDef.name, fullToolName);
                        // Function定義の詳細をログ出力（デバッグ用）
                        if (functionDef.name.startsWith('serena_')) {
                            logger.debug(`Converted tool: ${fullToolName} -> ${functionDef.name}`, {
                                parameters: functionDef.parameters
                            });
                        }
                        else {
                            logger.debug(`Converted tool: ${fullToolName} -> ${functionDef.name}`);
                        }
                    }
                }
                catch (error) {
                    logger.warn(`Failed to convert tool ${serverName}:${toolName}:`, error);
                }
            }
            logger.debug(`Successfully converted ${internalFunctions.length} internal functions and ${functions.length - internalFunctions.length} MCP tools to functions`);
            return functions;
        }
        catch (error) {
            logger.error('Failed to convert tools:', error);
            return [];
        }
    }
    /**
     * 個別のMCPツールをFunction定義に変換
     */
    convertToolToFunction(tool) {
        try {
            // Function名を生成（サーバー名_ツール名の形式）
            const functionName = `${tool.serverName}_${tool.name}`;
            // パラメータスキーマを変換
            const parameters = this.convertParameterSchema(tool.inputSchema);
            const functionDef = {
                name: functionName,
                description: tool.description,
                parameters
            };
            return functionDef;
        }
        catch (error) {
            logger.warn(`Failed to convert tool ${tool.serverName}:${tool.name}:`, error);
            return null;
        }
    }
    /**
     * MCPツールのパラメータスキーマをOpenAI形式に変換
     */
    convertParameterSchema(inputSchema) {
        const defaultSchema = {
            type: 'object',
            properties: {},
            required: []
        };
        if (!inputSchema || typeof inputSchema !== 'object') {
            return defaultSchema;
        }
        const properties = {};
        const required = [];
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
     * Function名からMCP/内部関数のツール名を取得
     */
    getMCPToolName(functionName) {
        return this.toolMapping.get(functionName);
    }
    /**
     * Function定義を取得
     */
    getFunctionDefinition(functionName) {
        return this.functionDefinitions.get(functionName);
    }
    /**
     * 全Function定義を取得
     */
    getAllFunctionDefinitions() {
        return Array.from(this.functionDefinitions.values());
    }
    /**
     * 関数が内部関数かどうかチェック
     */
    isInternalFunction(functionName) {
        return functionName.startsWith(this.internalFunctionPrefix);
    }
    /**
     * 内部関数名を取得（プレフィックスを除去）
     */
    getInternalFunctionName(functionName) {
        if (!this.isInternalFunction(functionName)) {
            return undefined;
        }
        return functionName.slice(this.internalFunctionPrefix.length);
    }
    /**
     * 内部関数レジストリを取得
     */
    getInternalRegistry() {
        return this.internalRegistry;
    }
    /**
     * セキュリティ設定を更新
     */
    updateSecurityConfig(config) {
        this.internalRegistry.updateSecurityConfig(config);
        logger.debug('Internal function security config updated');
    }
    /**
     * キャッシュクリア
     */
    clearCache() {
        this.functionDefinitions.clear();
        this.toolMapping.clear();
        logger.debug('Function converter cache cleared');
    }
}
//# sourceMappingURL=function-converter.js.map
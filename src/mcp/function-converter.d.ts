import type { MCPManager } from './manager.js';
import { InternalFunctionRegistry } from '../functions/registry.js';
import { SecurityConfig } from '../functions/security.js';
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
 * MCPツールをOpenAI Function Calling形式に変換
 */
export declare class MCPFunctionConverter {
    private mcpManager;
    private functionDefinitions;
    private toolMapping;
    private internalRegistry;
    private internalFunctionPrefix;
    constructor(mcpManager: MCPManager, securityConfig?: SecurityConfig, bashConfig?: any);
    /**
     * 全MCPツールと内部関数をFunction定義に変換
     */
    convertAllTools(): Promise<FunctionDefinition[]>;
    /**
     * 個別のMCPツールをFunction定義に変換
     */
    private convertToolToFunction;
    /**
     * MCPツールのパラメータスキーマをOpenAI形式に変換
     */
    private convertParameterSchema;
    /**
     * Function名からMCP/内部関数のツール名を取得
     */
    getMCPToolName(functionName: string): string | undefined;
    /**
     * Function定義を取得
     */
    getFunctionDefinition(functionName: string): FunctionDefinition | undefined;
    /**
     * 全Function定義を取得
     */
    getAllFunctionDefinitions(): FunctionDefinition[];
    /**
     * 関数が内部関数かどうかチェック
     */
    isInternalFunction(functionName: string): boolean;
    /**
     * 内部関数名を取得（プレフィックスを除去）
     */
    getInternalFunctionName(functionName: string): string | undefined;
    /**
     * 内部関数レジストリを取得
     */
    getInternalRegistry(): InternalFunctionRegistry;
    /**
     * セキュリティ設定を更新
     */
    updateSecurityConfig(config: Partial<SecurityConfig>): void;
    /**
     * キャッシュクリア
     */
    clearCache(): void;
}

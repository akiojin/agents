import { BashSecurityConfig } from './bash.js';
import { SecurityConfig } from './security.js';
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
export declare class InternalFunctionRegistry {
    private functions;
    private fileSystem;
    private bash?;
    constructor(securityConfig: SecurityConfig, bashConfig?: BashSecurityConfig);
    /**
     * デフォルト関数を登録
     */
    private registerDefaultFunctions;
    /**
     * Serenaと同等のコードインテリジェンス機能を登録
     */
    private registerCodeIntelligenceFunctions;
    /**
     * IntelligentFileSystem統合を初期化
     */
    private initializeIntelligentIntegration;
    /**
     * 関数を登録
     */
    registerFunction(func: InternalFunction): void;
    /**
     * 外部から関数を登録（統合用）
     */
    register(func: InternalFunction): void;
    /**
     * 関数を取得
     */
    get(name: string): InternalFunction | undefined;
    /**
     * 関数の登録を解除
     */
    unregisterFunction(name: string): boolean;
    /**
     * 関数の登録を解除（統合用エイリアス）
     */
    unregister(name: string): boolean;
    /**
     * 関数が登録されているかチェック
     */
    hasFunction(name: string): boolean;
    /**
     * 関数を実行
     */
    executeFunction(name: string, params: Record<string, any>): Promise<FunctionExecutionResult>;
    /**
     * 登録されている関数の一覧を取得
     */
    listFunctions(): string[];
    /**
     * 関数定義を取得
     */
    getFunctionDefinition(name: string): InternalFunction | undefined;
    /**
     * すべての関数定義を取得
     */
    getAllFunctionDefinitions(): InternalFunction[];
    /**
     * OpenAI Function Calling形式の定義を取得
     */
    getFunctionCallDefinitions(): FunctionDefinition[];
    /**
     * セキュリティ設定を更新
     */
    updateSecurityConfig(config: Partial<SecurityConfig>): void;
}

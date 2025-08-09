/**
 * 記憶システムAPI
 * open-gemini-cliのツールシステムと統合するためのインターフェース
 */
export interface MemoryEvent {
    type: 'error' | 'success' | 'discovery' | 'user_input' | 'tool_execution';
    content: any;
    context?: any;
    timestamp: Date;
}
export interface MemoryAPIConfig {
    enableAutoMemory?: boolean;
    chromaUrl?: string;
    projectName?: string;
}
export declare class MemoryAPI {
    private memorySystem;
    private serenaClient;
    private config;
    private eventQueue;
    private isProcessing;
    constructor(config?: MemoryAPIConfig);
    /**
     * 初期化
     */
    initialize(): Promise<void>;
    /**
     * イベントの記録
     */
    recordEvent(event: MemoryEvent): Promise<void>;
    /**
     * エラーの記録と解決策の検索
     */
    handleError(error: string, context?: any): Promise<{
        solution?: string;
        confidence?: number;
        memoryId?: string;
    }>;
    /**
     * エラー解決の記録
     */
    recordErrorResolution(error: string, solution: string, context?: any): Promise<string>;
    /**
     * タスク成功の記録
     */
    recordSuccess(task: string, steps: string[], result?: any): Promise<string>;
    /**
     * プロジェクト固有情報の記録
     */
    recordProjectInfo(type: string, value: any): Promise<void>;
    /**
     * コンテキスト認識検索
     */
    search(query: string, includeProjectInfo?: boolean): Promise<any[]>;
    /**
     * 記憶の使用とフィードバック
     */
    useMemory(memoryId: string): Promise<void>;
    provideFeedback(memoryId: string, success: boolean): Promise<void>;
    /**
     * 統計情報の取得
     */
    getStatistics(): Promise<any>;
    /**
     * 重要な記憶の取得
     */
    getImportantMemories(limit?: number): Promise<any[]>;
    /**
     * ツール実行の記録
     */
    recordToolExecution(toolName: string, params: any, result: any, duration: number): Promise<void>;
    /**
     * ユーザー入力の記録
     */
    recordUserInput(input: string, context?: any): Promise<void>;
    /**
     * イベントキューの処理
     */
    private processEventQueue;
    /**
     * イベント処理の自動開始
     */
    private startEventProcessing;
    /**
     * クエリマッチング（簡易版）
     */
    private matchesQuery;
    /**
     * クリーンアップ
     */
    cleanup(): Promise<void>;
}
/**
 * Memory APIのシングルトンインスタンスを取得
 */
export declare function getMemoryAPI(config?: MemoryAPIConfig): MemoryAPI;

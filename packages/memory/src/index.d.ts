/**
 * 記憶システムのメインエントリーポイント
 * シナプスモデルとChromaDBを統合した知的記憶システム
 */
import { Memory } from './chroma/chromaClient.js';
export interface MemorySystemConfig {
    collectionName?: string;
    chromaUrl?: string;
    autoDecay?: boolean;
    decayInterval?: number;
}
export declare class IntegratedMemorySystem {
    private chromaClient;
    private synapticNetwork;
    private config;
    private decayTimer?;
    private memoryIdCounter;
    constructor(config?: MemorySystemConfig);
    /**
     * システムの初期化
     */
    initialize(): Promise<void>;
    /**
     * イベントから記憶すべきか判断
     */
    checkMemoryRelevance(event: any): boolean;
    /**
     * 記憶の保存
     */
    store(content: any, tags?: string[]): Promise<string>;
    /**
     * エラーパターンの記憶
     */
    storeErrorPattern(error: string, solution: string, context: any): Promise<string>;
    /**
     * 成功パターンの記憶
     */
    storeSuccessPattern(task: string, steps: string[], result: any): Promise<string>;
    /**
     * 知的検索（文脈考慮）
     */
    recall(query: string, context?: string[]): Promise<Memory[]>;
    /**
     * エラー解決策の検索
     */
    findErrorSolution(error: string, context?: any): Promise<{
        solution: string;
        confidence: number;
    } | null>;
    /**
     * 記憶の活性化（使用時）
     */
    use(memoryId: string): Promise<void>;
    /**
     * フィードバック（成功/失敗）
     */
    feedback(memoryId: string, success: boolean): Promise<void>;
    /**
     * 人間による評価
     */
    humanRate(memoryId: string, rating: 'useful' | 'neutral' | 'noise'): Promise<void>;
    /**
     * 統計情報の取得
     */
    getStatistics(): Promise<{
        totalMemories: number;
        averageAccessCount: number;
        averageSuccessRate: number;
        mostAccessedMemories: Memory[];
        recentMemories: Memory[];
    }>;
    /**
     * 記憶の重要度ランキング
     */
    getImportantMemories(limit?: number): Promise<Memory[]>;
    /**
     * 自動減衰の開始
     */
    private startAutoDecay;
    /**
     * クリーンアップ
     */
    cleanup(): Promise<void>;
    /**
     * 文字列の類似度計算（簡易版）
     */
    private calculateSimilarity;
}
export { Memory, ChromaMemoryClient } from './chroma/chromaClient.js';
export { SynapticMemoryNetwork, SynapticConnection, MemoryNode } from './synaptic/synapticNetwork.js';

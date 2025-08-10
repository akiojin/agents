/**
 * シナプス結合ネットワーク
 * 人間の脳のシナプス結合を模倣し、記憶間の関連性を管理
 */
import { Memory, ChromaMemoryClient } from '../chroma/chromaClient.js';
export interface SynapticConnection {
    from: string;
    to: string;
    strength: number;
    lastActivated: Date;
    coActivationCount: number;
}
export interface AccessPattern {
    sequence: string[];
    contextHash: string;
    frequency: number;
    lastUsed: Date;
    successRate: number;
}
export interface ContextMemoryMapping {
    contextSignature: string;
    preferredMemories: Map<string, number>;
    temporalPatterns: AccessPattern[];
}
export interface SynapticNetworkConfig {
    ltpThreshold?: number;
    ltdThreshold?: number;
    homeostaticTarget?: number;
    competitiveStrength?: number;
    maxPropagationDepth?: number;
    propagationDecay?: number;
    maxHistorySize?: number;
    patternLearningEnabled?: boolean;
    maxPatternsPerContext?: number;
    memoryMaintenanceInterval?: number;
}
export interface MemoryNode {
    memory: Memory;
    activationLevel: number;
    incomingConnections: SynapticConnection[];
    outgoingConnections: SynapticConnection[];
}
export declare class SynapticMemoryNetwork {
    private nodes;
    private synapses;
    private chromaClient;
    private recentlyActivated;
    private accessHistory;
    private contextMappings;
    private accessPatterns;
    private currentContext;
    private maxHistorySize;
    private readonly HEBBIAN_LEARNING_RATE;
    private readonly DECAY_RATE;
    private readonly ACTIVATION_THRESHOLD;
    private LTP_THRESHOLD;
    private LTD_THRESHOLD;
    private HOMEOSTATIC_TARGET;
    private COMPETITIVE_STRENGTH;
    private MAX_PROPAGATION_DEPTH;
    private PROPAGATION_DECAY;
    constructor(chromaClient: ChromaMemoryClient);
    /**
     * ネットワークの初期化
     */
    initialize(): Promise<void>;
    /**
     * 記憶の活性化（連想記憶の実現）
     */
    activate(memoryId: string, propagate?: boolean, depth?: number, initialActivation?: number): Promise<void>;
    /**
     * 段階的活性化伝播アルゴリズム
     */
    private propagateActivation;
    /**
     * 強化されたヘブ則学習
     */
    private applyHebbianLearning;
    /**
     * シナプス結合の強化（ヘブ則）
     */
    private strengthenConnection;
    /**
     * カスタム学習率でのシナプス結合強化
     */
    private strengthenConnectionWithRate;
    /**
     * 時間経過による減衰（エビングハウス忘却曲線を考慮）
     */
    decay(): Promise<void>;
    /**
     * ノード活性化レベルの段階的減衰
     */
    private decayNodeActivation;
    /**
     * 記憶強度の動的更新
     */
    private updateMemoryStrength;
    /**
     * 定期的な記憶整理（ガベージコレクション相当）
     */
    performMemoryMaintenance(): Promise<void>;
    /**
     * 高度な関連記憶自動取得システム
     */
    getAssociatedMemories(primaryMemoryId: string, options?: {
        maxDepth?: number;
        maxResults?: number;
        includeSemanticSimilarity?: boolean;
        includeTemporalRelations?: boolean;
        minRelevanceScore?: number;
    }): Promise<Memory[]>;
    /**
     * シナプス結合による関連記憶収集
     */
    private collectSynapticAssociations;
    /**
     * セマンティックな関連記憶収集
     */
    private collectSemanticAssociations;
    /**
     * 時系列に基づく関連記憶収集
     */
    private collectTemporalAssociations;
    /**
     * 文脈依存検索（改良版）
     */
    contextualSearch(query: string, context?: string[]): Promise<Memory[]>;
    /**
     * 新しい記憶の追加
     */
    addMemory(memory: Memory): Promise<void>;
    /**
     * 記憶の成功/失敗フィードバック
     */
    updateOutcome(memoryId: string, success: boolean): Promise<void>;
    /**
     * 動的シナプス調整システム（LTP/LTD）
     */
    performSynapticPlasticity(): Promise<void>;
    /**
     * 長期増強（LTP）の適用
     */
    private applyLTP;
    /**
     * 長期抑制（LTD）の適用
     */
    private applyLTD;
    /**
     * ホメオスタシス機能（神経活動の安定化）
     */
    maintainHomeostasis(): Promise<void>;
    /**
     * 競合学習の実装
     */
    performCompetitiveLearning(contextMemories: string[]): Promise<void>;
    /**
     * 勝者記憶の結合強化
     */
    private reinforceWinner;
    /**
     * 敗者記憶の結合抑制
     */
    private suppressLoser;
    /**
     * 文脈依存的結合調整
     */
    adjustContextualConnections(primaryMemoryId: string, contextMemories: string[], successRate: number): Promise<void>;
    /**
     * 結合強度の一括調整
     */
    private adjustConnectionStrengths;
    /**
     * 記憶へのアクセシビリティ（想起しやすさ）を計算
     */
    getAccessibility(memoryId: string): number;
    /**
     * 記憶の重要度を計算
     */
    getImportance(memoryId: string): number;
    /**
     * ヘルパー関数
     */
    private getConnectionId;
    /**
     * 記憶からの検索クエリ抽出
     */
    private extractSearchQuery;
    /**
     * セマンティック類似性スコアの計算
     */
    private calculateSemanticSimilarity;
    /**
     * 日付からの経過日数を計算
     */
    private getDaysSince;
    private updateNodeConnections;
    /**
     * アクセスパターン学習システム
     */
    /**
     * 記憶アクセスの記録
     */
    recordMemoryAccess(memoryId: string, context?: string[]): void;
    /**
     * 現在の文脈を更新
     */
    private updateCurrentContext;
    /**
     * アクセスパターンの学習
     */
    private learnAccessPattern;
    /**
     * 文脈→記憶マッピングの学習
     */
    private learnContextMapping;
    /**
     * 時系列パターンの更新
     */
    private updateTemporalPatterns;
    /**
     * 予測的記憶取得
     */
    predictNextMemories(context?: string[], limit?: number): Promise<Memory[]>;
    /**
     * パターンベースの予測を追加
     */
    private addPatternPredictions;
    /**
     * 文脈ベースの予測を追加
     */
    private addContextPredictions;
    /**
     * シーケンスベースの予測を追加
     */
    private addSequencePredictions;
    /**
     * ヘルパーメソッド
     */
    private hashContext;
    private hashSequence;
    private calculateSequenceSimilarity;
    /**
     * アクセスパターンの成功率を更新
     */
    updatePatternSuccess(sequence: string[], success: boolean): void;
    /**
     * 学習統計の取得
     */
    getLearningStatistics(): {
        totalPatterns: number;
        totalContextMappings: number;
        averagePatternFrequency: number;
        mostFrequentContext: string;
        accessHistorySize: number;
    };
    /**
     * シナプスネットワーク設定のカスタマイズ
     */
    /**
     * ネットワーク設定を更新
     */
    updateConfiguration(config: SynapticNetworkConfig): void;
    /**
     * 現在の設定を取得
     */
    getCurrentConfiguration(): SynapticNetworkConfig;
    /**
     * プリセット設定を適用
     */
    applyPresetConfiguration(preset: 'conservative' | 'balanced' | 'aggressive' | 'experimental'): void;
    /**
     * ネットワークの健康状態を診断
     */
    diagnoseNetworkHealth(): {
        overallHealth: 'excellent' | 'good' | 'moderate' | 'poor';
        issues: string[];
        suggestions: string[];
        metrics: {
            avgConnectionStrength: number;
            connectionDensity: number;
            activationDistribution: {
                low: number;
                medium: number;
                high: number;
            };
            patternUtilization: number;
        };
    };
}

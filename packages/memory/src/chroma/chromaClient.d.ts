/**
 * ChromaDB クライアントラッパー
 * ベクトルDBとしてChromaDBを使用し、記憶の保存と検索を行う
 */
export interface Memory {
    id: string;
    content: any;
    metadata: {
        created_at: Date;
        last_accessed: Date;
        access_count: number;
        success_rate: number;
        memory_strength?: number;
        type?: string;
        human_rating?: 'useful' | 'neutral' | 'noise';
        tags: string[];
        connections?: Array<{
            targetId: string;
            strength: number;
            coActivationCount: number;
        }>;
    };
}
/**
 * シナプス記憶ノード - 生物学的記憶システムの基本単位
 */
export interface SynapticMemoryNode {
    id: string;
    content: string;
    activationLevel: number;
    connections: Array<{
        targetId: string;
        strength: number;
        coActivationCount: number;
        lastCoActivated: Date;
    }>;
    contextSignature: string;
    lastActivated: Date;
    memoryType: 'episodic' | 'semantic' | 'procedural';
}
/**
 * ヘブ則学習パラメータ
 */
export interface HebbianLearningConfig {
    learningRate: number;
    decayRate: number;
    maxPropagationSteps: number;
    activationThreshold: number;
    synapticStrengthThreshold: number;
}
export declare class ChromaMemoryClient {
    private client;
    private collection;
    private collectionName;
    private synapticNodes;
    private hebbianConfig;
    private activationHistory;
    constructor(collectionName?: string);
    /**
     * 初期化：コレクションの作成または取得
     */
    initialize(): Promise<void>;
    /**
     * ヘブ則学習に基づくシナプス結合強化
     * "一緒に発火するニューロンは結びつく"
     */
    private strengthenSynapticConnection;
    /**
     * 活性化伝播メカニズム（最大3段階、減衰率0.7）
     */
    private propagateActivation;
    /**
     * シナプス記憶ノードをChromaDBと同期
     */
    private syncSynapticNodeToChroma;
    /**
     * キーワードから関連シナプス記憶を活性化
     */
    activateSynapticMemories(keyword: string, contextSignature?: string): Promise<SynapticMemoryNode[]>;
    /**
     * 記憶の保存
     */
    store(memory: Memory): Promise<void>;
    /**
     * 記憶の検索（ベクトル類似度ベース）
     */
    search(query: string, limit?: number, filter?: Record<string, any>): Promise<Memory[]>;
    /**
     * 記憶の更新
     */
    update(memory: Memory): Promise<void>;
    /**
     * IDによる記憶の取得
     */
    get(id: string): Promise<Memory | null>;
    /**
     * すべての記憶を取得
     */
    getAll(): Promise<Memory[]>;
}

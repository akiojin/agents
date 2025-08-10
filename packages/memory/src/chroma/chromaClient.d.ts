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
export declare class ChromaMemoryClient {
    private client;
    private collection;
    private collectionName;
    constructor(collectionName?: string);
    /**
     * 初期化：コレクションの作成または取得
     */
    initialize(): Promise<void>;
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

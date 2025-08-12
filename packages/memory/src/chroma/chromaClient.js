/**
 * ChromaDB クライアントラッパー
 * ベクトルDBとしてChromaDBを使用し、記憶の保存と検索を行う
 */
import { ChromaClient } from 'chromadb';
import * as process from 'process';
export class ChromaMemoryClient {
    client;
    collection = null;
    collectionName;
    constructor(collectionName = 'agent_memories') {
        // ChromaDBサーバーへの接続設定
        // Docker環境内かどうかを判定して適切なホストを選択
        let chromaHost = process.env.CHROMA_HOST;
        if (!chromaHost) {
            // ホスト名でDocker環境内かどうかを判定
            const hostname = process.env.HOSTNAME || '';
            const isInDocker = hostname.length === 12 && /^[a-f0-9]{12}$/.test(hostname);
            if (isInDocker) {
                // Docker環境内ではhost.docker.internalを使用
                chromaHost = 'host.docker.internal';
            }
            else {
                // ローカル環境ではlocalhostを使用
                chromaHost = 'localhost';
            }
        }
        const chromaPort = process.env.CHROMA_PORT || '8000';
        this.client = new ChromaClient({
            host: chromaHost,
            port: parseInt(chromaPort),
            ssl: false
        });
        this.collectionName = collectionName;
    }
    /**
     * 初期化：コレクションの作成または取得
     */
    async initialize() {
        const maxRetries = 10;
        const retryDelay = 3000; // 3秒
        for (let i = 0; i < maxRetries; i++) {
            try {
                // 既存のコレクションを取得または新規作成
                this.collection = await this.client.getOrCreateCollection({
                    name: this.collectionName,
                    metadata: {
                        description: 'Agent memory storage with synaptic connections'
                    }
                });
                // ChromaDB collection初期化成功
                return; // 成功したら終了
            }
            catch (error) {
                console.error(`ChromaDB connection attempt ${i + 1}/${maxRetries} failed:`, error);
                if (i === maxRetries - 1) {
                    // 最後の試行で失敗
                    throw new Error('ChromaDB is required but not available. Please ensure ChromaDB server is running.');
                }
                console.log(`Retrying in ${retryDelay / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
            }
        }
    }
    /**
     * 記憶の保存
     */
    async store(memory) {
        if (!this.collection) {
            throw new Error('ChromaDB collection not initialized. Ensure ChromaDB server is running.');
        }
        const document = JSON.stringify(memory.content);
        // ChromaDBが受け付ける形式にメタデータを変換
        const metadata = {
            created_at: memory.metadata.created_at.toISOString(),
            last_accessed: memory.metadata.last_accessed.toISOString(),
            access_count: memory.metadata.access_count,
            success_rate: memory.metadata.success_rate,
            memory_strength: memory.metadata.memory_strength || 0,
            type: memory.metadata.type || 'general',
            human_rating: memory.metadata.human_rating || null,
            tags: JSON.stringify(memory.metadata.tags || []),
            connections: JSON.stringify(memory.metadata.connections || [])
        };
        await this.collection.add({
            ids: [memory.id],
            documents: [document],
            metadatas: [metadata]
        });
    }
    /**
     * 記憶の検索（ベクトル類似度ベース）
     */
    async search(query, limit = 10, filter) {
        if (!this.collection) {
            throw new Error('ChromaDB collection not initialized. Ensure ChromaDB server is running.');
        }
        const results = await this.collection.query({
            queryTexts: [query],
            nResults: limit,
            where: filter
        });
        if (!results.documents || results.documents.length === 0) {
            return [];
        }
        // 結果をMemory形式に変換
        const memories = [];
        const documents = results.documents[0];
        const metadatas = results.metadatas[0];
        const ids = results.ids[0];
        for (let i = 0; i < documents.length; i++) {
            if (documents[i] && metadatas[i] && ids[i]) {
                const metadata = metadatas[i];
                memories.push({
                    id: ids[i],
                    content: JSON.parse(documents[i]),
                    metadata: {
                        created_at: new Date(metadata.created_at),
                        last_accessed: new Date(metadata.last_accessed),
                        access_count: metadata.access_count,
                        success_rate: metadata.success_rate,
                        human_rating: metadata.human_rating,
                        tags: metadata.tags || [],
                        connections: metadata.connections ? JSON.parse(metadata.connections) : []
                    }
                });
            }
        }
        return memories;
    }
    /**
     * 記憶の更新
     */
    async update(memory) {
        if (!this.collection) {
            throw new Error('ChromaDB collection not initialized. Ensure ChromaDB server is running.');
        }
        const document = JSON.stringify(memory.content);
        const metadata = {
            ...memory.metadata,
            created_at: memory.metadata.created_at.toISOString(),
            last_accessed: memory.metadata.last_accessed.toISOString(),
            connections: JSON.stringify(memory.metadata.connections || [])
        };
        await this.collection.update({
            ids: [memory.id],
            documents: [document],
            metadatas: [metadata]
        });
    }
    /**
     * IDによる記憶の取得
     */
    async get(id) {
        if (!this.collection) {
            throw new Error('ChromaDB collection not initialized. Ensure ChromaDB server is running.');
        }
        const result = await this.collection.get({
            ids: [id]
        });
        if (!result.documents || result.documents.length === 0) {
            return null;
        }
        const document = result.documents[0];
        const metadata = result.metadatas[0];
        if (!document || !metadata) {
            return null;
        }
        return {
            id: id,
            content: JSON.parse(document),
            metadata: {
                created_at: new Date(metadata.created_at),
                last_accessed: new Date(metadata.last_accessed),
                access_count: metadata.access_count,
                success_rate: metadata.success_rate,
                human_rating: metadata.human_rating,
                tags: metadata.tags || [],
                connections: metadata.connections ? JSON.parse(metadata.connections) : []
            }
        };
    }
    /**
     * すべての記憶を取得
     */
    async getAll() {
        if (!this.collection) {
            throw new Error('ChromaDB collection not initialized. Ensure ChromaDB server is running.');
        }
        const result = await this.collection.get();
        if (!result.documents || result.documents.length === 0) {
            return [];
        }
        const memories = [];
        for (let i = 0; i < result.documents.length; i++) {
            const document = result.documents[i];
            const metadata = result.metadatas[i];
            const id = result.ids[i];
            if (document && metadata && id) {
                memories.push({
                    id: id,
                    content: JSON.parse(document),
                    metadata: {
                        created_at: new Date(metadata.created_at),
                        last_accessed: new Date(metadata.last_accessed),
                        access_count: metadata.access_count,
                        success_rate: metadata.success_rate,
                        human_rating: metadata.human_rating,
                        tags: metadata.tags || [],
                        connections: metadata.connections ? JSON.parse(metadata.connections) : []
                    }
                });
            }
        }
        return memories;
    }
}
//# sourceMappingURL=chromaClient.js.map
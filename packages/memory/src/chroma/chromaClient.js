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
    // シナプス記憶システム
    synapticNodes = new Map();
    hebbianConfig = {
        learningRate: 0.1,
        decayRate: 0.7,
        maxPropagationSteps: 3,
        activationThreshold: 0.3,
        synapticStrengthThreshold: 0.1
    };
    activationHistory = [];
    constructor(collectionName = 'agent_memories') {
        // ChromaDBサーバーに接続（デフォルトでサーバーモードを使用）
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
        // サーバーモードで接続（pathパラメータは使用しない）
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
                // OpenAI互換APIを使用した埋め込み関数
                const embeddingFunction = {
                    generate: async (texts) => {
                        try {
                            // OpenAI互換APIのエンドポイントから埋め込みを生成
                            const baseUrl = process.env.LOCAL_LLM_BASE_URL || 'http://host.docker.internal:1234';
                            const apiKey = process.env.LOCAL_LLM_API_KEY || 'lm-studio';
                            const response = await fetch(`${baseUrl}/v1/embeddings`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${apiKey}`
                                },
                                body: JSON.stringify({
                                    input: texts,
                                    model: 'nomic-embed-text-v1.5' // 軽量な埋め込みモデル
                                })
                            });
                            if (response.ok) {
                                const data = await response.json();
                                return data.data.map((item) => item.embedding);
                            }
                        }
                        catch (error) {
                            console.warn('Failed to generate embeddings via API, using fallback:', error);
                        }
                        // フォールバック: シンプルなハッシュベースの埋め込み
                        // 完璧ではないが、ランダムよりはマシ
                        return texts.map(text => {
                            const embedding = new Array(384).fill(0);
                            for (let i = 0; i < text.length; i++) {
                                const charCode = text.charCodeAt(i);
                                embedding[i % 384] = (embedding[i % 384] + charCode / 255) / 2;
                            }
                            // 正規化
                            const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
                            return embedding.map(val => val / (norm || 1));
                        });
                    }
                };
                this.collection = await this.client.getOrCreateCollection({
                    name: this.collectionName,
                    metadata: {
                        description: 'Agent memory storage with synaptic connections'
                    },
                    embeddingFunction
                });
                // chromaDB初期化成功のログは削除（必要時のみ表示）
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
     * ヘブ則学習に基づくシナプス結合強化
     * "一緒に発火するニューロンは結びつく"
     */
    strengthenSynapticConnection(nodeA, nodeB) {
        const nodeAData = this.synapticNodes.get(nodeA);
        const nodeBData = this.synapticNodes.get(nodeB);
        if (!nodeAData || !nodeBData)
            return;
        // A→Bの結合を強化
        const connectionAtoB = nodeAData.connections.find(conn => conn.targetId === nodeB);
        if (connectionAtoB) {
            const oldStrength = connectionAtoB.strength;
            connectionAtoB.strength = Math.min(1.0, oldStrength + this.hebbianConfig.learningRate * (1 - oldStrength));
            connectionAtoB.coActivationCount++;
            connectionAtoB.lastCoActivated = new Date();
        }
        else if (nodeAData.connections.length < 20) { // 最大結合数制限
            nodeAData.connections.push({
                targetId: nodeB,
                strength: this.hebbianConfig.learningRate,
                coActivationCount: 1,
                lastCoActivated: new Date()
            });
        }
        // B→Aの結合も強化（双方向）
        const connectionBtoA = nodeBData.connections.find(conn => conn.targetId === nodeA);
        if (connectionBtoA) {
            const oldStrength = connectionBtoA.strength;
            connectionBtoA.strength = Math.min(1.0, oldStrength + this.hebbianConfig.learningRate * (1 - oldStrength));
            connectionBtoA.coActivationCount++;
            connectionBtoA.lastCoActivated = new Date();
        }
        else if (nodeBData.connections.length < 20) {
            nodeBData.connections.push({
                targetId: nodeA,
                strength: this.hebbianConfig.learningRate,
                coActivationCount: 1,
                lastCoActivated: new Date()
            });
        }
    }
    /**
     * 活性化伝播メカニズム（最大3段階、減衰率0.7）
     */
    propagateActivation(initialNodeIds, steps = 3) {
        const activatedNodes = new Map(); // nodeId -> activation level
        const processedNodes = new Set();
        // 初期ノードの活性化
        initialNodeIds.forEach(nodeId => {
            activatedNodes.set(nodeId, 1.0);
        });
        let currentNodes = [...initialNodeIds];
        let currentDecay = 1.0;
        for (let step = 0; step < steps; step++) {
            const nextNodes = [];
            currentDecay *= this.hebbianConfig.decayRate;
            currentNodes.forEach(nodeId => {
                if (processedNodes.has(nodeId))
                    return;
                processedNodes.add(nodeId);
                const node = this.synapticNodes.get(nodeId);
                if (!node)
                    return;
                const currentActivation = activatedNodes.get(nodeId) || 0;
                // 結合先ノードに活性化を伝播
                node.connections.forEach(connection => {
                    if (connection.strength < this.hebbianConfig.synapticStrengthThreshold)
                        return;
                    const propagatedActivation = currentActivation * connection.strength * currentDecay;
                    const existingActivation = activatedNodes.get(connection.targetId) || 0;
                    const newActivation = Math.min(1.0, existingActivation + propagatedActivation);
                    if (newActivation > this.hebbianConfig.activationThreshold) {
                        activatedNodes.set(connection.targetId, newActivation);
                        if (!nextNodes.includes(connection.targetId)) {
                            nextNodes.push(connection.targetId);
                        }
                    }
                });
            });
            currentNodes = nextNodes;
            if (currentNodes.length === 0)
                break; // 伝播終了
        }
        // 活性化されたノードのデータを返す
        const result = [];
        activatedNodes.forEach((activationLevel, nodeId) => {
            const node = this.synapticNodes.get(nodeId);
            if (node && activationLevel > this.hebbianConfig.activationThreshold) {
                const activatedNode = { ...node };
                activatedNode.activationLevel = activationLevel;
                activatedNode.lastActivated = new Date();
                result.push(activatedNode);
            }
        });
        // 活性化履歴を記録
        result.forEach(node => {
            this.activationHistory.push({
                nodeId: node.id,
                timestamp: new Date(),
                strength: node.activationLevel
            });
        });
        // 古い履歴を削除（最新1000件のみ保持）
        if (this.activationHistory.length > 1000) {
            this.activationHistory.splice(0, this.activationHistory.length - 1000);
        }
        return result.sort((a, b) => b.activationLevel - a.activationLevel);
    }
    /**
     * シナプス記憶ノードをChromaDBと同期
     */
    async syncSynapticNodeToChroma(node) {
        if (!this.collection)
            throw new Error('ChromaDB collection not initialized');
        const document = `${node.content} [Type: ${node.memoryType}] [Context: ${node.contextSignature}]`;
        const metadata = {
            memory_type: node.memoryType,
            context_signature: node.contextSignature,
            activation_level: node.activationLevel,
            connection_count: node.connections.length,
            last_activated: node.lastActivated.toISOString(),
            synaptic_strength: node.connections.reduce((sum, conn) => sum + conn.strength, 0)
        };
        try {
            await this.collection.upsert({
                ids: [node.id],
                documents: [document],
                metadatas: [metadata]
            });
        }
        catch (error) {
            console.error('Failed to sync synaptic node to ChromaDB:', error);
            throw error;
        }
    }
    /**
     * キーワードから関連シナプス記憶を活性化
     */
    async activateSynapticMemories(keyword, contextSignature) {
        if (!this.collection)
            throw new Error('ChromaDB collection not initialized');
        try {
            // ChromaDBから関連記憶を検索
            const queryResult = await this.collection.query({
                queryTexts: [keyword],
                nResults: 20,
                where: contextSignature ? { context_signature: contextSignature } : undefined,
                include: ['documents', 'metadatas', 'distances']
            });
            const relatedNodeIds = [];
            if (queryResult.ids && queryResult.ids[0]) {
                // 検索結果からシナプスノードを更新/作成
                queryResult.ids[0].forEach((id, index) => {
                    const document = queryResult.documents?.[0]?.[index];
                    const metadata = queryResult.metadatas?.[0]?.[index];
                    const distance = queryResult.distances?.[0]?.[index];
                    if (!document || !metadata)
                        return;
                    // 距離から活性化レベルを計算（距離が小さいほど高い活性化）
                    const activationLevel = Math.max(0, 1 - (distance || 1));
                    if (activationLevel < this.hebbianConfig.activationThreshold)
                        return;
                    const synapticNode = {
                        id,
                        content: document,
                        activationLevel,
                        connections: this.synapticNodes.get(id)?.connections || [],
                        contextSignature: metadata.context_signature || 'unknown',
                        lastActivated: new Date(),
                        memoryType: metadata.memory_type || 'semantic'
                    };
                    this.synapticNodes.set(id, synapticNode);
                    relatedNodeIds.push(id);
                });
            }
            // 関連ノード間でシナプス結合を強化（ヘブ則学習）
            for (let i = 0; i < relatedNodeIds.length; i++) {
                for (let j = i + 1; j < relatedNodeIds.length; j++) {
                    this.strengthenSynapticConnection(relatedNodeIds[i], relatedNodeIds[j]);
                }
            }
            // 活性化伝播を実行
            const activatedNodes = this.propagateActivation(relatedNodeIds, this.hebbianConfig.maxPropagationSteps);
            // ChromaDBに同期
            for (const node of activatedNodes) {
                await this.syncSynapticNodeToChroma(node);
            }
            return activatedNodes;
        }
        catch (error) {
            console.error('Failed to activate synaptic memories:', error);
            throw error;
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
        // 注意: ChromaDBはnull値を受け付けないため、除外する
        const metadata = {
            created_at: memory.metadata.created_at.toISOString(),
            last_accessed: memory.metadata.last_accessed.toISOString(),
            access_count: memory.metadata.access_count,
            success_rate: memory.metadata.success_rate,
            memory_strength: memory.metadata.memory_strength || 0,
            type: memory.metadata.type || 'general',
            tags: JSON.stringify(memory.metadata.tags || []),
            connections: JSON.stringify(memory.metadata.connections || [])
        };
        // human_ratingがある場合のみ追加
        if (memory.metadata.human_rating) {
            metadata.human_rating = memory.metadata.human_rating;
        }
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
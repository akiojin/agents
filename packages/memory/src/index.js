/**
 * 記憶システムのメインエントリーポイント
 * シナプスモデルとChromaDBを統合した知的記憶システム
 */
import { ChromaMemoryClient } from './chroma/chromaClient.js';
import { SynapticMemoryNetwork } from './synaptic/synapticNetwork.js';
export class IntegratedMemorySystem {
    chromaClient;
    synapticNetwork;
    config;
    decayTimer;
    memoryIdCounter = 0;
    constructor(config = {}) {
        this.config = {
            collectionName: config.collectionName || 'agent_memories',
            chromaUrl: config.chromaUrl || 'http://localhost:8000',
            autoDecay: config.autoDecay !== false,
            decayInterval: config.decayInterval || 3600000 // 1時間ごと
        };
        this.chromaClient = new ChromaMemoryClient(this.config.collectionName);
        this.synapticNetwork = new SynapticMemoryNetwork(this.chromaClient);
    }
    /**
     * システムの初期化
     */
    async initialize() {
        console.log('Initializing memory system...');
        // ChromaDB初期化
        await this.chromaClient.initialize();
        // シナプスネットワーク初期化
        await this.synapticNetwork.initialize();
        // 自動減衰を開始
        if (this.config.autoDecay) {
            this.startAutoDecay();
        }
        console.log('Memory system initialized successfully');
    }
    /**
     * イベントから記憶すべきか判断
     */
    async checkMemoryRelevance(event) {
        // エラーイベント
        if (event.type === 'error' && event.resolved) {
            return true;
        }
        // 成功したタスク
        if (event.type === 'task_completed' && event.iterations > 3) {
            return true;
        }
        // ユーザーからの明示的な記憶要求
        if (event.type === 'explicit_memory') {
            return true;
        }
        // 重要な発見
        if (event.type === 'discovery' && event.importance > 0.7) {
            return true;
        }
        return false;
    }
    /**
     * 記憶の保存
     */
    async store(content, tags = []) {
        const memoryId = `memory_${Date.now()}_${this.memoryIdCounter++}`;
        const memory = {
            id: memoryId,
            content,
            metadata: {
                created_at: new Date(),
                last_accessed: new Date(),
                access_count: 0,
                success_rate: 0.5, // 初期値は中立
                tags,
                connections: []
            }
        };
        await this.synapticNetwork.addMemory(memory);
        console.log(`Stored memory: ${memoryId}`);
        return memoryId;
    }
    /**
     * エラーパターンの記憶
     */
    async storeErrorPattern(error, solution, context) {
        const content = {
            type: 'error_pattern',
            error,
            solution,
            context,
            timestamp: new Date()
        };
        return await this.store(content, ['error', 'solution']);
    }
    /**
     * 成功パターンの記憶
     */
    async storeSuccessPattern(task, steps, result) {
        const content = {
            type: 'success_pattern',
            task,
            steps,
            result,
            timestamp: new Date()
        };
        return await this.store(content, ['success', 'pattern']);
    }
    /**
     * 知的検索（文脈考慮）
     */
    async recall(query, context = []) {
        return await this.synapticNetwork.contextualSearch(query, context);
    }
    /**
     * エラー解決策の検索
     */
    async findErrorSolution(error, context = {}) {
        const contextStrings = [
            context.file || '',
            context.language || '',
            context.framework || ''
        ].filter(s => s);
        const memories = await this.recall(error, contextStrings);
        for (const memory of memories) {
            if (memory.content.type === 'error_pattern') {
                // エラーメッセージの類似度を確認
                const similarity = this.calculateSimilarity(error, memory.content.error);
                if (similarity > 0.7) {
                    return {
                        solution: memory.content.solution,
                        confidence: similarity * memory.metadata.success_rate
                    };
                }
            }
        }
        return null;
    }
    /**
     * 記憶の活性化（使用時）
     */
    async use(memoryId) {
        await this.synapticNetwork.activate(memoryId);
    }
    /**
     * フィードバック（成功/失敗）
     */
    async feedback(memoryId, success) {
        await this.synapticNetwork.updateOutcome(memoryId, success);
    }
    /**
     * 人間による評価
     */
    async humanRate(memoryId, rating) {
        const memory = await this.chromaClient.get(memoryId);
        if (memory) {
            memory.metadata.human_rating = rating;
            await this.chromaClient.update(memory);
        }
    }
    /**
     * 統計情報の取得
     */
    async getStatistics() {
        const allMemories = await this.chromaClient.getAll();
        if (allMemories.length === 0) {
            return {
                totalMemories: 0,
                averageAccessCount: 0,
                averageSuccessRate: 0,
                mostAccessedMemories: [],
                recentMemories: []
            };
        }
        const totalAccess = allMemories.reduce((sum, m) => sum + m.metadata.access_count, 0);
        const totalSuccess = allMemories.reduce((sum, m) => sum + m.metadata.success_rate, 0);
        // アクセス数でソート
        const sortedByAccess = [...allMemories].sort((a, b) => b.metadata.access_count - a.metadata.access_count);
        // 作成日時でソート
        const sortedByDate = [...allMemories].sort((a, b) => b.metadata.created_at.getTime() - a.metadata.created_at.getTime());
        return {
            totalMemories: allMemories.length,
            averageAccessCount: totalAccess / allMemories.length,
            averageSuccessRate: totalSuccess / allMemories.length,
            mostAccessedMemories: sortedByAccess.slice(0, 5),
            recentMemories: sortedByDate.slice(0, 5)
        };
    }
    /**
     * 記憶の重要度ランキング
     */
    async getImportantMemories(limit = 10) {
        const allMemories = await this.chromaClient.getAll();
        const rankedMemories = allMemories.map(memory => ({
            memory,
            importance: this.synapticNetwork.getImportance(memory.id)
        }));
        rankedMemories.sort((a, b) => b.importance - a.importance);
        return rankedMemories.slice(0, limit).map(r => r.memory);
    }
    /**
     * 自動減衰の開始
     */
    startAutoDecay() {
        if (this.decayTimer) {
            clearInterval(this.decayTimer);
        }
        this.decayTimer = setInterval(async () => {
            await this.synapticNetwork.decay();
            console.log('Memory decay applied');
        }, this.config.decayInterval);
    }
    /**
     * クリーンアップ
     */
    async cleanup() {
        if (this.decayTimer) {
            clearInterval(this.decayTimer);
        }
    }
    /**
     * 文字列の類似度計算（簡易版）
     */
    calculateSimilarity(str1, str2) {
        const s1 = str1.toLowerCase();
        const s2 = str2.toLowerCase();
        if (s1 === s2)
            return 1.0;
        // Levenshtein距離の簡易版
        const maxLen = Math.max(s1.length, s2.length);
        if (maxLen === 0)
            return 1.0;
        let matches = 0;
        const minLen = Math.min(s1.length, s2.length);
        for (let i = 0; i < minLen; i++) {
            if (s1[i] === s2[i])
                matches++;
        }
        return matches / maxLen;
    }
}
// エクスポート
export { ChromaMemoryClient } from './chroma/chromaClient.js';
export { SynapticMemoryNetwork } from './synaptic/synapticNetwork.js';
//# sourceMappingURL=index.js.map
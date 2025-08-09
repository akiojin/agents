/**
 * 記憶システムAPI
 * open-gemini-cliのツールシステムと統合するためのインターフェース
 */
import { IntegratedMemorySystem } from '../index.js';
import { SerenaMCPClient } from '../serena/serenaClient.js';
export class MemoryAPI {
    memorySystem;
    serenaClient;
    config;
    eventQueue = [];
    isProcessing = false;
    constructor(config = {}) {
        this.config = {
            enableAutoMemory: config.enableAutoMemory !== false,
            chromaUrl: config.chromaUrl || 'http://localhost:8000',
            projectName: config.projectName || 'default'
        };
        this.memorySystem = new IntegratedMemorySystem({
            chromaUrl: this.config.chromaUrl
        });
        this.serenaClient = new SerenaMCPClient();
    }
    /**
     * 初期化
     */
    async initialize() {
        await this.memorySystem.initialize();
        await this.serenaClient.activateProject(this.config.projectName);
        if (this.config.enableAutoMemory) {
            this.startEventProcessing();
        }
        console.log('Memory API initialized');
    }
    /**
     * イベントの記録
     */
    async recordEvent(event) {
        this.eventQueue.push(event);
        if (!this.isProcessing && this.config.enableAutoMemory) {
            await this.processEventQueue();
        }
    }
    /**
     * エラーの記録と解決策の検索
     */
    async handleError(error, context = {}) {
        // 既知のエラー解決策を検索
        const solution = await this.memorySystem.findErrorSolution(error, context);
        if (solution && solution.confidence > 0.7) {
            console.log(`Found solution with confidence ${solution.confidence}: ${solution.solution}`);
            return solution;
        }
        // 解決策が見つからない場合は記録のみ
        const memoryId = await this.memorySystem.store({
            type: 'unresolved_error',
            error,
            context,
            timestamp: new Date()
        }, ['error', 'unresolved']);
        return { memoryId };
    }
    /**
     * エラー解決の記録
     */
    async recordErrorResolution(error, solution, context = {}) {
        return await this.memorySystem.storeErrorPattern(error, solution, context);
    }
    /**
     * タスク成功の記録
     */
    async recordSuccess(task, steps, result = {}) {
        return await this.memorySystem.storeSuccessPattern(task, steps, result);
    }
    /**
     * プロジェクト固有情報の記録
     */
    async recordProjectInfo(type, value) {
        await this.serenaClient.writeMemory(type, value);
    }
    /**
     * コンテキスト認識検索
     */
    async search(query, includeProjectInfo = true) {
        const results = [];
        // ChromaDBから検索
        const memories = await this.memorySystem.recall(query);
        results.push(...memories);
        // プロジェクト情報も含める
        if (includeProjectInfo) {
            const projectInfo = await this.serenaClient.readMemory();
            if (this.matchesQuery(query, projectInfo)) {
                results.push({
                    type: 'project_info',
                    content: projectInfo
                });
            }
        }
        return results;
    }
    /**
     * 記憶の使用とフィードバック
     */
    async useMemory(memoryId) {
        await this.memorySystem.use(memoryId);
    }
    async provideFeedback(memoryId, success) {
        await this.memorySystem.feedback(memoryId, success);
    }
    /**
     * 統計情報の取得
     */
    async getStatistics() {
        const stats = await this.memorySystem.getStatistics();
        const projects = this.serenaClient.getAllProjects();
        return {
            ...stats,
            activeProject: this.config.projectName,
            totalProjects: projects.length,
            projects
        };
    }
    /**
     * 重要な記憶の取得
     */
    async getImportantMemories(limit = 10) {
        return await this.memorySystem.getImportantMemories(limit);
    }
    /**
     * ツール実行の記録
     */
    async recordToolExecution(toolName, params, result, duration) {
        await this.recordEvent({
            type: 'tool_execution',
            content: {
                toolName,
                params,
                result,
                duration
            },
            timestamp: new Date()
        });
    }
    /**
     * ユーザー入力の記録
     */
    async recordUserInput(input, context = {}) {
        await this.recordEvent({
            type: 'user_input',
            content: {
                input,
                context
            },
            timestamp: new Date()
        });
    }
    /**
     * イベントキューの処理
     */
    async processEventQueue() {
        if (this.isProcessing || this.eventQueue.length === 0) {
            return;
        }
        this.isProcessing = true;
        while (this.eventQueue.length > 0) {
            const event = this.eventQueue.shift();
            // イベントが記憶すべきか判断
            const shouldRemember = await this.memorySystem.checkMemoryRelevance(event);
            if (shouldRemember) {
                await this.memorySystem.store(event.content, [event.type]);
                console.log(`Memorized event: ${event.type}`);
            }
        }
        this.isProcessing = false;
    }
    /**
     * イベント処理の自動開始
     */
    startEventProcessing() {
        setInterval(async () => {
            if (!this.isProcessing && this.eventQueue.length > 0) {
                await this.processEventQueue();
            }
        }, 5000); // 5秒ごとにチェック
    }
    /**
     * クエリマッチング（簡易版）
     */
    matchesQuery(query, data) {
        const queryLower = query.toLowerCase();
        const dataStr = JSON.stringify(data).toLowerCase();
        // 単語分割してすべて含まれているかチェック
        const words = queryLower.split(/\s+/);
        return words.every(word => dataStr.includes(word));
    }
    /**
     * クリーンアップ
     */
    async cleanup() {
        await this.memorySystem.cleanup();
    }
}
// シングルトンインスタンス
let memoryAPIInstance = null;
/**
 * Memory APIのシングルトンインスタンスを取得
 */
export function getMemoryAPI(config) {
    if (!memoryAPIInstance) {
        memoryAPIInstance = new MemoryAPI(config);
    }
    return memoryAPIInstance;
}
//# sourceMappingURL=memoryApi.js.map
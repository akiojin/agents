/**
 * Serena MCP統合クライアント
 * プロジェクト固有の記憶と知識を管理
 */
export class SerenaMCPClient {
    projectMemories = new Map();
    currentProject = null;
    /**
     * プロジェクトのアクティベート
     */
    async activateProject(projectName) {
        this.currentProject = projectName;
        // 既存のプロジェクト記憶を読み込み
        if (!this.projectMemories.has(projectName)) {
            this.projectMemories.set(projectName, {
                projectName,
                buildCommands: [],
                testCommands: [],
                directoryStructure: {},
                namingConventions: {},
                dependencies: [],
                configFiles: {}
            });
        }
        console.log(`Activated project: ${projectName}`);
    }
    /**
     * プロジェクト記憶の書き込み
     */
    async writeMemory(key, value) {
        if (!this.currentProject) {
            throw new Error('No project activated');
        }
        const memory = this.projectMemories.get(this.currentProject);
        switch (key) {
            case 'build_command':
                if (!memory.buildCommands.includes(value)) {
                    memory.buildCommands.push(value);
                }
                break;
            case 'test_command':
                if (!memory.testCommands.includes(value)) {
                    memory.testCommands.push(value);
                }
                break;
            case 'directory':
                memory.directoryStructure[value.path] = value.description;
                break;
            case 'naming':
                memory.namingConventions[value.type] = value.convention;
                break;
            case 'dependency':
                if (!memory.dependencies.includes(value)) {
                    memory.dependencies.push(value);
                }
                break;
            case 'config':
                memory.configFiles[value.file] = value.content;
                break;
            default:
                console.warn(`Unknown memory key: ${key}`);
        }
        console.log(`Stored project memory: ${key} = ${JSON.stringify(value)}`);
    }
    /**
     * プロジェクト記憶の読み取り
     */
    async readMemory(key) {
        if (!this.currentProject) {
            throw new Error('No project activated');
        }
        const memory = this.projectMemories.get(this.currentProject);
        if (!key) {
            return memory;
        }
        switch (key) {
            case 'build_commands':
                return memory.buildCommands;
            case 'test_commands':
                return memory.testCommands;
            case 'directory_structure':
                return memory.directoryStructure;
            case 'naming_conventions':
                return memory.namingConventions;
            case 'dependencies':
                return memory.dependencies;
            case 'config_files':
                return memory.configFiles;
            default:
                return null;
        }
    }
    /**
     * シンボル検索（コード構造の理解）
     */
    async findSymbol(symbolName, includeBody = false) {
        // 実際のserena MCPツールを呼び出す想定
        // ここではインターフェースのみ定義
        console.log(`Finding symbol: ${symbolName}`);
        return {
            name: symbolName,
            type: 'function',
            location: 'src/example.ts:10',
            body: includeBody ? '// symbol body' : undefined
        };
    }
    /**
     * パターン検索
     */
    async searchPattern(pattern) {
        console.log(`Searching pattern: ${pattern}`);
        // 実際のserena MCPツールを呼び出す想定
        return [];
    }
    /**
     * 参照検索
     */
    async findReferences(symbolName) {
        console.log(`Finding references to: ${symbolName}`);
        // 実際のserena MCPツールを呼び出す想定
        return [];
    }
    /**
     * 全プロジェクトの記憶を取得
     */
    getAllProjects() {
        return Array.from(this.projectMemories.keys());
    }
    /**
     * プロジェクト記憶を削除
     */
    deleteProject(projectName) {
        this.projectMemories.delete(projectName);
        if (this.currentProject === projectName) {
            this.currentProject = null;
        }
    }
    /**
     * プロジェクト記憶をエクスポート（バックアップ用）
     */
    exportMemories() {
        const result = {};
        for (const [name, memory] of this.projectMemories) {
            result[name] = memory;
        }
        return result;
    }
    /**
     * プロジェクト記憶をインポート（復元用）
     */
    importMemories(memories) {
        for (const [name, memory] of Object.entries(memories)) {
            this.projectMemories.set(name, memory);
        }
    }
}
//# sourceMappingURL=serenaClient.js.map
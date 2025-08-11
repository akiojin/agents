/**
 * Sub-agent implementation for deep agent architecture
 * Inspired by DeepAgents and Claude Code
 */
import { GeminiAdapterProvider } from '../../src/providers/gemini-adapter';
export interface SubAgentConfig {
    name: string;
    description: string;
    prompt: string;
    tools?: string[];
    provider?: GeminiAdapterProvider;
    model?: string;
}
export interface SubAgentContext {
    files?: Map<string, string>;
    history?: any[];
    parentContext?: any;
}
export interface SubAgentResult {
    success: boolean;
    response: string;
    files?: Map<string, string>;
    metadata?: {
        agentId?: string;
        agentType?: string;
        agentName?: string;
        toolsUsed?: string[];
        duration?: number;
        tokensUsed?: number;
    };
}
export declare class SubAgent {
    private id;
    private type;
    private config;
    private todoTool;
    private availableTools;
    private provider;
    private model?;
    private status;
    private monitor?;
    private currentTaskId?;
    constructor(idOrConfig: string | SubAgentConfig, type?: string, provider?: any);
    private initializeTools;
    /**
     * Execute a task with this sub-agent
     */
    execute(task: string, context?: SubAgentContext): Promise<SubAgentResult>;
    /**
     * Get agent information
     */
    getAgentInfo(): {
        id: string;
        type: string;
        status: 'idle' | 'busy';
    };
    private buildPrompt;
    private processTask;
    private parseToolCalls;
    private executeTool;
    getName(): string;
    getDescription(): string;
    getTools(): string[];
    /**
     * モニターの状態を更新
     */
    private updateMonitorState;
    /**
     * モニターの進捗を更新
     */
    private updateMonitorProgress;
}
/**
 * Manages multiple sub-agents
 */
export declare class SubAgentManager {
    private agents;
    private generalPurposeAgent;
    private provider;
    constructor(provider?: GeminiAdapterProvider);
    /**
     * Register a new sub-agent
     */
    registerSubAgent(config: SubAgentConfig): void;
    /**
     * Get all registered sub-agents
     */
    getAgents(): Map<string, SubAgent>;
    /**
     * Get a specific sub-agent
     */
    getAgent(name: string): SubAgent | undefined;
    /**
     * Remove a sub-agent
     */
    removeAgent(name: string): boolean;
    /**
     * Execute a task with the specified agent
     * @param taskDescription The task to execute
     * @param agentName The name of the agent to use (defaults to 'general-purpose')
     * @returns The execution result
     */
    executeTask(taskDescription: string, agentName?: string): Promise<SubAgentResult>;
    /**
     * Get all agents information
     */
    getAllAgents(): Array<{
        id: string;
        type: string;
        status: 'idle' | 'busy';
    }>;
    /**
     * Get agent status by ID
     */
    getAgentStatus(agentId: string): {
        id: string;
        type: string;
        status: 'idle' | 'busy';
    } | undefined;
    /**
     * Clear all agents except general-purpose
     */
    clearAgents(): void;
}
export declare function getSubAgentToolDefinition(): {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            description: {
                type: string;
                description: string;
            };
            subagent_type: {
                type: string;
                description: string;
                enum: string[];
            };
        };
        required: string[];
    };
};
export declare const subAgentToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            description: {
                type: string;
                description: string;
            };
            subagent_type: {
                type: string;
                description: string;
                enum: string[];
            };
        };
        required: string[];
    };
};
//# sourceMappingURL=sub-agent.d.ts.map
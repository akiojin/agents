/**
 * Deep Agent System Prompt
 * Inspired by DeepAgents and Claude Code
 */
export declare const DEEP_AGENT_SYSTEM_PROMPT: string;
/**
 * Sub-agent specific prompts
 */
export declare const SUB_AGENT_PROMPTS: {
    'general-purpose': string;
    'code-reviewer': string;
    'research-analyst': string;
    'test-runner': string;
};
/**
 * Get the appropriate system prompt for an agent type
 */
export declare function getAgentSystemPrompt(agentType?: string): string;

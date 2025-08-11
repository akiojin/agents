/**
 * Sub-agent implementation for deep agent architecture
 * Inspired by DeepAgents and Claude Code
 */

import { TodoWriteTool } from '../tools/todo-write';
import { GeminiAdapterProvider } from '../../src/providers/gemini-adapter';
import { logger } from '../../src/utils/logger';

export interface SubAgentConfig {
  name: string;
  description: string;
  prompt: string;
  tools?: string[];
  provider?: GeminiAdapterProvider;
  model?: string;  // エージェント固有のモデル指定
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
    toolsUsed?: string[];
    duration?: number;
    tokensUsed?: number;
  };
}

export class SubAgent {
  private id: string;
  private type: string;
  private config: SubAgentConfig;
  private todoTool: TodoWriteTool;
  private availableTools: Map<string, any>;
  private provider: GeminiAdapterProvider | any;
  private model?: string;  // エージェント固有のモデル
  private status: 'idle' | 'busy' = 'idle';

  constructor(idOrConfig: string | SubAgentConfig, type?: string, provider?: any) {
    // Support both old and new constructor signatures for backward compatibility
    if (typeof idOrConfig === 'string') {
      // New test signature: (id, type, provider)
      this.id = idOrConfig;
      this.type = type || 'general-purpose';
      this.provider = provider;
      this.config = {
        name: this.id,
        description: `${this.type} agent`,
        prompt: `You are a ${this.type} agent.`,
        provider: provider
      };
    } else {
      // Original signature: (config)
      this.config = idOrConfig;
      this.id = this.config.name;
      this.type = this.config.name;  // タイプを名前と同じに設定
      
      // モデルが指定されている場合は、専用のプロバイダーを作成
      if (this.config.model) {
        this.provider = new GeminiAdapterProvider(
          process.env.LLM_API_KEY || 'dummy-key',
          this.config.model,  // 指定されたモデルを使用
          process.env.LLM_BASE_URL || 'http://localhost:1234/v1'
        );
      } else {
        this.provider = this.config.provider || new GeminiAdapterProvider(
          process.env.LLM_API_KEY || 'dummy-key',
          process.env.LLM_MODEL || 'local-model',
          process.env.LLM_BASE_URL || 'http://localhost:1234/v1'
        );
      }
    }
    
    this.todoTool = new TodoWriteTool();
    this.availableTools = new Map();
    
    // Initialize default tools
    this.initializeTools();
  }

  private initializeTools(): void {
    // Add TodoWrite tool by default
    this.availableTools.set('write_todos', this.todoTool);
    
    // Add other tools based on config
    if (this.config.tools) {
      // Tool initialization would happen here based on tool names
      // For now, we'll just track which tools are requested
    }
  }

  /**
   * Execute a task with this sub-agent
   */
  async execute(task: string, context: SubAgentContext = {}): Promise<SubAgentResult> {
    const startTime = Date.now();
    this.status = 'busy';
    
    try {
      // Build the prompt with context
      const fullPrompt = this.buildPrompt(task, context);
      
      // Call the LLM with the prompt
      const response = await this.processTask(fullPrompt, context);
      
      return {
        success: true,
        response: response,
        files: context.files,
        metadata: {
          agentId: this.id,
          agentType: this.type,
          agentName: this.config.name,
          duration: Date.now() - startTime,
          toolsUsed: Array.from(this.availableTools.keys()),
        },
      };
    } catch (error) {
      logger.error(`SubAgent ${this.config.name} error:`, error);
      return {
        success: false,
        response: `Error executing sub-agent task: ${error}`,
        metadata: {
          agentId: this.id,
          agentType: this.type,
          agentName: this.config.name,
          duration: Date.now() - startTime,
        },
      };
    } finally {
      this.status = 'idle';
    }
  }

  /**
   * Get agent information
   */
  getAgentInfo(): { id: string; type: string; status: 'idle' | 'busy' } {
    return {
      id: this.id,
      type: this.type,
      status: this.status,
    };
  }

  private buildPrompt(task: string, context: SubAgentContext): string {
    let prompt = this.config.prompt + '\n\n';
    
    // Add context information
    if (context.files && context.files.size > 0) {
      prompt += 'Available files:\n';
      for (const [path, content] of context.files) {
        prompt += `  - ${path}\n`;
        // Optionally include file content if it's small
        if (content.length < 500) {
          prompt += `    Content: ${content.substring(0, 200)}...\n`;
        }
      }
      prompt += '\n';
    }
    
    // Add the task
    prompt += `Task: ${task}\n`;
    
    // Add available tools
    prompt += '\nAvailable tools:\n';
    for (const [name, _] of this.availableTools) {
      prompt += `  - ${name}\n`;
    }
    
    // Add instructions for tool use
    prompt += '\nYou can use tools by calling them in your response. Format tool calls as:\n';
    prompt += 'TOOL_CALL: <tool_name> <parameters>\n';
    prompt += '\nProvide your response after any tool calls.\n';
    
    return prompt;
  }

  private async processTask(prompt: string, context: SubAgentContext): Promise<string> {
    try {
      // Call the LLM
      const llmResponse = await this.provider.chat([
        { role: 'system', content: this.config.prompt },
        { role: 'user', content: prompt }
      ], {
        temperature: 0.7,
        maxTokens: 4000,
      });
      
      // Parse the response for tool calls
      const toolCalls = this.parseToolCalls(llmResponse);
      
      // Execute any tool calls
      let toolResults = '';
      for (const toolCall of toolCalls) {
        const result = await this.executeTool(toolCall.name, toolCall.params);
        toolResults += `Tool ${toolCall.name} result: ${JSON.stringify(result)}\n`;
      }
      
      // If there were tool calls, get a final response from the LLM
      if (toolCalls.length > 0) {
        const finalResponse = await this.provider.chat([
          { role: 'system', content: this.config.prompt },
          { role: 'user', content: prompt },
          { role: 'assistant', content: llmResponse },
          { role: 'user', content: `Tool results:\n${toolResults}\n\nPlease provide your final response based on the tool results.` }
        ], {
          temperature: 0.7,
          maxTokens: 2000,
        });
        
        return finalResponse;
      }
      
      return llmResponse;
    } catch (error) {
      logger.error('Error processing task with LLM:', error);
      throw error;
    }
  }

  private parseToolCalls(response: string): Array<{ name: string; params: any }> {
    const toolCalls: Array<{ name: string; params: any }> = [];
    const lines = response.split('\n');
    
    for (const line of lines) {
      if (line.startsWith('TOOL_CALL:')) {
        const match = line.match(/TOOL_CALL:\s*(\w+)\s*(.*)/);
        if (match) {
          const [, toolName, paramsStr] = match;
          try {
            const params = paramsStr ? JSON.parse(paramsStr) : {};
            toolCalls.push({ name: toolName, params });
          } catch {
            // If JSON parsing fails, treat as string parameter
            toolCalls.push({ name: toolName, params: paramsStr });
          }
        }
      }
    }
    
    return toolCalls;
  }

  private async executeTool(toolName: string, params: any): Promise<any> {
    const tool = this.availableTools.get(toolName);
    
    if (!tool) {
      return { error: `Tool ${toolName} not found` };
    }
    
    if (toolName === 'write_todos' && tool instanceof TodoWriteTool) {
      return await tool.execute(params);
    }
    
    // For other tools, attempt to execute if they have an execute method
    if (typeof tool.execute === 'function') {
      return await tool.execute(params);
    }
    
    return { error: `Tool ${toolName} does not have an execute method` };
  }

  getName(): string {
    return this.config.name;
  }

  getDescription(): string {
    return this.config.description;
  }

  getTools(): string[] {
    return this.config.tools || [];
  }
}

/**
 * Manages multiple sub-agents
 */
export class SubAgentManager {
  private agents: Map<string, SubAgent>;
  private generalPurposeAgent: SubAgent;
  private provider: GeminiAdapterProvider;

  constructor(provider?: GeminiAdapterProvider) {
    this.agents = new Map();
    
    // Initialize provider
    this.provider = provider || new GeminiAdapterProvider(
      process.env.LLM_API_KEY || 'dummy-key',
      process.env.LLM_MODEL || 'local-model',
      process.env.LLM_BASE_URL || 'http://localhost:1234/v1'
    );
    
    // 動的にエージェントプリセットを読み込む
    try {
      const { loadAgentPresets } = require('./src/agent-prompt-loader');
      const presets = loadAgentPresets();
      
      // すべてのプリセットからエージェントを作成
      for (const [name, preset] of presets.entries()) {
        const agent = new SubAgent({
          name: preset.name,
          description: preset.description,
          prompt: preset.systemPrompt,
          provider: this.provider,
          // モデルが指定されている場合は適用
          model: preset.model,
        });
        
        this.agents.set(name, agent);
        
        // general-purposeエージェントを記録
        if (name === 'general-purpose') {
          this.generalPurposeAgent = agent;
        }
      }
    } catch (error) {
      console.debug('AgentPromptLoader not available, using default agent');
    }
    
    // general-purposeエージェントが読み込まれていない場合はデフォルトを作成
    if (!this.generalPurposeAgent) {
      this.generalPurposeAgent = new SubAgent({
        name: 'general-purpose',
        description: 'A general-purpose agent with access to all tools',
        prompt: `You are a general-purpose assistant that can help with various tasks.
You have access to tools that you can use to complete tasks.
Be thorough and systematic in your approach.`,
        provider: this.provider,
      });
      
      this.agents.set('general-purpose', this.generalPurposeAgent);
    }
  }

  /**
   * Register a new sub-agent
   */
  registerSubAgent(config: SubAgentConfig): void {
    // Ensure the sub-agent uses the same provider
    config.provider = config.provider || this.provider;
    const agent = new SubAgent(config);
    this.agents.set(config.name, agent);
  }

  /**
   * Execute a task with a specific sub-agent
   */
  async executeTask(
    agentName: string,
    task: string,
    context: SubAgentContext = {}
  ): Promise<SubAgentResult> {
    const agent = this.agents.get(agentName);
    
    if (!agent) {
      return {
        success: false,
        response: `Sub-agent '${agentName}' not found. Available agents: ${Array.from(this.agents.keys()).join(', ')}`,
      };
    }
    
    return agent.execute(task, context);
  }

  /**
   * Get all registered sub-agents
   */
  getAgents(): Map<string, SubAgent> {
    return new Map(this.agents);
  }

  /**
   * Get a specific sub-agent
   */
  getAgent(name: string): SubAgent | undefined {
    return this.agents.get(name);
  }

  /**
   * Remove a sub-agent
   */
  removeAgent(name: string): boolean {
    if (name === 'general-purpose') {
      return false; // Can't remove the general-purpose agent
    }
    return this.agents.delete(name);
  }

  /**
   * Get all agents information
   */
  getAllAgents(): Array<{ id: string; type: string; status: 'idle' | 'busy' }> {
    const agents: Array<{ id: string; type: string; status: 'idle' | 'busy' }> = [];
    for (const [name, agent] of this.agents) {
      agents.push(agent.getAgentInfo());
    }
    return agents;
  }

  /**
   * Get agent status by ID
   */
  getAgentStatus(agentId: string): { id: string; type: string; status: 'idle' | 'busy' } | undefined {
    for (const [name, agent] of this.agents) {
      const info = agent.getAgentInfo();
      if (info.id === agentId) {
        return info;
      }
    }
    return undefined;
  }

  /**
   * Clear all agents except general-purpose
   */
  clearAgents(): void {
    const generalPurpose = this.agents.get('general-purpose');
    this.agents.clear();
    if (generalPurpose) {
      this.agents.set('general-purpose', generalPurpose);
    }
  }
}

// Tool definition for calling sub-agents
// 動的にサブエージェントツール定義を生成する関数
export function getSubAgentToolDefinition() {
  let agentTypes = ['general-purpose'];
  let agentDescriptions = '- general-purpose: General-purpose agent with access to all tools';
  
  try {
    // AgentPromptLoaderから動的にエージェントタイプを取得
    const { loadAgentPresets } = require('./src/agent-prompt-loader');
    const presets = loadAgentPresets();
    
    if (presets && presets.size > 0) {
      agentTypes = Array.from(presets.keys());
      agentDescriptions = Array.from(presets.values())
        .map(preset => `- ${preset.name}: ${preset.description}`)
        .join('
');
    }
  } catch (error) {
    console.debug('AgentPromptLoader not available, using default agent types');
  }
  
  return {
    name: 'task',
    description: `Launch a sub-agent to handle complex, multi-step tasks autonomously.

Available sub-agent types:
${agentDescriptions}

When to use this tool:
- For complex tasks requiring specialized handling
- To isolate context for specific operations
- When delegating subtasks`,
    parameters: {
      type: 'object',
      properties: {
        description: {
          type: 'string',
          description: 'A detailed description of the task for the sub-agent',
        },
        subagent_type: {
          type: 'string',
          description: 'The type of sub-agent to use',
          enum: agentTypes,
        },
      },
      required: ['description', 'subagent_type'],
    },
  };
}

// デフォルトのエクスポート（後方互換性のため）
export const subAgentToolDefinition = getSubAgentToolDefinition();
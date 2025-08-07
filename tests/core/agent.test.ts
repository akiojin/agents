import { describe, it, expect } from 'vitest';
import { AgentCore } from '../../src/core/agent.js';
import { TaskExecutor } from '../../src/core/task-executor.js';
import { MemoryManager } from '../../src/core/memory.js';
import type { Config } from '../../src/config/types.js';

describe('AgentCore', () => {
  const mockConfig: Config = {
    llm: {
      provider: 'local-lmstudio',
      model: 'test-model',
      apiKey: 'test-key',
      timeout: 30000,
      maxRetries: 3,
      temperature: 0.7,
      maxTokens: 2000,
    },
    mcp: {
      servers: [],
      timeout: 30000,
      enabled: false,
      maxRetries: 3,
    },
    app: {
      logLevel: 'info',
      logDir: './logs',
      maxParallel: 2,
      silent: false,
      timeout: 300000,
    },
    paths: {
      cache: './cache',
      history: './test-history',
      config: '.agents.yaml',
    },
  };

  it('should handle empty input gracefully', async () => {
    const agent = new AgentCore(mockConfig);
    
    // 空文字列のテスト
    try {
      await agent.chat('');
      expect.fail('空の入力でもエラーが発生しませんでした');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('入力が空です');
    }
  });

  it('should handle very long input gracefully', async () => {
    const agent = new AgentCore(mockConfig);
    
    // 非常に長い入力のテスト（32,000文字を超える）
    const longInput = 'a'.repeat(32001);
    
    try {
      await agent.chat(longInput);
      expect.fail('長すぎる入力でもエラーが発生しませんでした');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toContain('入力が長すぎます');
    }
  });

  it('should return current model correctly', () => {
    const agent = new AgentCore(mockConfig);
    expect(agent.getCurrentModel()).toBe('test-model');
  });

  it('should update model correctly', () => {
    const agent = new AgentCore(mockConfig);
    const newModel = 'new-test-model';
    
    agent.setModel(newModel);
    expect(agent.getCurrentModel()).toBe(newModel);
  });

  it('should clear history correctly', () => {
    const agent = new AgentCore(mockConfig);
    
    // 初期状態では履歴は空
    expect(agent.getHistory()).toHaveLength(0);
    
    // 履歴をクリア
    agent.clearHistory();
    expect(agent.getHistory()).toHaveLength(0);
  });

  it('should toggle parallel mode correctly', () => {
    const agent = new AgentCore(mockConfig);
    
    // デフォルトはfalse
    const firstToggle = agent.toggleParallelMode();
    expect(firstToggle).toBe(true);
    
    // もう一度トグルするとfalseに戻る
    const secondToggle = agent.toggleParallelMode();
    expect(secondToggle).toBe(false);
  });

  it('should get default model for different providers', () => {
    const openAIConfig: Config = { 
      ...mockConfig, 
      llm: { ...mockConfig.llm, provider: 'openai' as const, model: undefined as any } 
    };
    const anthropicConfig: Config = { 
      ...mockConfig, 
      llm: { ...mockConfig.llm, provider: 'anthropic' as const, model: undefined as any } 
    };

    const openAIAgent = new AgentCore(openAIConfig);
    const anthropicAgent = new AgentCore(anthropicConfig);

    expect(openAIAgent.getCurrentModel()).toContain('gpt');
    expect(anthropicAgent.getCurrentModel()).toContain('claude');
    
    // 未知のプロバイダーはエラーになるのでテストから除外
  });

  it('should handle task execution with error result', async () => {
    const agent = new AgentCore(mockConfig);
    
    const taskConfig = {
      description: 'テストタスク',
      steps: ['ステップ1'],
      timeout: 1000,
    };

    const result = await agent.executeTask(taskConfig);
    
    // エラー結果でも正しい構造を持つことを確認
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('message');
    expect(typeof result.success).toBe('boolean');
    expect(typeof result.message).toBe('string');
  });

  it('should return empty tools list when MCP not initialized', async () => {
    const agent = new AgentCore(mockConfig);
    
    const tools = await agent.getAvailableMCPTools();
    expect(tools).toEqual([]);
  });

  it('should return null for MCP server status when not initialized', () => {
    const agent = new AgentCore(mockConfig);
    
    const status = agent.getMCPServerStatus();
    expect(status).toBeNull();
  });
});

// 基本的なimportテスト（モックなしで実行可能）
describe('AgentCore Basic Imports', () => {
  it('should import AgentCore modules without errors', () => {
    expect(AgentCore).toBeDefined();
    expect(TaskExecutor).toBeDefined();
    expect(MemoryManager).toBeDefined();
  });
});
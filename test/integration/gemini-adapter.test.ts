import { describe, it, expect, beforeEach } from 'bun:test';
import { GeminiAdapterProvider } from '../../src/providers/gemini-adapter';
import { TodoWriteTool, TodoItem } from '../../packages/tools/todo-write';
import { SubAgentManager } from '../../packages/agents/sub-agent';

describe('GeminiAdapter Integration', () => {
  let provider: GeminiAdapterProvider;
  
  beforeEach(() => {
    // Use test configuration
    provider = new GeminiAdapterProvider(
      process.env.TEST_API_KEY || 'test-key',
      process.env.TEST_MODEL || 'test-model',
      process.env.TEST_BASE_URL || 'http://localhost:1234/v1'
    );
  });

  describe('Provider Tests', () => {
    it('should check availability', async () => {
      // This will fail if no local server is running, which is expected in tests
      const isAvailable = await provider.isAvailable();
      expect(typeof isAvailable).toBe('boolean');
    });

    it('should have correct name', () => {
      expect(provider.getName()).toBe('gemini-adapter');
    });
  });

  describe('TodoWrite Tool Tests', () => {
    let todoTool: TodoWriteTool;
    
    beforeEach(() => {
      todoTool = new TodoWriteTool();
    });

    it('should create and update todos', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'First task', status: 'pending' },
        { id: '2', content: 'Second task', status: 'in_progress' },
      ];

      const result = await todoTool.execute({ todos });
      
      expect(result.success).toBe(true);
      expect(result.todos).toHaveLength(2);
      expect(result.summary?.total).toBe(2);
      expect(result.summary?.pending).toBe(1);
      expect(result.summary?.in_progress).toBe(1);
    });

    it('should auto-assign IDs to todos', async () => {
      const todos: TodoItem[] = [
        { content: 'Task without ID', status: 'pending' } as TodoItem,
      ];

      const result = await todoTool.execute({ todos });
      
      expect(result.success).toBe(true);
      expect(result.todos[0].id).toBeDefined();
    });

    it('should get todos by status', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Pending task', status: 'pending' },
        { id: '2', content: 'In progress task', status: 'in_progress' },
        { id: '3', content: 'Completed task', status: 'completed' },
      ];

      await todoTool.execute({ todos });
      
      const pendingTodos = todoTool.getTodosByStatus('pending');
      expect(pendingTodos).toHaveLength(1);
      expect(pendingTodos[0].content).toBe('Pending task');
    });

    it('should format todos correctly', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'Task 1', status: 'completed' },
        { id: '2', content: 'Task 2', status: 'in_progress' },
        { id: '3', content: 'Task 3', status: 'pending' },
      ];

      await todoTool.execute({ todos });
      const formatted = todoTool.getFormattedTodos();
      
      expect(formatted).toContain('In Progress:');
      expect(formatted).toContain('Pending:');
      expect(formatted).toContain('Completed:');
      expect(formatted).toContain('Task 1');
      expect(formatted).toContain('Task 2');
      expect(formatted).toContain('Task 3');
    });
  });

  describe('SubAgent Tests', () => {
    let subAgentManager: SubAgentManager;
    
    beforeEach(() => {
      subAgentManager = new SubAgentManager();
    });

    it('should have general-purpose agent by default', () => {
      const agent = subAgentManager.getAgent('general-purpose');
      expect(agent).toBeDefined();
      expect(agent?.getName()).toBe('general-purpose');
    });

    it('should register new sub-agents', () => {
      subAgentManager.registerSubAgent({
        name: 'test-agent',
        description: 'A test agent',
        prompt: 'You are a test agent',
        tools: ['write_todos'],
      });

      const agent = subAgentManager.getAgent('test-agent');
      expect(agent).toBeDefined();
      expect(agent?.getName()).toBe('test-agent');
      expect(agent?.getDescription()).toBe('A test agent');
    });

    it('should execute tasks with sub-agents', async () => {
      const result = await subAgentManager.executeTask(
        'general-purpose',
        'Test task',
        {}
      );

      expect(result.success).toBe(true);
      expect(result.response).toContain('general-purpose');
    });

    it('should handle unknown sub-agent gracefully', async () => {
      const result = await subAgentManager.executeTask(
        'non-existent',
        'Test task',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.response).toContain('not found');
    });

    it('should not allow removing general-purpose agent', () => {
      const removed = subAgentManager.removeAgent('general-purpose');
      expect(removed).toBe(false);
      
      const agent = subAgentManager.getAgent('general-purpose');
      expect(agent).toBeDefined();
    });
  });
});

describe('Message Format Conversion', () => {
  it('should convert between formats correctly', async () => {
    const { GeminiToOpenAIConverter } = await import('../../packages/adapter/gemini-to-openai');
    
    // Test Gemini to OpenAI conversion
    const geminiContents = [
      {
        role: 'user',
        parts: [{ text: 'Hello' }],
      },
      {
        role: 'model',
        parts: [{ text: 'Hi there!' }],
      },
    ];

    const openaiMessages = GeminiToOpenAIConverter.convertContentsToMessages(geminiContents);
    
    expect(openaiMessages).toHaveLength(2);
    expect(openaiMessages[0].role).toBe('user');
    expect(openaiMessages[0].content).toBe('Hello');
    expect(openaiMessages[1].role).toBe('assistant');
    expect(openaiMessages[1].content).toBe('Hi there!');
  });

  it('should handle tool calls in conversion', async () => {
    const { GeminiToOpenAIConverter } = await import('../../packages/adapter/gemini-to-openai');
    
    const geminiContents = [
      {
        role: 'model',
        parts: [
          { text: 'I will help you with that.' },
          {
            functionCall: {
              name: 'write_todos',
              args: { todos: [] },
            },
          },
        ],
      },
      {
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: 'write_todos',
              response: { success: true },
            },
          },
        ],
      },
    ];

    const openaiMessages = GeminiToOpenAIConverter.convertContentsToMessages(geminiContents);
    
    expect(openaiMessages).toHaveLength(2);
    expect(openaiMessages[0].role).toBe('assistant');
    expect(openaiMessages[0].tool_calls).toBeDefined();
    expect(openaiMessages[0].tool_calls![0].function.name).toBe('write_todos');
    expect(openaiMessages[1].role).toBe('tool');
  });
});
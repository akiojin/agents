import { describe, it, expect, beforeEach } from 'bun:test';
import { TodoWriteTool, TodoItem } from './todo-write';

describe('TodoWriteTool', () => {
  let todoTool: TodoWriteTool;

  beforeEach(() => {
    todoTool = new TodoWriteTool();
  });

  describe('execute', () => {
    it('新しいTODOリストを作成できる', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'タスク1', status: 'pending' },
        { id: '2', content: 'タスク2', status: 'in_progress' },
        { id: '3', content: 'タスク3', status: 'completed' },
      ];

      const result = await todoTool.execute({ todos });

      expect(result.success).toBe(true);
      expect(result.todos).toEqual(todos);
      expect(result.summary).toContain('1 pending');
      expect(result.summary).toContain('1 in_progress');
      expect(result.summary).toContain('1 completed');
    });

    it('TODOリストを更新できる', async () => {
      // 最初のリスト
      const initialTodos: TodoItem[] = [
        { id: '1', content: 'タスク1', status: 'pending' },
      ];
      await todoTool.execute({ todos: initialTodos });

      // 更新
      const updatedTodos: TodoItem[] = [
        { id: '1', content: 'タスク1', status: 'completed' },
        { id: '2', content: 'タスク2', status: 'pending' },
      ];
      const result = await todoTool.execute({ todos: updatedTodos });

      expect(result.success).toBe(true);
      expect(result.todos).toEqual(updatedTodos);
      expect(result.summary).toContain('1 pending');
      expect(result.summary).toContain('1 completed');
    });

    it('空のTODOリストをクリアできる', async () => {
      // 最初にいくつか追加
      const todos: TodoItem[] = [
        { id: '1', content: 'タスク1', status: 'pending' },
      ];
      await todoTool.execute({ todos });

      // クリア
      const result = await todoTool.execute({ todos: [] });

      expect(result.success).toBe(true);
      expect(result.todos).toEqual([]);
      expect(result.message).toContain('cleared');
    });

    it('複数のin_progressタスクを検出する', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'タスク1', status: 'in_progress' },
        { id: '2', content: 'タスク2', status: 'in_progress' },
      ];

      const result = await todoTool.execute({ todos });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Warning');
      expect(result.message).toContain('multiple tasks');
    });

    it('IDなしのタスクに自動でIDを割り当てる', async () => {
      const todos: TodoItem[] = [
        { content: 'タスク1', status: 'pending' },
        { content: 'タスク2', status: 'in_progress' },
      ];

      const result = await todoTool.execute({ todos });

      expect(result.success).toBe(true);
      expect(result.todos[0].id).toBeDefined();
      expect(result.todos[1].id).toBeDefined();
      expect(result.todos[0].id).not.toBe(result.todos[1].id);
    });
  });

  describe('getFormattedTodos', () => {
    it('TODOリストをフォーマット済み文字列として取得できる', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'タスク1', status: 'pending' },
        { id: '2', content: 'タスク2', status: 'in_progress' },
        { id: '3', content: 'タスク3', status: 'completed' },
      ];

      await todoTool.execute({ todos });
      const formatted = todoTool.getFormattedTodos();

      expect(formatted).toContain('TODO List');
      expect(formatted).toContain('[ ] タスク1');
      expect(formatted).toContain('[•] タスク2');
      expect(formatted).toContain('[✓] タスク3');
      expect(formatted).toContain('Summary:');
    });

    it('空のリストの場合は適切なメッセージを返す', () => {
      const formatted = todoTool.getFormattedTodos();
      expect(formatted).toBe('No todos currently tracked.');
    });
  });

  describe('getTodos', () => {
    it('現在のTODOリストを取得できる', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'タスク1', status: 'pending' },
        { id: '2', content: 'タスク2', status: 'completed' },
      ];

      await todoTool.execute({ todos });
      const currentTodos = todoTool.getTodos();

      expect(currentTodos).toEqual(todos);
    });
  });

  describe('clearTodos', () => {
    it('TODOリストをクリアできる', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'タスク1', status: 'pending' },
      ];

      await todoTool.execute({ todos });
      todoTool.clearTodos();
      const currentTodos = todoTool.getTodos();

      expect(currentTodos).toEqual([]);
    });
  });

  describe('エッジケース', () => {
    it('重複するIDを持つタスクを処理できる', async () => {
      const todos: TodoItem[] = [
        { id: '1', content: 'タスク1', status: 'pending' },
        { id: '1', content: 'タスク2', status: 'completed' },
      ];

      const result = await todoTool.execute({ todos });

      expect(result.success).toBe(true);
      // 重複IDの場合も正常に処理される
      expect(result.todos.length).toBe(2);
    });

    it('大量のタスクを処理できる', async () => {
      const todos: TodoItem[] = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i}`,
        content: `タスク${i}`,
        status: i % 3 === 0 ? 'completed' : i % 3 === 1 ? 'in_progress' : 'pending',
      } as TodoItem));

      const result = await todoTool.execute({ todos });

      expect(result.success).toBe(true);
      expect(result.todos.length).toBe(100);
    });

    it('長いコンテンツを持つタスクを処理できる', async () => {
      const longContent = 'これは非常に長いタスクの説明です。'.repeat(50);
      const todos: TodoItem[] = [
        { id: '1', content: longContent, status: 'pending' },
      ];

      const result = await todoTool.execute({ todos });

      expect(result.success).toBe(true);
      expect(result.todos[0].content).toBe(longContent);
    });
  });
});
/**
 * TodoWrite Tool - Planning and task management tool for ToolRegistry
 * This version extends BaseTool for proper integration with the tool system
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';

export interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface TodoWriteParams {
  todos: TodoItem[];
}

export class TodoWriteTool extends BaseTool<TodoWriteParams, ToolResult> {
  static readonly Name = 'write_todos';
  
  private todos: TodoItem[] = [];
  private idCounter: number = 1;

  constructor() {
    super(
      TodoWriteTool.Name,
      'TODO Write',
      `タスクリストを作成・管理して作業の進捗を追跡する

使用するタイミング:
- 3つ以上のステップが必要な複雑なタスク
- 慎重な計画が必要な重要なタスク  
- 複数のタスクが提供された場合
- 新しい指示を受けた後
- タスク開始時（in_progressとしてマーク）
- タスク完了後（completedとしてマーク）

タスク状態:
- pending: まだ開始していないタスク
- in_progress: 現在作業中（同時に1つまで）
- completed: 正常に完了したタスク`,
{
        properties: {
          todos: {
            type: Type.ARRAY,
            description: '更新されたTODOリスト',
            items: {
              type: Type.OBJECT,
              properties: {
                id: {
                  type: Type.STRING,
                  description: 'TODOの一意識別子'
                },
                content: {
                  type: Type.STRING,
                  description: 'タスクの説明'
                },
                status: {
                  type: Type.STRING,
                  enum: ['pending', 'in_progress', 'completed'],
                  description: 'タスクの現在の状態'
                }
              },
              required: ['content', 'status']
            }
          }
        },
        required: ['todos'],
        type: Type.OBJECT
      },
      false, // isOutputMarkdown
      false  // canUpdateOutput
    );
  }

  override validateToolParams(params: TodoWriteParams): string | null {
    if (!params.todos || !Array.isArray(params.todos)) {
      return 'todos parameter must be an array';
    }

    for (const todo of params.todos) {
      if (!todo.content || !todo.status) {
        return `Invalid todo item: ${JSON.stringify(todo)}`;
      }
      if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
        return `Invalid status: ${todo.status}`;
      }
    }

    // Check for multiple in-progress tasks
    const inProgressCount = params.todos.filter(t => t.status === 'in_progress').length;
    if (inProgressCount > 1) {
      // This is a warning, not an error, so we don't return an error message
      console.warn('Warning: multiple tasks are in_progress. Consider focusing on one task at a time.');
    }

    return null;
  }

  override getDescription(params: TodoWriteParams): string {
    const pendingCount = params.todos.filter(t => t.status === 'pending').length;
    const inProgressCount = params.todos.filter(t => t.status === 'in_progress').length;
    const completedCount = params.todos.filter(t => t.status === 'completed').length;
    
    return `Updating TODO list: ${pendingCount} pending, ${inProgressCount} in_progress, ${completedCount} completed`;
  }

  override async shouldConfirmExecute(): Promise<false> {
    // Todo updates don't need confirmation
    return false;
  }

  override async execute(params: TodoWriteParams): Promise<ToolResult> {
    try {
      // Auto-assign IDs if not provided
      for (const todo of params.todos) {
        if (!todo.id) {
          todo.id = String(this.idCounter++);
        }
      }

      // Store previous count for message generation
      const previousCount = this.todos.length;
      
      // Update the todo list
      this.todos = params.todos;

      // Check for multiple in-progress tasks
      const inProgressCount = params.todos.filter(t => t.status === 'in_progress').length;
      let warningMessage = '';
      if (inProgressCount > 1) {
        warningMessage = '\n⚠️ Warning: multiple tasks are in_progress. Consider focusing on one task at a time.';
      }

      // Generate message
      let message: string;
      if (this.todos.length === 0 && previousCount > 0) {
        message = 'TODOリストをクリアしました';
      } else if (this.todos.length === 0) {
        message = 'TODOリストは空です';
      } else {
        message = 'TODOリストを更新しました';
      }

      if (warningMessage) {
        message += warningMessage;
      }

      // Calculate summary
      const pendingCount = this.todos.filter(t => t.status === 'pending').length;
      const inProgressCountFinal = this.todos.filter(t => t.status === 'in_progress').length;
      const completedCount = this.todos.filter(t => t.status === 'completed').length;
      
      const summaryParts = [];
      if (pendingCount > 0) summaryParts.push(`${pendingCount} pending`);
      if (inProgressCountFinal > 0) summaryParts.push(`${inProgressCountFinal} in_progress`);
      if (completedCount > 0) summaryParts.push(`${completedCount} completed`);
      
      const summary = summaryParts.length > 0 ? summaryParts.join(', ') : 'No todos';

      // Format output
      let output = `${message}\n\n`;
      output += this.getFormattedTodos();

      return {
        llmContent: output,
        returnDisplay: output
      };
    } catch (error) {
      const errorMessage = `Error updating todos: ${error}`;
      return {
        llmContent: errorMessage,
        returnDisplay: errorMessage
      };
    }
  }

  /**
   * Get current todos
   */
  getTodos(): TodoItem[] {
    return [...this.todos];
  }

  /**
   * Get todos by status
   */
  getTodosByStatus(status: TodoItem['status']): TodoItem[] {
    return this.todos.filter(todo => todo.status === status);
  }

  /**
   * Update a single todo's status
   */
  updateTodoStatus(id: string, status: TodoItem['status']): boolean {
    const todo = this.todos.find(t => t.id === id);
    if (todo) {
      todo.status = status;
      return true;
    }
    return false;
  }

  /**
   * Add a new todo
   */
  addTodo(content: string, status: TodoItem['status'] = 'pending'): TodoItem {
    const newTodo: TodoItem = {
      id: String(this.idCounter++),
      content,
      status,
    };
    this.todos.push(newTodo);
    return newTodo;
  }

  /**
   * Clear all todos
   */
  clearTodos(): void {
    this.todos = [];
  }

  /**
   * Get a formatted string representation of todos
   */
  private getFormattedTodos(): string {
    if (this.todos.length === 0) {
      return 'No todos currently tracked.';
    }

    let output = '=== TODO List ===\n\n';
    
    // Group by status
    const pending = this.getTodosByStatus('pending');
    const inProgress = this.getTodosByStatus('in_progress');
    const completed = this.getTodosByStatus('completed');
    
    // Format each task with appropriate marker
    if (inProgress.length > 0) {
      output += '**In Progress:**\n';
      inProgress.forEach(todo => {
        output += `  [•] ${todo.content} (ID: ${todo.id})\n`;
      });
      output += '\n';
    }

    if (pending.length > 0) {
      output += '**Pending:**\n';
      pending.forEach(todo => {
        output += `  [ ] ${todo.content} (ID: ${todo.id})\n`;
      });
      output += '\n';
    }

    if (completed.length > 0) {
      output += '**Completed:**\n';
      completed.forEach(todo => {
        output += `  [✓] ${todo.content} (ID: ${todo.id})\n`;
      });
      output += '\n';
    }
    
    // Add summary
    output += '**Summary:**\n';
    const summaryParts = [];
    if (pending.length > 0) summaryParts.push(`${pending.length} pending`);
    if (inProgress.length > 0) summaryParts.push(`${inProgress.length} in_progress`);
    if (completed.length > 0) summaryParts.push(`${completed.length} completed`);
    output += summaryParts.join(', ') || 'No todos';

    return output;
  }
}
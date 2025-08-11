"use strict";
/**
 * TodoWrite Tool - Planning and task management tool
 * Inspired by Claude Code and DeepAgents
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.todoWriteToolDefinition = exports.TodoWriteTool = void 0;
class TodoWriteTool {
    constructor() {
        this.todos = [];
        this.idCounter = 1;
    }
    /**
     * Update the todo list
     */
    async execute(params) {
        try {
            // Validate todos
            for (const todo of params.todos) {
                if (!todo.content || !todo.status) {
                    throw new Error(`Invalid todo item: ${JSON.stringify(todo)}`);
                }
                // Auto-assign ID if not provided
                if (!todo.id) {
                    todo.id = String(this.idCounter++);
                }
            }
            // Check for multiple in-progress tasks
            const inProgressCount = params.todos.filter(t => t.status === 'in_progress').length;
            let warningMessage = '';
            if (inProgressCount > 1) {
                warningMessage = ' Warning: multiple tasks are in_progress. Consider focusing on one task at a time.';
            }
            // Store previous count for message generation
            const previousCount = this.todos.length;
            // Update the todo list
            this.todos = params.todos;
            // Generate message
            let message;
            if (this.todos.length === 0 && previousCount > 0) {
                message = 'TODOリストをcleared';
            }
            else if (warningMessage) {
                message = `TODOリストを更新しました${warningMessage}`;
            }
            else {
                message = 'TODOリストを更新しました';
            }
            // Calculate summary
            const pendingCount = this.todos.filter(t => t.status === 'pending').length;
            const inProgressCountFinal = this.todos.filter(t => t.status === 'in_progress').length;
            const completedCount = this.todos.filter(t => t.status === 'completed').length;
            const summaryParts = [];
            if (pendingCount > 0)
                summaryParts.push(`${pendingCount} pending`);
            if (inProgressCountFinal > 0)
                summaryParts.push(`${inProgressCountFinal} in_progress`);
            if (completedCount > 0)
                summaryParts.push(`${completedCount} completed`);
            const summary = summaryParts.length > 0 ? summaryParts.join(', ') : 'No todos';
            return {
                success: true,
                message,
                todos: this.todos,
                summary,
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Error updating todos: ${error}`,
                todos: this.todos,
            };
        }
    }
    /**
     * Get current todos
     */
    getTodos() {
        return [...this.todos];
    }
    /**
     * Get todos by status
     */
    getTodosByStatus(status) {
        return this.todos.filter(todo => todo.status === status);
    }
    /**
     * Update a single todo's status
     */
    updateTodoStatus(id, status) {
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
    addTodo(content, status = 'pending') {
        const newTodo = {
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
    clearTodos() {
        this.todos = [];
    }
    /**
     * Get a formatted string representation of todos
     */
    getFormattedTodos() {
        if (this.todos.length === 0) {
            return 'No todos currently tracked.';
        }
        let output = '=== TODO List ===\n\n';
        // Pending tasks
        const pending = this.getTodosByStatus('pending');
        const inProgress = this.getTodosByStatus('in_progress');
        const completed = this.getTodosByStatus('completed');
        // Format each task with appropriate marker
        [...inProgress, ...pending, ...completed].forEach(todo => {
            const marker = todo.status === 'completed' ? '[✓]' :
                todo.status === 'in_progress' ? '[•]' : '[ ]';
            output += `${marker} ${todo.content}\n`;
        });
        // Add summary
        output += '\nSummary:\n';
        const summaryParts = [];
        if (pending.length > 0)
            summaryParts.push(`${pending.length} pending`);
        if (inProgress.length > 0)
            summaryParts.push(`${inProgress.length} in_progress`);
        if (completed.length > 0)
            summaryParts.push(`${completed.length} completed`);
        output += summaryParts.join(', ') || 'No todos';
        return output;
    }
}
exports.TodoWriteTool = TodoWriteTool;
// Tool definition for integration with agent systems
exports.todoWriteToolDefinition = {
    name: 'write_todos',
    description: `Use this tool to create and manage a structured task list for your current work session. This helps you track progress, organize complex tasks, and demonstrate thoroughness.

When to use this tool:
- Complex multi-step tasks requiring 3 or more distinct steps
- Non-trivial tasks requiring careful planning
- When explicitly requested to use todo list
- When multiple tasks are provided
- After receiving new instructions
- When starting work on a task (mark as in_progress)
- After completing a task (mark as completed)

Task states:
- pending: Task not yet started
- in_progress: Currently working on (limit to ONE at a time)
- completed: Task finished successfully`,
    parameters: {
        type: 'object',
        properties: {
            todos: {
                type: 'array',
                description: 'The updated todo list',
                items: {
                    type: 'object',
                    properties: {
                        id: {
                            type: 'string',
                            description: 'Unique identifier for the todo',
                        },
                        content: {
                            type: 'string',
                            description: 'Description of the task',
                        },
                        status: {
                            type: 'string',
                            enum: ['pending', 'in_progress', 'completed'],
                            description: 'Current status of the task',
                        },
                    },
                    required: ['content', 'status'],
                },
            },
        },
        required: ['todos'],
    },
};
//# sourceMappingURL=todo-write.js.map
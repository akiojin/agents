/**
 * TodoWrite Tool - Planning and task management tool
 * Inspired by Claude Code and DeepAgents
 */
export interface TodoItem {
    id: string;
    content: string;
    status: 'pending' | 'in_progress' | 'completed';
}
export interface TodoWriteParams {
    todos: TodoItem[];
}
export interface TodoWriteResult {
    success: boolean;
    message: string;
    todos: TodoItem[];
    summary?: string;
}
export declare class TodoWriteTool {
    private todos;
    private idCounter;
    /**
     * Update the todo list
     */
    execute(params: TodoWriteParams): Promise<TodoWriteResult>;
    /**
     * Get current todos
     */
    getTodos(): TodoItem[];
    /**
     * Get todos by status
     */
    getTodosByStatus(status: TodoItem['status']): TodoItem[];
    /**
     * Update a single todo's status
     */
    updateTodoStatus(id: string, status: TodoItem['status']): boolean;
    /**
     * Add a new todo
     */
    addTodo(content: string, status?: TodoItem['status']): TodoItem;
    /**
     * Clear all todos
     */
    clearTodos(): void;
    /**
     * Get a formatted string representation of todos
     */
    getFormattedTodos(): string;
}
export declare const todoWriteToolDefinition: {
    name: string;
    description: string;
    parameters: {
        type: string;
        properties: {
            todos: {
                type: string;
                description: string;
                items: {
                    type: string;
                    properties: {
                        id: {
                            type: string;
                            description: string;
                        };
                        content: {
                            type: string;
                            description: string;
                        };
                        status: {
                            type: string;
                            enum: string[];
                            description: string;
                        };
                    };
                    required: string[];
                };
            };
        };
        required: string[];
    };
};

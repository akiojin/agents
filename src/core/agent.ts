import EventEmitter from 'events';
import type { Config, ChatMessage, TaskConfig, TaskResult } from '../config/types.js';
import { logger, PerformanceLogger, LogLevel } from '../utils/logger.js';
import { withRetry } from '../utils/retry.js';
import type { LLMProvider } from '../providers/base.js';
import { createProviderFromUnifiedConfig } from '../providers/factory.js';
import { TaskExecutor } from './task-executor.js';
import { MemoryManager } from './memory.js';
import { MCPToolsHelper, MCPTaskPlanner } from '../mcp/tools.js';
import type { MCPManager } from '../mcp/manager.js';

import { SimpleTaskDecomposer } from './task-decomposer.js';
import { ParallelExecutor } from './parallel-executor.js';

export class AgentCore extends EventEmitter {
  private config: Config;
  private provider: LLMProvider;
  private taskExecutor: TaskExecutor;
  private memoryManager: MemoryManager;
  private mcpToolsHelper?: MCPToolsHelper;
  private mcpTaskPlanner?: MCPTaskPlanner;
  private taskDecomposer: SimpleTaskDecomposer;
  private parallelExecutor: ParallelExecutor;
  private history: ChatMessage[] = [];
  private currentModel: string;
  private parallelMode: boolean = false;
  private verboseMode: boolean = false;
  
  // Memory management configuration
  private readonly MAX_HISTORY_SIZE = 100; // Maximum history size
  private readonly MEMORY_CHECK_INTERVAL = 10; // Check memory every N chats
  private chatCount: number = 0; // Chat count
  
  // Resource management
  private timers: Set<NodeJS.Timeout> = new Set();
  private eventListeners: WeakMap<object, Function[]> = new WeakMap();

  constructor(config: Config) {
    super();
    this.config = config;
    this.currentModel = config.llm.model || this.getDefaultModel();
    this.provider = createProviderFromUnifiedConfig(config);
    this.taskExecutor = new TaskExecutor(this.convertToLegacyConfig(config));
    this.memoryManager = new MemoryManager(config.paths.history);
    this.taskDecomposer = new SimpleTaskDecomposer();
    this.parallelExecutor = new ParallelExecutor(config.app.maxParallel || 3);
    
    // Initialize asynchronously (with error handling)
    void this.initialize();
    
    // Register cleanup handlers for process exit
    this.setupCleanupHandlers();
  }

  /**
   * Convert new Config type to legacy Config type
   */
  private convertToLegacyConfig(config: Config): import('../types/config.js').Config {
    return {
      provider: config.llm.provider,
      apiKey: config.llm.apiKey,
      model: config.llm.model,
      localEndpoint: config.localEndpoint,
      useMCP: config.mcp.enabled,
      mcpServers: config.mcp.servers,
      maxParallel: config.app.maxParallel,
      timeout: config.app.timeout,
      logLevel: config.app.logLevel,
      cachePath: config.paths.cache,
      historyPath: config.paths.history,
    };
  }

  private async initialize(): Promise<void> {
    try {
      // Load history
      this.history = await this.memoryManager.loadHistory();
      
      // Optimize memory on startup
      await this.optimizeMemory();
      
      logger.info('Agent core initialized');
    } catch (error) {
      logger.error('InitializeError:', error);

      // Basic functionality remains available even with initialization error
      this.history = [];
      logger.warn('Failed to load history, starting as new session');

      // Initialization error is not fatal, so don't throw exception
    }
  }

  /**
   * Configure cleanup handlers
   */
  private setupCleanupHandlers(): void {
    const cleanup = () => {
      this.cleanup();
    };

    // Cleanup on process exit
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception:', error);
      cleanup();
      process.exit(1);
    });
  }

  /**
   * Clean up resources
   */
  public cleanup(): void {
    try {
      // Clear timers
      this.timers.forEach(timer => clearTimeout(timer));
      this.timers.clear();

      // Remove event listeners
      this.removeAllListeners();

      logger.info('Resource cleanup completed');
    } catch (error) {
      logger.error('CleanupError:', error);
    }
  }

  /**
   * Memory optimization processing
   */
  private async optimizeMemory(): Promise<void> {
    try {
      // Limit history size
      if (this.history.length > this.MAX_HISTORY_SIZE) {
        const oldSize = this.history.length;
        this.history = this.history.slice(-this.MAX_HISTORY_SIZE);
        await this.memoryManager.saveHistory(this.history);
        logger.info(`History optimized: ${oldSize} items → ${this.history.length} items`);
      }

      // Also optimize MemoryManager history
      await this.memoryManager.pruneHistory(this.MAX_HISTORY_SIZE);

      // Execute garbage collection (if available)
      if (global.gc) {
        global.gc();
        logger.debug('Garbage collection executed');
      }
    } catch (error) {
      logger.error('Memory optimization error:', error);
    }
  }

  /**
   * Monitor memory usage
   */
  private monitorMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const mbUsage = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    logger.debug('Memory usage:', mbUsage);

    // Warning when memory usage is high
    if (mbUsage.heapUsed > 500) { // When over 500MB
      logger.warn(`Memory usage is high: ${mbUsage.heapUsed}MB`);
      // Execute automatic optimization
      void this.optimizeMemory();
    }
  }

  /**
   * Register timer (with automatic cleanup)
   */
  private registerTimer(callback: () => void, delay: number): NodeJS.Timeout {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      callback();
    }, delay);
    
    this.timers.add(timer);
    return timer;
  }

  private getDefaultModel(): string {
    switch (this.config.llm.provider) {
      case 'openai':
        return 'gpt-4-turbo-preview';
      case 'anthropic':
        return 'claude-3-opus-20240229';
      case 'local-gptoss':
      case 'local-lmstudio':
        return 'local-model';
      default:
        return 'gpt-4';
    }
  }

  async chat(input: string): Promise<string> {
    const perf = new PerformanceLogger('chat');
    const { globalProgressReporter } = await import('../ui/progress.js');

    try {
      // Start progress display
      globalProgressReporter.startTask('Chat processing', ['Input validation', 'LLM call', 'Response processing', 'History save']);

      // Input validation
      globalProgressReporter.updateSubtask(0);
      if (!input || input.trim().length === 0) {
        globalProgressReporter.completeTask(false);
        throw new Error('Input is empty');
      }

      const trimmedInput = input.trim();
      if (trimmedInput.length > 32000) {
        globalProgressReporter.completeTask(false);
        throw new Error('Input is too long (maximum 32,000 characters)');
      }

      // Check memory usage (periodically)
      this.chatCount++;
      if (this.chatCount % this.MEMORY_CHECK_INTERVAL === 0) {
        this.monitorMemoryUsage();
        await this.optimizeMemory();
      }

      // Add user message to history
    if (errorCount > 0) {
      const failedSteps = stepResults
        .filter((r) => !r.success)
        .map((r) => `- ${r.description}: ${r.error}`)
        .join('\n');
      summaryParts.push(`Failed steps:\n${failedSteps}`);
    }

    return summaryParts.join('\n');
  }

  /**
   * Determine if subtasks can be executed in parallel
   */
  private canRunSubtasksInParallel(subtasks: string[]): boolean {
    // Simple rules for parallel execution determination
    const conflictKeywords = [
      'same file',
      'order',
      'Sequential',
      'previous task',
      'depend',
      'use result',
      'utilize result',
      'after',
      'based on',
    ];

    // Check for conflicting keywords between tasks
    const hasConflict = subtasks.some((subtask) =>
      conflictKeywords.some((keyword) => subtask.includes(keyword))
    );

    if (hasConflict) {
      logger.debug('Dependencies detected in subtasks. Choosing sequential execution.');
      return false;
    }

    // Check for file path conflicts
    const usedFiles = new Set<string>();
    for (const subtask of subtasks) {
      const files = this.extractFilesFromSubtask(subtask);
      const hasFileConflict = files.some(file => usedFiles.has(file));
      
      if (hasFileConflict) {
        logger.debug('File conflicts detected between subtasks. Choosing sequential execution.');
        return false;
      }
      
      // Fix forEach + async issue: use for...of loop
      for (const file of files) {
        usedFiles.add(file);
      }
    }

    return true;
  }

  /**
   * Extract related files from subtask
   */
  private extractFilesFromSubtask(subtask: string): string[] {
    const files: string[] = [];
    
    // Search for file path patterns
    const filePatterns = [
      /[\w-]+\.[\w]+/g, // file.ext format
      /src\/[\w\/.-]+/g, // Paths starting with src/
      /\.\/[\w\/.-]+/g, // Relative path
      /\/[\w\/.-]+/g, // Absolute path
    ];
    
    for (const pattern of filePatterns) {
      const matches = subtask.match(pattern);
      if (matches) {
        files.push(...matches);
      }
    }
    
    return [...new Set(files)]; // Remove duplicates
  }

  /**
   * Execute subtasks in parallel
   */
  private async executeSubtasksInParallel(subtasks: string[]): Promise<string[]> {
    const { globalProgressReporter } = await import('../ui/progress.js');

    // Convert subtasks to parallel tasks
    const parallelTasks = subtasks.map((subtask, index) => ({
      id: `subtask-${index}`,
      description: subtask,
      priority: 5,
      task: async () => {
        logger.info(`🔄 Subtask ${index + 1} Started: ${subtask}`);
        try {
          const result = await this.chat(subtask);
          logger.info(`✅ Subtask ${index + 1} Completed`);
          return `Subtask ${index + 1}: ${result}`;
        } catch (error) {
          const errorMsg = `Subtask ${index + 1} Error occurred in: ${error instanceof Error ? error.message : String(error)}`;
          logger.error(`❌ ${errorMsg}`);
          return errorMsg;
        }
      },
    }));

    // Execute in parallel
    const parallelResults = await this.parallelExecutor.executeParallelWithDetails(
      parallelTasks,
      (completed, total, currentTask) => {
        globalProgressReporter.showInfo(`Parallel execution progress: ${completed}/${total} - ${currentTask}`);
      }
    );

    // Convert results to string array
    return parallelResults.map(pr => 
      pr.success ? pr.data as string : `Error: ${pr.error?.message || 'Unknown error'}`
    );
  }

  /**
   * Execute subtasks sequentially
   */
  private async executeSubtasksSequentially(subtasks: string[]): Promise<string[]> {
    const results: string[] = [];
    
    for (let i = 0; i < subtasks.length; i++) {
      const subtask = subtasks[i];
      logger.info(`\n🔄 Subtask ${i + 1}/${subtasks.length} Executing: ${subtask}`);
      
      try {
        const subtaskResult = await this.chat(subtask);
        results.push(`Subtask ${i + 1}: ${subtaskResult}`);
        logger.info(`✅ Subtask ${i + 1} Completed`);
      } catch (error) {
        const errorMsg = `Subtask ${i + 1} Error occurred in: ${error instanceof Error ? error.message : String(error)}`;
        results.push(errorMsg);
        logger.error(`❌ ${errorMsg}`);
      }
    }

    return results;
  }
}

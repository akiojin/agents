/**
 * SerenaDocumentAdapter用のヘルパー関数
 * AgentCoreからSerena MCPインターフェースを設定
 */

import type { AgentCore } from '../core/agent.js';
import type { SerenaDocumentAdapter } from '../core/serena-document-adapter.js';
import { logger } from './logger.js';

/**
 * AgentCoreからSerenaDocumentAdapterにMCPインターフェースを設定
 */
export function configureSerenaAdapter(
  serenaAdapter: SerenaDocumentAdapter,
  agent: AgentCore
): void {
  const serenaInterface = {
    writeMemory: async (name: string, content: string): Promise<void> => {
      try {
        await agent.invokeTool('mcp__serena__write_memory', {
          memory_name: name,
          content: content
        });
      } catch (error) {
        logger.error(`Serena writeMemory failed: ${name}`, error);
        throw error;
      }
    },

    readMemory: async (name: string): Promise<string | null> => {
      try {
        const result = await agent.invokeTool('mcp__serena__read_memory', {
          memory_file_name: name
        }) as string;
        return result;
      } catch (error) {
        // メモリが存在しない場合はnullを返す
        if (error instanceof Error && error.message.includes('not found')) {
          return null;
        }
        logger.error(`Serena readMemory failed: ${name}`, error);
        throw error;
      }
    },

    listMemories: async (): Promise<string[]> => {
      try {
        const result = await agent.invokeTool('mcp__serena__list_memories', {}) as { memories: string[] };
        return result.memories || [];
      } catch (error) {
        logger.error('Serena listMemories failed', error);
        throw error;
      }
    },

    deleteMemory: async (name: string): Promise<void> => {
      try {
        await agent.invokeTool('mcp__serena__delete_memory', {
          memory_file_name: name
        });
      } catch (error) {
        logger.error(`Serena deleteMemory failed: ${name}`, error);
        throw error;
      }
    }
  };

  serenaAdapter.setSerenaInterface(serenaInterface);
  logger.debug('SerenaDocumentAdapterにMCPインターフェースを設定完了');
}
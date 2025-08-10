/**
 * Hook for integrating memory system with UI
 * Handles automatic memory triggers and provides memory-related functions
 */

import { useEffect, useCallback, useRef } from 'react';
import { getMemoryManager } from '../../memory/memoryManager.js';
import { HistoryItem } from '../types.js';

export interface UseMemoryIntegrationOptions {
  history: HistoryItem[];
  config: any;
}

export function useMemoryIntegration({ history, config }: UseMemoryIntegrationOptions) {
  const memoryManager = useRef(getMemoryManager());
  const lastErrorRef = useRef<string | null>(null);
  const taskStartTimeRef = useRef<number | null>(null);
  const taskStepsRef = useRef<string[]>([]);
  
  /**
   * エラーパターンの自動記録
   */
  useEffect(() => {
    const lastItem = history[history.length - 1];
    
    if (lastItem && lastItem.type === 'error' && lastItem.text) {
      const errorText = lastItem.text;
      
      // 同じエラーを二重に記録しない
      if (errorText !== lastErrorRef.current) {
        lastErrorRef.current = errorText;
        
        // エラー解決策を検索
        memoryManager.current.findErrorSolution(errorText).then(solution => {
          if (solution) {
            console.log(`💡 Memory suggests: ${solution}`);
          }
        });
        
        // エラーを記録（解決策は後で更新される）
        memoryManager.current.recordError(errorText, undefined, {
          timestamp: new Date(),
          workingDirectory: config.getTargetDir()
        });
      }
    }
  }, [history, config]);
  
  /**
   * 成功パターンの自動記録
   */
  useEffect(() => {
    const lastItem = history[history.length - 1];
    
    if (lastItem && lastItem.type === 'gemini' && lastItem.text) {
      // タスクのステップを記録
      if (taskStartTimeRef.current) {
        taskStepsRef.current.push(lastItem.text.substring(0, 100));
      }
    }
    
    // ユーザーメッセージでタスク開始を検知
    if (lastItem && lastItem.type === 'user' && lastItem.text) {
      taskStartTimeRef.current = Date.now();
      taskStepsRef.current = [lastItem.text];
    }
    
    // 成功メッセージを検知
    if (lastItem && lastItem.type === 'info' && lastItem.text?.includes('successfully')) {
      if (taskStartTimeRef.current && taskStepsRef.current.length > 0) {
        const duration = Date.now() - taskStartTimeRef.current;
        
        // 長時間のタスクのみ記録（3秒以上）
        if (duration > 3000) {
          const taskDescription = taskStepsRef.current[0];
          memoryManager.current.recordSuccess(
            taskDescription,
            taskStepsRef.current.slice(1),
            {
              duration,
              timestamp: new Date()
            }
          );
        }
        
        // リセット
        taskStartTimeRef.current = null;
        taskStepsRef.current = [];
      }
    }
  }, [history]);
  
  /**
   * エラーが解決された時の記録
   */
  const recordErrorSolution = useCallback(async (error: string, solution: string) => {
    await memoryManager.current.recordError(error, solution, {
      resolved: true,
      timestamp: new Date()
    });
    console.log('✅ Error solution recorded for future reference');
  }, []);
  
  /**
   * 明示的な記憶要求
   */
  const explicitMemorize = useCallback(async (content: string, tags: string[] = []) => {
    const memories = memoryManager.current;
    if (!memories.isAvailable()) {
      console.warn('Memory system not available');
      return;
    }
    
    // store メソッドは MemoryManager にはないため、直接記録
    // TODO: IntegratedMemorySystem へのアクセスを提供する必要がある
    console.log('💾 Explicit memory request received (implementation pending)');
  }, []);
  
  /**
   * 記憶の検索
   */
  const searchMemory = useCallback(async (query: string): Promise<any[]> => {
    const memories = memoryManager.current;
    if (!memories.isAvailable()) {
      return [];
    }
    
    const results = await memories.recall(query, [
      config.getTargetDir(),
      'interactive_session'
    ]);
    
    return results;
  }, [config]);
  
  /**
   * 統計情報の取得
   */
  const getMemoryStats = useCallback(async () => {
    const memories = memoryManager.current;
    if (!memories.isAvailable()) {
      return null;
    }
    
    return await memories.getStatistics();
  }, []);
  
  return {
    recordErrorSolution,
    explicitMemorize,
    searchMemory,
    getMemoryStats,
    isMemoryAvailable: memoryManager.current?.isAvailable() || false
  };
}
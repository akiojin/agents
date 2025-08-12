/**
 * Decision Log Hook - 決定ログシステムとUIの統合
 * WhyChainによる因果関係追跡とパターン分析を提供
 */

import { useState, useEffect, useCallback } from 'react';
import { getMemoryManager } from '../../memory/memoryManager.js';
import { DecisionLog, WhyChain, Decision } from '@agents/memory/decision-log';

export interface DecisionLogHookState {
  isEnabled: boolean;
  currentDecisionId: number | null;
  recentDecisions: Decision[];
  whyChain: WhyChain | null;
  patterns: any[];
  statistics: any;
  isLoading: boolean;
  error: string | null;
}

export interface DecisionLogHookActions {
  recordDecision: (action: string, reason: string, context?: any) => Promise<number | null>;
  updateDecisionResult: (decisionId: number, result: 'success' | 'failure', output?: string) => Promise<void>;
  buildWhyChain: (decisionId?: number) => Promise<void>;
  detectPatterns: (options?: any) => Promise<void>;
  refreshStatistics: () => Promise<void>;
  clearError: () => void;
  getDecisionHistory: (limit?: number) => Promise<Decision[]>;
  exportDecisions: (format?: 'json' | 'csv') => Promise<string>;
}

export type UseDecisionLogReturn = DecisionLogHookState & DecisionLogHookActions;

/**
 * 決定ログシステムを管理するReactフック
 */
export function useDecisionLog(): UseDecisionLogReturn {
  const [state, setState] = useState<DecisionLogHookState>({
    isEnabled: false,
    currentDecisionId: null,
    recentDecisions: [],
    whyChain: null,
    patterns: [],
    statistics: null,
    isLoading: false,
    error: null
  });

  // 初期化
  useEffect(() => {
    initializeDecisionLog();
  }, []);

  const initializeDecisionLog = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const memoryManager = getMemoryManager();
      const decisionLog = memoryManager.getDecisionLog();
      
      if (decisionLog) {
        setState(prev => ({ ...prev, isEnabled: true }));
        await refreshStatistics();
        await loadRecentDecisions();
      } else {
        setState(prev => ({ 
          ...prev, 
          isEnabled: false,
          error: 'Decision Log is not enabled. Enable it in memory settings.'
        }));
      }
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: `Failed to initialize Decision Log: ${error instanceof Error ? error.message : String(error)}`
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const recordDecision = useCallback(async (
    action: string, 
    reason: string, 
    context?: any
  ): Promise<number | null> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const memoryManager = getMemoryManager();
      const decisionId = await memoryManager.recordDecision(action, reason, context);
      
      if (decisionId) {
        setState(prev => ({ 
          ...prev, 
          currentDecisionId: decisionId
        }));
        
        // 最近の決定を更新
        await loadRecentDecisions();
      }
      
      return decisionId;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: `Failed to record decision: ${error instanceof Error ? error.message : String(error)}`
      }));
      return null;
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const updateDecisionResult = useCallback(async (
    decisionId: number, 
    result: 'success' | 'failure', 
    output?: string
  ): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const memoryManager = getMemoryManager();
      await memoryManager.updateDecisionResult(decisionId, result, output);
      
      // 最近の決定を更新
      await loadRecentDecisions();
      await refreshStatistics();
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: `Failed to update decision result: ${error instanceof Error ? error.message : String(error)}`
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const buildWhyChain = useCallback(async (decisionId?: number): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const memoryManager = getMemoryManager();
      const whyChain = await memoryManager.buildWhyChain(decisionId);
      
      setState(prev => ({ ...prev, whyChain }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: `Failed to build why chain: ${error instanceof Error ? error.message : String(error)}`
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const detectPatterns = useCallback(async (options?: any): Promise<void> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const memoryManager = getMemoryManager();
      const patterns = await memoryManager.detectPatterns(options);
      
      setState(prev => ({ ...prev, patterns }));
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: `Failed to detect patterns: ${error instanceof Error ? error.message : String(error)}`
      }));
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const refreshStatistics = useCallback(async (): Promise<void> => {
    try {
      const memoryManager = getMemoryManager();
      const decisionLog = memoryManager.getDecisionLog();
      
      if (decisionLog) {
        const statistics = await decisionLog.getStatistics();
        setState(prev => ({ ...prev, statistics }));
      }
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: `Failed to refresh statistics: ${error instanceof Error ? error.message : String(error)}`
      }));
    }
  }, []);

  const loadRecentDecisions = useCallback(async (limit: number = 10): Promise<void> => {
    try {
      const memoryManager = getMemoryManager();
      const decisionLog = memoryManager.getDecisionLog();
      
      if (decisionLog) {
        const decisions = await decisionLog.getRecentDecisions(limit);
        setState(prev => ({ ...prev, recentDecisions: decisions }));
      }
    } catch (error) {
      console.warn('Failed to load recent decisions:', error);
    }
  }, []);

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  const getDecisionHistory = useCallback(async (limit: number = 50): Promise<Decision[]> => {
    try {
      const memoryManager = getMemoryManager();
      const decisionLog = memoryManager.getDecisionLog();
      
      if (decisionLog) {
        return await decisionLog.getRecentDecisions(limit);
      }
      
      return [];
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: `Failed to get decision history: ${error instanceof Error ? error.message : String(error)}`
      }));
      return [];
    }
  }, []);

  const exportDecisions = useCallback(async (format: 'json' | 'csv' = 'json'): Promise<string> => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));
      
      const decisions = await getDecisionHistory(1000);
      
      if (format === 'json') {
        return JSON.stringify(decisions, null, 2);
      } else {
        // CSV形式でエクスポート
        const headers = ['ID', 'Action Type', 'Target', 'Reason', 'Result', 'Created At', 'Updated At'];
        const rows = decisions.map(d => [
          d.id,
          d.action_type,
          d.action_target,
          d.reason,
          d.result || 'pending',
          d.timestamp,
          ''
        ]);
        
        const csvContent = [
          headers.join(','),
          ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        ].join('\\n');
        
        return csvContent;
      }
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        error: `Failed to export decisions: ${error instanceof Error ? error.message : String(error)}`
      }));
      return '';
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, [getDecisionHistory]);

  return {
    // State
    ...state,
    
    // Actions
    recordDecision,
    updateDecisionResult,
    buildWhyChain,
    detectPatterns,
    refreshStatistics,
    clearError,
    getDecisionHistory,
    exportDecisions
  };
}

/**
 * 決定ログの統計情報を整形するヘルパー関数
 */
export function formatDecisionStatistics(statistics: any): string {
  if (!statistics) return 'No statistics available';
  
  let output = '## Decision Log Statistics\\n\\n';
  
  output += `**Total Decisions:** ${statistics.totalDecisions || 0}\\n`;
  output += `**Success Rate:** ${((statistics.successRate || 0) * 100).toFixed(1)}%\\n`;
  output += `**Average Decision Time:** ${statistics.averageDecisionTime || 'N/A'}\\n`;
  
  if (statistics.topActions && statistics.topActions.length > 0) {
    output += '\\n**Top Actions:**\\n';
    statistics.topActions.forEach((action: any, index: number) => {
      output += `${index + 1}. ${action.type}: ${action.count} times\\n`;
    });
  }
  
  if (statistics.recentTrends && statistics.recentTrends.length > 0) {
    output += '\\n**Recent Trends:**\\n';
    statistics.recentTrends.forEach((trend: any) => {
      output += `- ${trend.description}\\n`;
    });
  }
  
  return output;
}

/**
 * WhyChainを視覚的に表示するヘルパー関数
 */
export function formatWhyChain(whyChain: WhyChain | null): string {
  if (!whyChain || !whyChain.chain || whyChain.chain.length === 0) {
    return 'No why chain available';
  }
  
  let output = '## Why Chain - Decision Causality\\n\\n';
  
  whyChain.chain.forEach((link, index) => {
    const indent = '  '.repeat(index);
    const arrow = index > 0 ? '↳ ' : '';
    
    output += `${indent}${arrow}**${link.action.type}**: ${link.action.target}\\n`;
    output += `${indent}  *Reason: ${link.reasoning.description}*\\n`;
    
    if (link.result) {
      const resultIcon = link.result === 'success' ? '✅' : '❌';
      output += `${indent}  ${resultIcon} Result: ${link.result}\\n`;
    }
    
    if (link.context && Object.keys(link.context).length > 0) {
      output += `${indent}  📋 Context: ${Object.keys(link.context).length} properties\\n`;
    }
    
    output += '\\n';
  });
  
  // TODO: Add insights when implemented in WhyChain
  
  return output;
}
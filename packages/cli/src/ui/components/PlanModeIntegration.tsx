import React from 'react';
import { Box } from 'ink';
import { usePlanApproval } from '../hooks/usePlanApproval.js';
import { useAgentState } from '../hooks/useAgentState.js';
import { PlanApprovalSelect } from './PlanApprovalSelect.js';
import { PlanModeDisplay } from './PlanModeDisplay.js';
import { ExecutionModeDisplay } from './ExecutionModeDisplay.js';
import { AgentMode, PlanApprovalResult } from '../types/agent-state.js';

interface PlanModeIntegrationProps {
  onPlanApproved?: (result: PlanApprovalResult) => void;
  onPlanRejected?: (result: PlanApprovalResult) => void;
  onPlanEditRequested?: (result: PlanApprovalResult) => void;
  onContentReceived?: (content: string) => void;
}

/**
 * プランモード機能の統合コンポーネント
 * 既存のApp.tsxに影響を最小限にして統合するためのラッパー
 */
export const PlanModeIntegration: React.FC<PlanModeIntegrationProps> = ({
  onPlanApproved,
  onPlanRejected,
  onPlanEditRequested,
  onContentReceived
}) => {
  const { agentState } = useAgentState();
  
  const {
    showApprovalUI,
    pendingPlanData,
    isProcessingApproval,
    handleApprovalAction,
  } = usePlanApproval({
    onPlanApproved: (result) => {
      console.log('Plan approved:', result);
      onPlanApproved?.(result);
    },
    onPlanRejected: (result) => {
      console.log('Plan rejected:', result);
      onPlanRejected?.(result);
    },
    onPlanEditRequested: (result) => {
      console.log('Plan edit requested:', result);
      onPlanEditRequested?.(result);
    }
  });

  // コンテンツを受信した際のプラン完了検出
  React.useEffect(() => {
    if (onContentReceived) {
      const originalHandler = onContentReceived;
      onContentReceived = (content: string) => {
        // detectPlanCompletion(content); // 削除: plan_completeツール呼び出しのみを使用
        originalHandler(content);
      };
    }
  }, [onContentReceived]); // detectPlanCompletionを依存配列から削除

  // 承認UI表示中は他のUIをブロック
  if (showApprovalUI && pendingPlanData) {
    return (
      <Box flexDirection="column">
        <PlanApprovalSelect
          planData={pendingPlanData}
          onSelect={handleApprovalAction}
        />
      </Box>
    );
  }

  // プランモード・実行モードの状態表示
  if (agentState.mode === AgentMode.PLANNING) {
    return (
      <Box marginBottom={1}>
        <PlanModeDisplay agentState={agentState} />
      </Box>
    );
  }

  if (agentState.mode === AgentMode.EXECUTION) {
    return (
      <Box marginBottom={1}>
        <ExecutionModeDisplay agentState={agentState} />
      </Box>
    );
  }

  // アイドル状態では何も表示しない
  return null;
};

/**
 * プランモード統合Hook
 * 既存のuseGeminiStreamと連携するためのユーティリティ
 */
export const usePlanModeIntegration = () => {
  const { agentState, startPlanning, startExecution, resetToIdle } = useAgentState();
  
  const handlePlanCommand = React.useCallback(() => {
    startPlanning();
    return {
      type: 'info' as const,
      message: 'プランモードを開始しました。要件を教えてください。'
    };
  }, [startPlanning]);

  const isInPlanApprovalState = React.useCallback(() => {
    return agentState.mode === AgentMode.PLANNING && 
           agentState.step === 'presenting';
  }, [agentState]);

  const shouldBlockExecution = React.useCallback(() => {
    return agentState.mode === AgentMode.PLANNING;
  }, [agentState]);

  return {
    agentState,
    handlePlanCommand,
    isInPlanApprovalState,
    shouldBlockExecution,
    startExecution,
    resetToIdle
  };
};
import { useState, useCallback } from 'react';
import { 
  PlanApprovalData, 
  ApprovalAction, 
  PlanApprovalResult,
  AgentMode,
  Phase,
  StepState
} from '../types/agent-state.js';
import { useAgentState } from './useAgentState.js';

interface UsePlanApprovalOptions {
  onPlanApproved: (result: PlanApprovalResult) => void;
  onPlanRejected: (result: PlanApprovalResult) => void;
  onPlanEditRequested: (result: PlanApprovalResult) => void;
}

/**
 * プラン承認機能のHook
 * プランの提示、承認処理、実行モードへの移行を管理
 */
export const usePlanApproval = (options: UsePlanApprovalOptions) => {
  const { onPlanApproved, onPlanRejected, onPlanEditRequested } = options;
  const { agentState, transitionTo, getCurrentContext } = useAgentState();
  
  // 承認UI表示状態
  const [showApprovalUI, setShowApprovalUI] = useState(false);
  const [pendingPlanData, setPendingPlanData] = useState<PlanApprovalData | null>(null);
  const [isProcessingApproval, setIsProcessingApproval] = useState(false);
  
  // ループ回数追跡
  const [detectionCount, setDetectionCount] = useState(0);
  const MAX_DETECTION_ATTEMPTS = 5;

  // detectPlanCompletion関数は削除済み - plan_completeツールのみでトリガー

  /**
   * plan_completeツール完了時に承認UIを表示
   */
  const triggerApprovalFromPlanComplete = useCallback((planContent: string) => {
    console.log('[Plan Approval] Triggered by plan_complete tool');
    
    if (agentState.mode === AgentMode.PLANNING) {
      const context = getCurrentContext();
      
      // コンテキストからプランデータを作成
      const planData: PlanApprovalData = {
        requirements: context.requirements?.analyzed || ['AIによる分析内容'],
        design: {
          architecture: context.design?.architecture || 'AI提案の設計',
          technologies: context.design?.technologies || [],
          plan: context.design?.plan || planContent.substring(0, 500) + '...'
        },
        estimatedTime: extractEstimatedTime(planContent),
        riskAssessment: extractRiskAssessment(planContent)
      };

      console.log('[Plan Approval] Creating plan data:', planData);
      setPendingPlanData(planData);
      setShowApprovalUI(true);
      setDetectionCount(0); // リセット
      
      // 設計フェーズのプレゼンテーション段階に移行
      transitionTo(AgentMode.PLANNING, Phase.DESIGN, StepState.PRESENTING, 'Plan ready for approval');
      return true;
    }
    
    return false;
  }, [agentState.mode, getCurrentContext, transitionTo]);

  /**
   * 承認アクションの処理
   */
  const handleApprovalAction = useCallback(async (action: ApprovalAction) => {
    if (!pendingPlanData || isProcessingApproval) return;

    setIsProcessingApproval(true);

    const result: PlanApprovalResult = {
      action,
      comments: undefined // 将来的にユーザーコメント機能を追加可能
    };

    try {
      switch (action) {
        case 'approve':
          // 実行モードへ移行
          transitionTo(AgentMode.EXECUTION, Phase.IMPLEMENTATION, StepState.THINKING, 'Plan approved by user');
          setShowApprovalUI(false);
          setPendingPlanData(null);
          onPlanApproved(result);
          break;

        case 'reject':
          // アイドル状態に戻る
          transitionTo(AgentMode.IDLE, Phase.REQUIREMENTS, StepState.LISTENING, 'Plan rejected by user');
          setShowApprovalUI(false);
          setPendingPlanData(null);
          onPlanRejected(result);
          break;

        case 'edit':
          // 設計フェーズの聞く状態に戻る（編集モード）
          transitionTo(AgentMode.PLANNING, Phase.DESIGN, StepState.LISTENING, 'Plan edit requested by user');
          setShowApprovalUI(false);
          // プランデータは保持して編集に備える
          onPlanEditRequested(result);
          break;

        default:
          console.warn('Unknown approval action:', action);
      }
    } catch (error) {
      console.error('Error processing approval action:', error);
    } finally {
      setIsProcessingApproval(false);
    }
  }, [pendingPlanData, isProcessingApproval, transitionTo, onPlanApproved, onPlanRejected, onPlanEditRequested]);

  /**
   * 承認UIのリセット
   */
  const resetApprovalUI = useCallback(() => {
    setShowApprovalUI(false);
    setPendingPlanData(null);
    setIsProcessingApproval(false);
  }, []);

  /**
   * プラン編集完了時の処理
   */
  const onPlanEditCompleted = useCallback((updatedPlan: PlanApprovalData) => {
    setPendingPlanData(updatedPlan);
    setShowApprovalUI(true);
    transitionTo(AgentMode.PLANNING, Phase.DESIGN, StepState.PRESENTING, 'Plan updated, ready for approval');
  }, [transitionTo]);

  return {
    // 状態
    showApprovalUI,
    pendingPlanData,
    isProcessingApproval,
    
    // アクション
    triggerApprovalFromPlanComplete,
    handleApprovalAction,
    resetApprovalUI,
    onPlanEditCompleted,
    
    // 現在のエージェント状態
    agentState
  };
};

/**
 * コンテンツから予想実装時間を抽出
 */
const extractEstimatedTime = (content: string): string | undefined => {
  const timePatterns = [
    /予想.*?時間.*?(\d+.*?[時分])/i,
    /実装時間.*?(\d+.*?[時分])/i,
    /estimated.*?time.*?(\d+.*?[hm])/i
  ];

  for (const pattern of timePatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
};

/**
 * コンテンツからリスク評価を抽出
 */
const extractRiskAssessment = (content: string): string | undefined => {
  const riskPatterns = [
    /リスク.*?[:：]\s*(.+)/i,
    /risk.*?[:：]\s*(.+)/i,
    /注意点.*?[:：]\s*(.+)/i
  ];

  for (const pattern of riskPatterns) {
    const match = content.match(pattern);
    if (match) {
      return match[1].split('\n')[0]; // 最初の行のみを取得
    }
  }

  return undefined;
};
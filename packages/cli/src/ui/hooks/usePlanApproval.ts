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

  /**
   * プラン完了の検出と承認UIの表示
   */
  const detectPlanCompletion = useCallback((content: string) => {
    // 検出試行回数をインクリメント
    setDetectionCount(prev => prev + 1);
    
    console.log(`[Plan Approval] Detection attempt ${detectionCount + 1}/${MAX_DETECTION_ATTEMPTS}`);
    console.log('[Plan Approval] Content:', content.substring(0, 300) + '...');
    
    // プラン完了を示すキーワードを検出
    const completionKeywords = [
      '## 設計完了',
      '## Plan Complete',
      'Ready for approval',
      'プラン提示',
      '承認をお願いします',
      'Plan ready for review'
    ];

    const hasCompletionKeyword = completionKeywords.some(keyword => 
      content.includes(keyword)
    );

    console.log('[Plan Approval] Completion keyword found:', hasCompletionKeyword);
    console.log('[Plan Approval] Agent mode:', agentState.mode);

    if (hasCompletionKeyword && agentState.mode === AgentMode.PLANNING) {
      const context = getCurrentContext();
      
      // コンテキストからプランデータを作成（部分的でもOK）
      const planData: PlanApprovalData = {
        requirements: context.requirements?.analyzed || 
          [content.includes('要件') ? '要件分析完了' : 'AIによる分析内容'],
        design: {
          architecture: context.design?.architecture || 
            (content.includes('アーキテクチャ') ? 'アーキテクチャ設計完了' : 'AI提案の設計'),
          technologies: context.design?.technologies || 
            (content.includes('技術') ? ['提案技術スタック'] : []),
          plan: context.design?.plan || content.substring(0, 500) + '...'
        },
        estimatedTime: extractEstimatedTime(content),
        riskAssessment: extractRiskAssessment(content)
      };

      console.log('[Plan Approval] Creating plan data:', planData);
      setPendingPlanData(planData);
      setShowApprovalUI(true);
      setDetectionCount(0); // リセット
      
      // 設計フェーズのプレゼンテーション段階に移行
      transitionTo(AgentMode.PLANNING, Phase.DESIGN, StepState.PRESENTING, 'Plan ready for approval');
      return true;
    }
    
    // 最大試行回数に達した場合の強制表示
    if (detectionCount >= MAX_DETECTION_ATTEMPTS && 
        agentState.mode === AgentMode.PLANNING && 
        !showApprovalUI) {
      console.log('[Plan Approval] Max attempts reached, forcing approval UI');
      
      const context = getCurrentContext();
      const forcedPlanData: PlanApprovalData = {
        requirements: ['AIによる深層分析完了'],
        design: {
          architecture: 'AI提案の設計アーキテクチャ',
          technologies: ['提案された技術スタック'],
          plan: content || 'AIが作成した実装計画'
        },
        estimatedTime: '詳細検討中',
        riskAssessment: '標準的なリスク'
      };
      
      setPendingPlanData(forcedPlanData);
      setShowApprovalUI(true);
      setDetectionCount(0); // リセット
      transitionTo(AgentMode.PLANNING, Phase.DESIGN, StepState.PRESENTING, 'Plan forced for approval');
      return true;
    }
    
    return false;
  }, [agentState.mode, getCurrentContext, transitionTo, detectionCount, showApprovalUI]);

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
    detectPlanCompletion,
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
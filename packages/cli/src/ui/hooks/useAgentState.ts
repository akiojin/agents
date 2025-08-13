import { useState, useCallback, useRef } from 'react';
import { 
  AgentState, 
  AgentMode, 
  Phase, 
  StepState, 
  StateTransition,
  RequirementsContext,
  DesignContext,
  ImplementationContext
} from '../types/agent-state.js';

/**
 * エージェント状態管理Hook
 * プランモード・実行モードの状態遷移を管理
 */
export const useAgentState = () => {
  const sessionIdRef = useRef<string>(Date.now().toString());
  
  const [agentState, setAgentState] = useState<AgentState>({
    mode: AgentMode.IDLE,
    phase: Phase.REQUIREMENTS,
    step: StepState.LISTENING,
    context: {},
    history: [],
    sessionId: sessionIdRef.current,
    startTime: Date.now()
  });

  /**
   * 状態遷移
   */
  const transitionTo = useCallback((
    mode: AgentMode, 
    phase: Phase, 
    step: StepState,
    reason?: string
  ) => {
    setAgentState(prev => {
      const transition: StateTransition = {
        from: {
          mode: prev.mode,
          phase: prev.phase,
          step: prev.step
        },
        to: { mode, phase, step },
        timestamp: Date.now(),
        reason
      };

      return {
        ...prev,
        mode,
        phase,
        step,
        history: [...prev.history, transition]
      };
    });
  }, []);

  /**
   * 要件コンテキストの更新
   */
  const updateRequirements = useCallback((data: Partial<RequirementsContext>) => {
    setAgentState(prev => ({
      ...prev,
      context: {
        ...prev.context,
        requirements: {
          ...prev.context.requirements,
          ...data
        } as RequirementsContext
      }
    }));
  }, []);

  /**
   * 設計コンテキストの更新
   */
  const updateDesign = useCallback((data: Partial<DesignContext>) => {
    setAgentState(prev => ({
      ...prev,
      context: {
        ...prev.context,
        design: {
          ...prev.context.design,
          ...data
        } as DesignContext
      }
    }));
  }, []);

  /**
   * 実装コンテキストの更新
   */
  const updateImplementation = useCallback((data: Partial<ImplementationContext>) => {
    setAgentState(prev => ({
      ...prev,
      context: {
        ...prev.context,
        implementation: {
          ...prev.context.implementation,
          ...data
        } as ImplementationContext
      }
    }));
  }, []);

  /**
   * プランモードの開始
   */
  const startPlanning = useCallback(() => {
    transitionTo(AgentMode.PLANNING, Phase.REQUIREMENTS, StepState.LISTENING, 'User initiated planning');
  }, [transitionTo]);

  /**
   * 実行モードへの移行
   */
  const startExecution = useCallback(() => {
    transitionTo(AgentMode.EXECUTION, Phase.IMPLEMENTATION, StepState.THINKING, 'Plan approved');
  }, [transitionTo]);

  /**
   * アイドル状態への復帰
   */
  const resetToIdle = useCallback(() => {
    transitionTo(AgentMode.IDLE, Phase.REQUIREMENTS, StepState.LISTENING, 'Session reset');
  }, [transitionTo]);

  /**
   * 次のフェーズへの進行
   */
  const nextPhase = useCallback(() => {
    const { mode, phase } = agentState;
    
    if (mode === AgentMode.PLANNING) {
      if (phase === Phase.REQUIREMENTS) {
        transitionTo(AgentMode.PLANNING, Phase.DESIGN, StepState.LISTENING, 'Requirements completed');
      } else if (phase === Phase.DESIGN) {
        // 設計完了時は承認待ちになるので、外部から制御される
        console.log('Design phase completed, waiting for approval');
      }
    }
  }, [agentState, transitionTo]);

  /**
   * ステップの進行
   */
  const nextStep = useCallback(() => {
    const { step } = agentState;
    
    if (step === StepState.LISTENING) {
      transitionTo(agentState.mode, agentState.phase, StepState.THINKING, 'Input received');
    } else if (step === StepState.THINKING) {
      transitionTo(agentState.mode, agentState.phase, StepState.PRESENTING, 'Analysis completed');
    }
  }, [agentState, transitionTo]);

  /**
   * 現在のコンテキスト情報を取得
   */
  const getCurrentContext = useCallback(() => {
    const { context } = agentState;
    return {
      requirements: context.requirements,
      design: context.design,
      implementation: context.implementation
    };
  }, [agentState]);

  /**
   * セッション情報を取得
   */
  const getSessionInfo = useCallback(() => {
    const { sessionId, startTime, history } = agentState;
    return {
      sessionId,
      startTime,
      duration: Date.now() - startTime,
      transitionCount: history.length
    };
  }, [agentState]);

  return {
    // 状態
    agentState,
    
    // 状態遷移
    transitionTo,
    startPlanning,
    startExecution,
    resetToIdle,
    nextPhase,
    nextStep,
    
    // コンテキスト更新
    updateRequirements,
    updateDesign,
    updateImplementation,
    
    // 情報取得
    getCurrentContext,
    getSessionInfo
  };
};
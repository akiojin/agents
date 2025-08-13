import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { AgentState, Phase, StepState } from '../types/agent-state.js';

interface PlanModeDisplayProps {
  agentState: AgentState;
}

/**
 * プランモード表示コンポーネント
 * 現在のフェーズとステップを視覚的に表示
 */
export const PlanModeDisplay: React.FC<PlanModeDisplayProps> = ({ agentState }) => {
  const renderPhaseIndicator = () => {
    const phases = [
      { 
        key: Phase.REQUIREMENTS, 
        label: '要件定義', 
        icon: '📝',
        active: agentState.phase === Phase.REQUIREMENTS,
        completed: agentState.phase === Phase.DESIGN || 
                  (agentState.context.requirements?.confirmed ?? false)
      },
      { 
        key: Phase.DESIGN, 
        label: '設計', 
        icon: '🏗️',
        active: agentState.phase === Phase.DESIGN,
        completed: agentState.context.design?.confirmed ?? false
      }
    ];

    return (
      <Box flexDirection="row" alignItems="center">
        {phases.map((phase, index) => (
          <React.Fragment key={phase.key}>
            <Box alignItems="center">
              <Text color={
                phase.completed ? 'green' : 
                phase.active ? 'cyan' : 
                'gray'
              }>
                {phase.completed ? '✅' : phase.icon} {phase.label}
              </Text>
              {phase.active && agentState.step === StepState.THINKING && (
                <Box marginLeft={1}>
                  <Spinner type="dots" />
                </Box>
              )}
            </Box>
            {index < phases.length - 1 && (
              <Box marginX={1}>
                <Text color={phase.completed ? 'green' : 'gray'}> → </Text>
              </Box>
            )}
          </React.Fragment>
        ))}
      </Box>
    );
  };

  const renderStepStatus = () => {
    const steps = {
      [StepState.LISTENING]: { 
        icon: '👂', 
        text: 'ユーザーの入力を待っています', 
        showSpinner: false 
      },
      [StepState.THINKING]: { 
        icon: '🤔', 
        text: '分析・設計を進めています', 
        showSpinner: true 
      },
      [StepState.PRESENTING]: { 
        icon: '📊', 
        text: '結果を提示しています', 
        showSpinner: false 
      }
    };

    const currentStep = steps[agentState.step];

    return (
      <Box flexDirection="row" alignItems="center">
        <Text color="blue">
          {currentStep.icon} {currentStep.text}
        </Text>
        {currentStep.showSpinner && (
          <Box marginLeft={1}>
            <Spinner type="dots" />
          </Box>
        )}
      </Box>
    );
  };

  const renderPhaseDetails = () => {
    const { phase, context } = agentState;
    
    if (phase === Phase.REQUIREMENTS && context.requirements) {
      const { analyzed, clarifications } = context.requirements;
      
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline>要件定義の進捗:</Text>
          {analyzed && analyzed.length > 0 && (
            <Box flexDirection="column" marginLeft={2}>
              <Text dimColor>分析済み要件: {analyzed.length}件</Text>
              {analyzed.slice(0, 3).map((req, i) => (
                <Text key={i} dimColor>• {req}</Text>
              ))}
              {analyzed.length > 3 && (
                <Text dimColor>... 他 {analyzed.length - 3} 件</Text>
              )}
            </Box>
          )}
          {clarifications && clarifications.length > 0 && (
            <Box flexDirection="column" marginLeft={2}>
              <Text color="yellow">確認事項: {clarifications.length}件</Text>
            </Box>
          )}
        </Box>
      );
    }

    if (phase === Phase.DESIGN && context.design) {
      const { architecture, technologies } = context.design;
      
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text bold underline>設計の進捗:</Text>
          {architecture && (
            <Box marginLeft={2}>
              <Text dimColor>アーキテクチャ: 設計済み</Text>
            </Box>
          )}
          {technologies && technologies.length > 0 && (
            <Box marginLeft={2}>
              <Text dimColor>技術選定: {technologies.length}件</Text>
            </Box>
          )}
        </Box>
      );
    }

    return null;
  };

  const renderTimeInfo = () => {
    const duration = Date.now() - agentState.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    
    return (
      <Box marginTop={1}>
        <Text dimColor>
          経過時間: {minutes}分{seconds}秒 | 
          セッション: {agentState.sessionId.slice(-4)}
        </Text>
      </Box>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="cyan" padding={1}>
      {/* ヘッダー */}
      <Box marginBottom={1}>
        <Text bold color="cyan">📋 プランモード</Text>
      </Box>
      
      {/* フェーズインジケーター */}
      <Box marginBottom={1}>
        {renderPhaseIndicator()}
      </Box>
      
      {/* 現在のステップ */}
      <Box marginBottom={1}>
        {renderStepStatus()}
      </Box>
      
      {/* フェーズ詳細 */}
      {renderPhaseDetails()}
      
      {/* 時間情報 */}
      {renderTimeInfo()}
    </Box>
  );
};
import React from 'react';
import { Box, Text } from 'ink';
import SelectInput from 'ink-select-input';
import { PlanApprovalData, ApprovalAction } from '../types/agent-state.js';

interface PlanApprovalSelectProps {
  planData: PlanApprovalData;
  onSelect: (action: ApprovalAction) => void;
}

interface SelectItem {
  label: string;
  value: ApprovalAction;
}

/**
 * プラン承認選択UIコンポーネント
 * 既存の選択UIパターン（ink-select-input）を使用
 */
export const PlanApprovalSelect: React.FC<PlanApprovalSelectProps> = ({ 
  planData, 
  onSelect 
}) => {
  // 選択肢の定義
  const items: SelectItem[] = [
    {
      label: '✅ プランを承認して実行',
      value: 'approve'
    },
    {
      label: '❌ プランを拒否',
      value: 'reject'
    },
    {
      label: '✏️  プランを編集',
      value: 'edit'
    }
  ];

  const handleSelect = (item: SelectItem) => {
    onSelect(item.value);
  };

  const renderPlanDetails = () => {
    const { requirements, design, estimatedTime, riskAssessment } = planData;

    return (
      <>
        {/* 要件定義 */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline color="cyan">📝 要件定義:</Text>
          <Box flexDirection="column" marginLeft={2}>
            {requirements.map((req, i) => (
              <Text key={i} dimColor>• {req}</Text>
            ))}
          </Box>
        </Box>

        {/* アーキテクチャ */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline color="cyan">🏗️  アーキテクチャ:</Text>
          <Box marginLeft={2}>
            <Text dimColor>{design.architecture}</Text>
          </Box>
        </Box>

        {/* 使用技術 */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline color="cyan">⚙️  使用技術:</Text>
          <Box flexDirection="column" marginLeft={2}>
            {design.technologies.map((tech, i) => (
              <Text key={i} dimColor>• {tech}</Text>
            ))}
          </Box>
        </Box>

        {/* 実装計画 */}
        <Box flexDirection="column" marginBottom={1}>
          <Text bold underline color="cyan">📋 実装計画:</Text>
          <Box marginLeft={2}>
            <Text dimColor>{design.plan}</Text>
          </Box>
        </Box>

        {/* 予想時間（オプション） */}
        {estimatedTime && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold underline color="yellow">⏱️  予想実装時間:</Text>
            <Box marginLeft={2}>
              <Text dimColor>{estimatedTime}</Text>
            </Box>
          </Box>
        )}

        {/* リスク評価（オプション） */}
        {riskAssessment && (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold underline color="red">⚠️  リスク評価:</Text>
            <Box marginLeft={2}>
              <Text dimColor>{riskAssessment}</Text>
            </Box>
          </Box>
        )}
      </>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
      {/* タイトル */}
      <Box marginBottom={2}>
        <Text bold color="yellow">📋 プラン承認</Text>
      </Box>
      
      {/* プラン詳細 */}
      {renderPlanDetails()}
      
      {/* 区切り線 */}
      <Box marginY={1}>
        <Text color="gray">{'─'.repeat(60)}</Text>
      </Box>

      {/* 操作説明 */}
      <Box marginBottom={1}>
        <Text bold>アクションを選択してください（↑↓で選択、Enterで決定）:</Text>
      </Box>
      
      {/* 選択UI */}
      <Box>
        <SelectInput 
          items={items} 
          onSelect={handleSelect}
        />
      </Box>
      
      {/* ヘルプテキスト */}
      <Box marginTop={1}>
        <Text dimColor>
          • 承認: プランに基づいて実装を開始します
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          • 拒否: プランモードを終了し、最初からやり直します
        </Text>
      </Box>
      <Box>
        <Text dimColor>
          • 編集: プランの一部を修正します
        </Text>
      </Box>
    </Box>
  );
};
/**
 * ワークフロー承認UI - 既存のToolConfirmationMessageと同様のスタイルで実装
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';
import { Colors } from '../../cli/src/ui/colors.js';
import {
  RadioButtonSelect,
  RadioSelectItem,
} from '../../cli/src/ui/components/shared/RadioButtonSelect.js';
import { ExecutionPlan, Requirements } from './workflow-orchestrator';

// 承認の選択肢
export enum WorkflowConfirmationOutcome {
  Approve = 'approve',
  Reject = 'reject',
  ShowDetails = 'show_details',
  Cancel = 'cancel',
}

export interface WorkflowConfirmationDetails {
  type: 'workflow';
  title: string;
  plan: ExecutionPlan;
  onConfirm: (outcome: WorkflowConfirmationOutcome) => void;
}

export interface WorkflowConfirmationMessageProps {
  confirmationDetails: WorkflowConfirmationDetails;
  isFocused?: boolean;
  terminalWidth: number;
}

export const WorkflowConfirmationMessage: React.FC<
  WorkflowConfirmationMessageProps
> = ({
  confirmationDetails,
  isFocused = true,
  terminalWidth,
}) => {
  const { onConfirm, plan } = confirmationDetails;
  const childWidth = terminalWidth - 2; // パディング用

  useInput((_, key) => {
    if (!isFocused) return;
    if (key.escape) {
      onConfirm(WorkflowConfirmationOutcome.Cancel);
    }
  });

  const handleSelect = (item: WorkflowConfirmationOutcome) => onConfirm(item);

  const question = `実行計画を承認しますか？`;
  
  const options: Array<RadioSelectItem<WorkflowConfirmationOutcome>> = [
    {
      label: '承認して実行',
      value: WorkflowConfirmationOutcome.Approve,
    },
    {
      label: '拒否して中止',
      value: WorkflowConfirmationOutcome.Reject,
    },
    {
      label: '詳細を表示',
      value: WorkflowConfirmationOutcome.ShowDetails,
    },
    { 
      label: 'キャンセル (esc)', 
      value: WorkflowConfirmationOutcome.Cancel 
    },
  ];

  // 計画の概要を表示
  const planSummary = (
    <Box flexDirection="column" paddingX={1} marginLeft={1}>
      <Text color={Colors.AccentCyan}>📊 計画概要:</Text>
      <Box marginLeft={2} flexDirection="column">
        <Text>• タスク数: {plan.tasks.length}</Text>
        <Text>• 実行グループ数: {plan.executionGroups.length}</Text>
        <Text>• 推定実行時間: {plan.estimatedDuration || '不明'}分</Text>
        <Text>• 複雑度: {plan.requirements.estimatedComplexity}</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text color={Colors.AccentCyan}>📝 主要タスク:</Text>
      </Box>
      <Box marginLeft={2} flexDirection="column">
        {plan.tasks.slice(0, 5).map((task, index) => (
          <Text key={task.id}>
            {index + 1}. {task.description}
          </Text>
        ))}
        {plan.tasks.length > 5 && (
          <Text dimColor>... 他 {plan.tasks.length - 5} タスク</Text>
        )}
      </Box>
    </Box>
  );

  return (
    <Box flexDirection="column" padding={1} width={childWidth}>
      {/* タイトル */}
      <Box marginBottom={1}>
        <Text bold color={Colors.AccentGreen}>
          📋 実行計画の承認が必要です
        </Text>
      </Box>

      {/* 計画の概要 */}
      <Box flexGrow={1} flexShrink={1} overflow="hidden" marginBottom={1}>
        {planSummary}
      </Box>

      {/* 質問 */}
      <Box marginBottom={1} flexShrink={0}>
        <Text wrap="truncate">{question}</Text>
      </Box>

      {/* 選択肢 */}
      <Box flexShrink={0}>
        <RadioButtonSelect
          items={options}
          onSelect={handleSelect}
          isFocused={isFocused}
        />
      </Box>
    </Box>
  );
};
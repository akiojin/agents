/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Config,
  ToolCallRequestInfo,
  ExecutingToolCall,
  ScheduledToolCall,
  ValidatingToolCall,
  WaitingToolCall,
  CompletedToolCall,
  CancelledToolCall,
  CoreToolScheduler,
  OutputUpdateHandler,
  AllToolCallsCompleteHandler,
  ToolCallsUpdateHandler,
  Tool,
  ToolCall,
  ToolRegistry,
  Status as CoreStatus,
  EditorType,
} from '@indenscale/open-gemini-cli-core';
import { useCallback, useState, useMemo, useEffect } from 'react';
import {
  HistoryItemToolGroup,
  IndividualToolCallDisplay,
  ToolCallStatus,
  HistoryItemWithoutId,
} from '../types.js';

export type ScheduleFn = (
  request: ToolCallRequestInfo | ToolCallRequestInfo[],
  signal: AbortSignal,
) => void;
export type MarkToolsAsSubmittedFn = (callIds: string[]) => void;

export type TrackedScheduledToolCall = ScheduledToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedValidatingToolCall = ValidatingToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedWaitingToolCall = WaitingToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedExecutingToolCall = ExecutingToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedCompletedToolCall = CompletedToolCall & {
  responseSubmittedToGemini?: boolean;
};
export type TrackedCancelledToolCall = CancelledToolCall & {
  responseSubmittedToGemini?: boolean;
};

export type TrackedToolCall =
  | TrackedScheduledToolCall
  | TrackedValidatingToolCall
  | TrackedWaitingToolCall
  | TrackedExecutingToolCall
  | TrackedCompletedToolCall
  | TrackedCancelledToolCall;

export function useReactToolScheduler(
  onComplete: (tools: CompletedToolCall[]) => void,
  config: Config,
  setPendingHistoryItem: React.Dispatch<
    React.SetStateAction<HistoryItemWithoutId | null>
  >,
  getPreferredEditor: () => EditorType | undefined,
): [TrackedToolCall[], ScheduleFn, MarkToolsAsSubmittedFn] {
  const [toolCallsForDisplay, setToolCallsForDisplay] = useState<
    TrackedToolCall[]
  >([]);

  const outputUpdateHandler: OutputUpdateHandler = useCallback(
    (toolCallId, outputChunk) => {
      setPendingHistoryItem((prevItem) => {
        if (prevItem?.type === 'tool_group') {
          return {
            ...prevItem,
            tools: prevItem.tools.map((toolDisplay) =>
              toolDisplay.callId === toolCallId &&
              toolDisplay.status === ToolCallStatus.Executing
                ? { ...toolDisplay, resultDisplay: outputChunk }
                : toolDisplay,
            ),
          };
        }
        return prevItem;
      });

      setToolCallsForDisplay((prevCalls) =>
        prevCalls.map((tc) => {
          if (tc.request.callId === toolCallId && tc.status === 'executing') {
            const executingTc = tc as TrackedExecutingToolCall;
            return { ...executingTc, liveOutput: outputChunk };
          }
          return tc;
        }),
      );
    },
    [setPendingHistoryItem],
  );

  const allToolCallsCompleteHandler: AllToolCallsCompleteHandler = useCallback(
    async (completedToolCalls) => {
      // ツール実行結果を記憶システムに記録
      try {
        const { getMemoryManager } = await import('../../memory/memoryManager.js');
        const memoryManager = getMemoryManager();
        
        if (memoryManager.isAvailable()) {
          for (const toolCall of completedToolCalls) {
            if (toolCall.status === 'success') {
              // 成功したツール実行を記録
              const resultText = typeof toolCall.response.resultDisplay === 'string' 
                ? toolCall.response.resultDisplay.substring(0, 200)
                : JSON.stringify(toolCall.response.resultDisplay).substring(0, 200);
              
              const toolInfo = {
                tool: toolCall.request.name,
                args: toolCall.request.args,
                result: resultText,
                timestamp: new Date()
              };
              
              // 成功パターンとして記録
              await memoryManager.recordSuccess(
                `Tool ${toolCall.request.name} executed successfully`,
                [JSON.stringify(toolInfo)],
                { context: 'tool_execution' }
              );
            } else if (toolCall.status === 'error') {
              // エラーを記録
              const errorInfo = {
                tool: toolCall.request.name,
                args: toolCall.request.args,
                error: toolCall.response.resultDisplay,
                timestamp: new Date()
              };
              
              await memoryManager.recordError(
                `Tool ${toolCall.request.name} failed: ${toolCall.response.resultDisplay}`,
                undefined,
                errorInfo
              );
            }
          }
        }
      } catch (memoryError) {
        console.debug('Failed to record tool execution in memory:', memoryError);
      }
      
      onComplete(completedToolCalls);
    },
    [onComplete],
  );

  const toolCallsUpdateHandler: ToolCallsUpdateHandler = useCallback(
    (updatedCoreToolCalls: ToolCall[]) => {
      setToolCallsForDisplay((prevTrackedCalls) =>
        updatedCoreToolCalls.map((coreTc) => {
          const existingTrackedCall = prevTrackedCalls.find(
            (ptc) => ptc.request.callId === coreTc.request.callId,
          );
          const newTrackedCall: TrackedToolCall = {
            ...coreTc,
            responseSubmittedToGemini:
              existingTrackedCall?.responseSubmittedToGemini ?? false,
          } as TrackedToolCall;
          return newTrackedCall;
        }),
      );
    },
    [setToolCallsForDisplay],
  );

  // agentModeを取得してCoreToolSchedulerの再作成トリガーに使用
  // 直接configからagentModeを取得（存在しない場合は'idle'）
  const [agentMode, setAgentModeState] = useState<string>('idle');
  
  // configの変更を監視してagentModeを更新
  useEffect(() => {
    const mode = (config as any).agentMode || (config as any).getAgentMode?.() || 'idle';
    setAgentModeState(mode);
  }, [config]);
  
  // CoreToolSchedulerを即座に作成（非同期ではなく同期的に）
  const scheduler = useMemo(() => {
    try {
      // CoreToolSchedulerは内部でPromiseを管理するため、config.getToolRegistry()をそのまま渡す
      return new CoreToolScheduler({
        toolRegistry: config.getToolRegistry(), // Promise<ToolRegistry>を渡す
        outputUpdateHandler,
        onAllToolCallsComplete: allToolCallsCompleteHandler,
        onToolCallsUpdate: toolCallsUpdateHandler,
        approvalMode: config.getApprovalMode(),
        getPreferredEditor,
        config,
      });
    } catch (error) {
      console.error('[useReactToolScheduler] Failed to create scheduler:', error);
      return null;
    }
  }, [
    config,
    agentMode,
    outputUpdateHandler,
    allToolCallsCompleteHandler,
    toolCallsUpdateHandler,
    getPreferredEditor
  ]); // 依存配列に必要な項目を追加

  const schedule: ScheduleFn = useCallback(
    (
      request: ToolCallRequestInfo | ToolCallRequestInfo[],
      signal: AbortSignal,
    ) => {
      if (!scheduler) {
        console.error('[useReactToolScheduler] Cannot schedule tools: scheduler not ready');
        return;
      }
      scheduler.schedule(request, signal);
    },
    [scheduler],
  );

  const markToolsAsSubmitted: MarkToolsAsSubmittedFn = useCallback(
    (callIdsToMark: string[]) => {
      setToolCallsForDisplay((prevCalls) =>
        prevCalls.map((tc) =>
          callIdsToMark.includes(tc.request.callId)
            ? { ...tc, responseSubmittedToGemini: true }
            : tc,
        ),
      );
    },
    [],
  );

  return [toolCallsForDisplay, schedule, markToolsAsSubmitted];
}

/**
 * Maps a CoreToolScheduler status to the UI's ToolCallStatus enum.
 */
function mapCoreStatusToDisplayStatus(coreStatus: CoreStatus): ToolCallStatus {
  switch (coreStatus) {
    case 'scheduled':
      return ToolCallStatus.Pending;
    case 'validating':
      return ToolCallStatus.Pending;
    case 'awaiting_approval':
      return ToolCallStatus.Confirming;
    case 'executing':
      return ToolCallStatus.Executing;
    case 'success':
      return ToolCallStatus.Success;
    case 'error':
      return ToolCallStatus.Error;
    case 'cancelled':
      return ToolCallStatus.Canceled;
    default: {
      const exhaustiveCheck: never = coreStatus;
      return exhaustiveCheck;
    }
  }
}

/**
 * Convert a CoreToolScheduler ToolCall into its equivalent for display by the
 * UI.
 */
export function convertCoreToolCallToIndividualDisplay(
  tc: ToolCall,
): IndividualToolCallDisplay {
  const name = tc.request.name;

  return {
    callId: tc.request.callId,
    name,
    description: `${name} Tool Call`,
    resultDisplay: tc.status === 'success' ? tc.response.resultDisplay : undefined,
    status: mapCoreStatusToDisplayStatus(tc.status),
    confirmationDetails:
      tc.status === 'awaiting_approval' ? tc.confirmationDetails : undefined,
    renderOutputAsMarkdown: false,
  };
}

// mapToDisplayという名前のエクスポートも追加（後方互換性のため）
export const mapToDisplay = convertCoreToolCallToIndividualDisplay;

export default useReactToolScheduler;
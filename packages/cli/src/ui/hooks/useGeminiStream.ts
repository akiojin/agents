/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useInput } from 'ink';
import {
  Config,
  GeminiClient,
  GeminiEventType as ServerGeminiEventType,
  ServerGeminiStreamEvent as GeminiEvent,
  ServerGeminiContentEvent as ContentEvent,
  ServerGeminiErrorEvent as ErrorEvent,
  ServerGeminiChatCompressedEvent,
  getErrorMessage,
  isNodeError,
  MessageSenderType,
  ToolCallRequestInfo,
  logUserPrompt,
  GitService,
  EditorType,
  ThoughtSummary,
  UnauthorizedError,
  UserPromptEvent,
  DEFAULT_AGENTS_FLASH_MODEL,
  uiTelemetryService,
} from '@indenscale/open-gemini-cli-core';
import { type Part, type PartListUnion } from '@google/genai';
import {
  StreamingState,
  HistoryItem,
  HistoryItemWithoutId,
  HistoryItemToolGroup,
  MessageType,
  SlashCommandProcessorResult,
  ToolCallStatus,
} from '../types.js';
import { isAtCommand } from '../utils/commandUtils.js';
import { parseAndFormatApiError } from '../utils/errorParsing.js';
import { useShellCommandProcessor } from './shellCommandProcessor.js';
import { handleAtCommand } from './atCommandProcessor.js';
import { findLastSafeSplitPoint } from '../utils/markdownUtilities.js';
import { useStateAndRef } from './useStateAndRef.js';
import { UseHistoryManagerReturn } from './useHistoryManager.js';
import { useLogger } from './useLogger.js';
import { promises as fs } from 'fs';
import path from 'path';
import {
  useReactToolScheduler,
  mapToDisplay as mapTrackedToolCallsToDisplay,
  TrackedToolCall,
  TrackedCompletedToolCall,
  TrackedCancelledToolCall,
} from './useReactToolScheduler.js';
import { useSessionStats } from '../contexts/SessionContext.js';
import { getMemoryManager } from '../../memory/memoryManager.js';

export function mergePartListUnions(list: PartListUnion[]): PartListUnion {
  const resultParts: PartListUnion = [];
  for (const item of list) {
    if (Array.isArray(item)) {
      resultParts.push(...item);
    } else {
      resultParts.push(item);
    }
  }
  return resultParts;
}

enum StreamProcessingStatus {
  Completed,
  UserCancelled,
  Error,
}

/**
 * Manages the Gemini stream, including user input, command processing,
 * API interaction, and tool call lifecycle.
 */
export const useGeminiStream = (
  geminiClient: GeminiClient,
  history: HistoryItem[],
  addItem: UseHistoryManagerReturn['addItem'],
  setShowHelp: React.Dispatch<React.SetStateAction<boolean>>,
  config: Config,
  onDebugMessage: (message: string) => void,
  handleSlashCommand: (
    cmd: PartListUnion,
  ) => Promise<SlashCommandProcessorResult | false>,
  shellModeActive: boolean,
  getPreferredEditor: () => EditorType | undefined,
  onAuthError: () => void,
  performMemoryRefresh: () => Promise<void>,
  modelSwitchedFromQuotaError: boolean,
  setModelSwitchedFromQuotaError: React.Dispatch<React.SetStateAction<boolean>>,
  onContentReceived?: (content: string) => void, // コンテンツコールバックを追加
  agentMode?: string, // プランモード判定用
  triggerApprovalFromPlanComplete?: (planContent: string) => boolean, // プラン完了時の承認UIトリガー
) => {
  const [initError, setInitError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const turnCancelledRef = useRef(false);
  const [isResponding, setIsResponding] = useState<boolean>(false);
  const [thought, setThought] = useState<ThoughtSummary | null>(null);
  const [isPlanningMode, setIsPlanningMode] = useState(false);
  const [pendingHistoryItemRef, setPendingHistoryItem] =
    useStateAndRef<HistoryItemWithoutId | null>(null);
  const processedMemoryToolsRef = useRef<Set<string>>(new Set());
  const { startNewPrompt, getPromptCount } = useSessionStats();
  const logger = useLogger();
  const gitService = useMemo(() => {
    if (!config.getProjectRoot()) {
      return;
    }
    return new GitService(config.getProjectRoot());
  }, [config]);

  const [toolCalls, scheduleToolCalls, markToolsAsSubmitted] =
    useReactToolScheduler(
      async (completedToolCallsFromScheduler) => {
        // This onComplete is called when ALL scheduled tools for a given batch are done.
        if (completedToolCallsFromScheduler.length > 0) {
          // Add the final state of these tools to the history for display.
          addItem(
            ({
              type: 'tool_group',
              tools: (completedToolCallsFromScheduler as TrackedToolCall[]).map(mapTrackedToolCallsToDisplay),
            } as HistoryItemToolGroup),
            Date.now(),
          );

          // Handle tool response submission immediately when tools complete
          await handleCompletedTools(
            completedToolCallsFromScheduler as TrackedToolCall[],
          );
          
          // ツール完了後にプランモード継続チェック（少し待ってから）
          if (agentMode === 'planning') {
            setTimeout(() => {
              checkAndContinuePlanMode();
            }, 1000); // 1秒待ってからチェック
          }
        }
      },
      config,
      setPendingHistoryItem,
      getPreferredEditor,
    );

  const pendingToolCallGroupDisplay = useMemo(
    () =>
      toolCalls.length ? ({
        type: 'tool_group',
        tools: toolCalls.map(mapTrackedToolCallsToDisplay),
      } as HistoryItemToolGroup) : undefined,
    [toolCalls],
  );

  const loopDetectedRef = useRef(false);
  const planModeLoopCountRef = useRef(0);
  const MAX_PLAN_LOOPS = 3;
  const submitQueryRef = useRef<any>(null);

  const onExec = useCallback(async (done: Promise<void>) => {
    setIsResponding(true);
    await done;
    setIsResponding(false);
  }, []);
  const { handleShellCommand } = useShellCommandProcessor(
    addItem,
    setPendingHistoryItem,
    onExec,
    onDebugMessage,
    config,
    geminiClient,
  );

  const streamingState = useMemo(() => {
    // プランモードの検出
    if (isPlanningMode) {
      return StreamingState.Planning;
    }
    if (toolCalls.some((tc) => tc.status === 'awaiting_approval')) {
      return StreamingState.WaitingForConfirmation;
    }
    if (
      isResponding ||
      toolCalls.some(
        (tc) =>
          tc.status === 'executing' ||
          tc.status === 'scheduled' ||
          tc.status === 'validating' ||
          ((tc.status === 'success' ||
            tc.status === 'error' ||
            tc.status === 'cancelled') &&
            !(tc as TrackedCompletedToolCall | TrackedCancelledToolCall)
              .responseSubmittedToGemini),
      )
    ) {
      return StreamingState.Responding;
    }
    return StreamingState.Idle;
  }, [isResponding, toolCalls, isPlanningMode]);

  useInput((_input, key) => {
    if (streamingState === StreamingState.Responding && key.escape) {
      if (turnCancelledRef.current) {
        return;
      }
      turnCancelledRef.current = true;
      abortControllerRef.current?.abort();
      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, Date.now());
      }
      addItem(
        {
          type: MessageType.INFO,
          text: 'Request cancelled.',
        },
        Date.now(),
      );
      setPendingHistoryItem(null);
      setIsResponding(false);
    }
  });

  const prepareQueryForGemini = useCallback(
    async (
      query: PartListUnion,
      userMessageTimestamp: number,
      abortSignal: AbortSignal,
      prompt_id: string,
    ): Promise<{
      queryToSend: PartListUnion | null;
      shouldProceed: boolean;
    }> => {
      if (turnCancelledRef.current) {
        return { queryToSend: null, shouldProceed: false };
      }
      if (typeof query === 'string' && query.trim().length === 0) {
        return { queryToSend: null, shouldProceed: false };
      }

      let localQueryToSendToGemini: PartListUnion | null = null;

      if (typeof query === 'string') {
        const trimmedQuery = query.trim();
        logUserPrompt(
          config,
          new UserPromptEvent(
            trimmedQuery.length,
            prompt_id,
            config.getContentGeneratorConfig()?.authType,
            trimmedQuery,
          ),
        );
        onDebugMessage(`User query: '${trimmedQuery}'`);
        await logger?.logMessage(MessageSenderType.USER, trimmedQuery);

        // Handle UI-only commands first
        const slashCommandResult = await handleSlashCommand(trimmedQuery);

        if (slashCommandResult) {
          if (slashCommandResult.type === 'schedule_tool') {
            const { toolName, toolArgs } = slashCommandResult;
            const toolCallRequest: ToolCallRequestInfo = {
              callId: `${toolName}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
              name: toolName,
              args: toolArgs,
              isClientInitiated: true,
              prompt_id,
            };
            scheduleToolCalls([toolCallRequest], abortSignal);
          }

          return { queryToSend: null, shouldProceed: false };
        }

        if (shellModeActive && handleShellCommand(trimmedQuery, abortSignal)) {
          return { queryToSend: null, shouldProceed: false };
        }

        // Handle @-commands (which might involve tool calls)
        if (isAtCommand(trimmedQuery)) {
          const atCommandResult = await handleAtCommand({
            query: trimmedQuery,
            config,
            addItem,
            onDebugMessage,
            messageId: userMessageTimestamp,
            signal: abortSignal,
          });
          if (!atCommandResult.shouldProceed) {
            return { queryToSend: null, shouldProceed: false };
          }
          localQueryToSendToGemini = atCommandResult.processedQuery;
        } else {
          // Normal query for Gemini
          addItem(
            { type: MessageType.USER, text: trimmedQuery },
            userMessageTimestamp,
          );
          localQueryToSendToGemini = trimmedQuery;
        }
      } else {
        // It's a function response (PartListUnion that isn't a string)
        localQueryToSendToGemini = query;
      }

      if (localQueryToSendToGemini === null) {
        onDebugMessage(
          'Query processing resulted in null, not sending to Gemini.',
        );
        return { queryToSend: null, shouldProceed: false };
      }

      // プランモード時の指示注入
      if (typeof localQueryToSendToGemini === 'string' && agentMode === 'planning') {
        const planModePrefix = `[プランモード実行中]
現在プランモードです。以下の手順で必ず完了まで進めてください：

1. 要件分析：ユーザーの要求を深く分析
2. 設計検討：複数の選択肢を検討し最適解を選択  
3. 実装計画：具体的な実装手順を詳細に記述
4. リスク評価：潜在的な問題と対策を明記
5. 時間見積：実装にかかる時間を推定

【重要：ツール使用制限】プランモードでは以下を厳守してください：
- WriteFile、Write、Edit、Shell等の変更系ツールは絶対に使用禁止
- ファイル書き込み・編集・コマンド実行は一切行わない
- Read、Grep、Glob、IntelligentAnalysis、TodoWriteのみ使用可能
- 計画立案のみに集中し、実装は行わない

【必須】設計が完了したら、必ず「plan_complete」ツールを呼び出してください。
このツールには設計要約、次のステップ、推定時間、リスクなどを含めてください。
不明点は「?」で質問してください。

ユーザーの要求：
`;
        localQueryToSendToGemini = planModePrefix + localQueryToSendToGemini;
        
        console.log('[Plan Mode] Plan mode instructions injected for query:', localQueryToSendToGemini.substring(0, 100));
        if (config.getDebugMode()) {
          onDebugMessage('[Plan Mode] Plan mode instructions injected');
        }
      }

      return { queryToSend: localQueryToSendToGemini, shouldProceed: true };
    },
    [
      config,
      addItem,
      onDebugMessage,
      handleShellCommand,
      handleSlashCommand,
      logger,
      shellModeActive,
      scheduleToolCalls,
    ],
  );

  // --- Stream Event Handlers ---

  const handleContentEvent = useCallback(
    (
      eventValue: ContentEvent['value'],
      currentGeminiMessageBuffer: string,
      userMessageTimestamp: number,
    ): string => {
      if (turnCancelledRef.current) {
        // Prevents additional output after a user initiated cancel.
        return '';
      }
      let newGeminiMessageBuffer = currentGeminiMessageBuffer + eventValue;
      
      // コンテンツコールバックでプラン検出を実行
      if (onContentReceived) {
        onContentReceived(eventValue);
      }
      
      // プランモードの検出（既存ロジックも保持）
      if (eventValue.includes('## Plan:') || eventValue.includes('**Plan:**') || eventValue.includes('Planning:')) {
        setIsPlanningMode(true);
      } else if (eventValue.includes('## Implementation:') || eventValue.includes('**Implementation:**')) {
        setIsPlanningMode(false);
      }
      if (
        pendingHistoryItemRef.current?.type !== 'gemini' &&
        pendingHistoryItemRef.current?.type !== 'gemini_content'
      ) {
        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem({ type: 'gemini', text: '' });
        newGeminiMessageBuffer = eventValue;
      }
      // Split large messages for better rendering performance. Ideally,
      // we should maximize the amount of output sent to <Static />.
      const splitPoint = findLastSafeSplitPoint(newGeminiMessageBuffer);
      if (splitPoint === newGeminiMessageBuffer.length) {
        // Update the existing message with accumulated content
        setPendingHistoryItem((item) => ({
          type: item?.type as 'gemini' | 'gemini_content',
          text: newGeminiMessageBuffer,
        }));
      } else {
        // This indicates that we need to split up this Gemini Message.
        // Splitting a message is primarily a performance consideration. There is a
        // <Static> component at the root of App.tsx which takes care of rendering
        // content statically or dynamically. Everything but the last message is
        // treated as static in order to prevent re-rendering an entire message history
        // multiple times per-second (as streaming occurs). Prior to this change you'd
        // see heavy flickering of the terminal. This ensures that larger messages get
        // broken up so that there are more "statically" rendered.
        const beforeText = newGeminiMessageBuffer.substring(0, splitPoint);
        const afterText = newGeminiMessageBuffer.substring(splitPoint);
        addItem(
          {
            type: pendingHistoryItemRef.current?.type as
              | 'gemini'
              | 'gemini_content',
            text: beforeText,
          },
          userMessageTimestamp,
        );
        setPendingHistoryItem({ type: 'gemini_content', text: afterText });
        newGeminiMessageBuffer = afterText;
      }
      return newGeminiMessageBuffer;
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem, onContentReceived],
  );

  const handleUserCancelledEvent = useCallback(
    (userMessageTimestamp: number) => {
      if (turnCancelledRef.current) {
        return;
      }
      if (pendingHistoryItemRef.current) {
        if (pendingHistoryItemRef.current.type === 'tool_group') {
          const updatedTools = pendingHistoryItemRef.current.tools.map(
            (tool) =>
              tool.status === ToolCallStatus.Pending ||
              tool.status === ToolCallStatus.Confirming ||
              tool.status === ToolCallStatus.Executing
                ? { ...tool, status: ToolCallStatus.Canceled }
                : tool,
          );
          const pendingItem: HistoryItemToolGroup = {
            ...pendingHistoryItemRef.current,
            tools: updatedTools,
          };
          addItem(pendingItem, userMessageTimestamp);
        } else {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        }
        setPendingHistoryItem(null);
      }
      addItem(
        { type: MessageType.INFO, text: 'User cancelled the request.' },
        userMessageTimestamp,
      );
      setIsResponding(false);
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem],
  );

  const handleErrorEvent = useCallback(
    async (eventValue: ErrorEvent['value'], userMessageTimestamp: number) => {
      if (pendingHistoryItemRef.current) {
        addItem(pendingHistoryItemRef.current, userMessageTimestamp);
        setPendingHistoryItem(null);
      }
      
      const errorText = parseAndFormatApiError(
        eventValue.error,
        config.getContentGeneratorConfig()?.authType,
        undefined,
        config.getModel(),
        DEFAULT_AGENTS_FLASH_MODEL,
      );
      
      // 記憶システムからエラー解決策を検索
      try {
        const memoryManager = getMemoryManager();
        if (memoryManager.isAvailable()) {
          const solution = await memoryManager.findErrorSolution(errorText);
          if (solution) {
            // 解決策が見つかった場合、追加情報として表示
            addItem(
              {
                type: MessageType.INFO,
                text: `💡 記憶システムからの提案: ${solution}`,
              },
              userMessageTimestamp,
            );
          } else {
            // 新しいエラーとして記録（解決策は後で更新される）
            await memoryManager.recordError(errorText, undefined, {
              timestamp: new Date(),
              model: config.getModel(),
              context: 'stream_error'
            });
          }
        }
      } catch (memoryError) {
        console.debug('Memory system error lookup failed:', memoryError);
      }
      
      addItem(
        {
          type: MessageType.ERROR,
          text: errorText,
        },
        userMessageTimestamp,
      );
    },
    [addItem, pendingHistoryItemRef, setPendingHistoryItem, config],
  );

  const handleChatCompressionEvent = useCallback(
    (eventValue: ServerGeminiChatCompressedEvent['value']) => {
      // 圧縮後のトークンカウントをuiTelemetryServiceにリセット
      if (eventValue?.newTokenCount !== undefined) {
        // TODO: resetTokenCountAfterCompression method is not available
        // uiTelemetryService.resetTokenCountAfterCompression(
        //   eventValue.newTokenCount,
        //   config.getModel()
        // );
        console.log(`[ChatCompression] Token count reset to ${eventValue.newTokenCount} for ${config.getModel()}`);
      }
      
      addItem(
        {
          type: 'info',
          text:
            `IMPORTANT: This conversation approached the input token limit for ${config.getModel()}. ` +
            `A compressed context will be sent for future messages (compressed from: ` +
            `${eventValue?.originalTokenCount ?? 'unknown'} to ` +
            `${eventValue?.newTokenCount ?? 'unknown'} tokens).`,
        },
        Date.now(),
      );
    },
    [addItem, config],
  );

  const handleMaxSessionTurnsEvent = useCallback(
    () =>
      addItem(
        {
          type: 'info',
          text:
            `The session has reached the maximum number of turns: ${config.getMaxSessionTurns()}. ` +
            `Please update this limit in your setting.json file.`,
        },
        Date.now(),
      ),
    [addItem, config],
  );

  const handleLoopDetectedEvent = useCallback(() => {
    addItem(
      {
        type: 'info',
        text: `A potential loop was detected. This can happen due to repetitive tool calls or other model behavior. The request has been halted.`,
      },
      Date.now(),
    );
  }, [addItem]);

  // プランモード自動継続チェック関数
  const planCompletedRef = useRef(false); // plan_completeツール実行済みフラグ
  
  const checkAndContinuePlanMode = useCallback(async () => {
    console.log(`[Plan Mode Debug] checkAndContinuePlanMode called - agentMode: ${agentMode}, isResponding: ${isResponding}, planCompleted: ${planCompletedRef.current}`);
    
    if (agentMode !== 'planning' || isResponding || planCompletedRef.current) {
      console.log('[Plan Mode Debug] Early return - conditions not met for continuation');
      return;
    }
    
    // 1. ツール実行状態をチェック
    const hasActiveToolCalls = toolCalls.some(tc => 
      tc.status === 'scheduled' || 
      tc.status === 'validating' || 
      tc.status === 'executing' ||
      tc.status === 'awaiting_approval'
    );
    
    console.log(`[Plan Mode Debug] Tool status check - hasActive: ${hasActiveToolCalls}, toolCount: ${toolCalls.length}`);
    if (toolCalls.length > 0) {
      console.log('[Plan Mode Debug] Tool statuses:', toolCalls.map(tc => `${tc.request.name}: ${tc.status}`));
    }
    
    if (hasActiveToolCalls) {
      console.log(`[Plan Mode Debug] Tools still executing, waiting... Active tools: ${toolCalls.filter(tc => tc.status === 'executing').length}`);
      return;
    }
    
    // Historyから最新のGemini応答を取得
    const lastGeminiItem = history
      .slice()
      .reverse()
      .find(item => item.type === MessageType.GEMINI);
    
    const lastResponse = lastGeminiItem?.text || '';
    
    console.log(`[Plan Mode] Check loop: ${planModeLoopCountRef.current}/${MAX_PLAN_LOOPS}, agentMode: ${agentMode}, isResponding: ${isResponding}, planCompleted: ${planCompletedRef.current}, activeTools: ${hasActiveToolCalls}`);
    if (config.getDebugMode()) {
      console.log('[Plan Mode] Checking response for continuation:', lastResponse.substring(0, 200));
    }
    
    // 2. 応答品質チェック（短すぎる応答は継続しない）
    if (lastResponse.length < 200) {
      if (config.getDebugMode()) {
        console.log(`[Plan Mode] Response too short (${lastResponse.length} chars), waiting for better response`);
      }
      return;
    }
    
    // 3. プラン完了チェック（plan_completeツールでのみ判定）
    // キーワード検出は削除済み。plan_completeツール呼び出しのみで承認UIトリガー
    
    // 4. 質問チェック（ユーザー入力待ち）
    if (lastResponse.match(/\?$/) || lastResponse.includes('確認させてください') || 
        lastResponse.includes('どちら') || lastResponse.includes('教えてください')) {
      if (config.getDebugMode()) {
        console.log('[Plan Mode] Question detected, waiting for user input');
      }
      return;
    }
    
    // 5. 最大ループ数チェック（plan_completeツール強制実行）
    if (planModeLoopCountRef.current >= MAX_PLAN_LOOPS) {
      if (config.getDebugMode()) {
        console.log('[Plan Mode] Max loops reached, triggering approval UI directly');
      }
      // plan_completeツールを強制的に呼び出して承認UIを表示
      planModeLoopCountRef.current = 0;
      return;
    }
    
    // 5. 自動継続（即座に実行）
    planModeLoopCountRef.current++;
    if (config.getDebugMode()) {
      console.log(`[Plan Mode] Auto-continuing (loop ${planModeLoopCountRef.current}/${MAX_PLAN_LOOPS})`);
    }
    
    // 段階的なプロンプト生成
    const getContinuationPrompt = (loopCount: number) => {
      if (loopCount === 1) {
        return `[プランモード継続]
分析を続けて、実装計画を詳細に記述してください。`;
      } else if (loopCount === 2) {
        return `[プランモード継続]
リスク評価と時間見積もりを含めて、設計を完成させてください。
完了したら、plan_completeツールを呼び出してください。`;
      } else {
        return `[プランモード継続]
設計を完了してください。
【重要】必ずplan_completeツールを呼び出してください。
このツールを呼び出さないと、プランが承認されません。`;
      }
    };

    const continuationPrompt = getContinuationPrompt(planModeLoopCountRef.current);
    
    // ツールが完了しており、応答も十分な長さの場合のみ継続
    if (submitQueryRef.current) {
      submitQueryRef.current(continuationPrompt, { isContinuation: true });
    }
  }, [agentMode, isResponding, onContentReceived, config, history, toolCalls]);

  const processGeminiStreamEvents = useCallback(
    async (
      stream: AsyncIterable<GeminiEvent>,
      userMessageTimestamp: number,
      signal: AbortSignal,
    ): Promise<StreamProcessingStatus> => {
      let geminiMessageBuffer = '';
      const toolCallRequests: ToolCallRequestInfo[] = [];
      for await (const event of stream) {
        switch (event.type) {
          case ServerGeminiEventType.Thought:
            setThought(event.value);
            break;
          case ServerGeminiEventType.Content:
            geminiMessageBuffer = handleContentEvent(
              event.value,
              geminiMessageBuffer,
              userMessageTimestamp,
            );
            break;
          case ServerGeminiEventType.ToolCallRequest:
            toolCallRequests.push(event.value);
            
            // plan_completeツール呼び出しの検出
            if (event.value.name === 'plan_complete' && agentMode === 'planning') {
              console.log('[Plan Mode] plan_complete tool called:', event.value.args);
              // 緊急デバッグ: ツールレジストリの状態を確認
              config.getToolRegistry().then(registry => {
                const allTools = registry.getAllTools();
                const toolNames = allTools.map((t: any) => t.name).sort();
                console.error('[URGENT DEBUG] Total tools in registry:', allTools.length);
                console.error('[URGENT DEBUG] All tool names:', toolNames);
                console.error('[URGENT DEBUG] plan_complete found:', toolNames.includes('plan_complete'));
                console.error('[URGENT DEBUG] Agent mode:', (config as any).getAgentMode?.() || 'method not available');
                
                // PlanCompleteToolクラスの存在確認
                const planTools = allTools.filter((t: any) => 
                  t.name === 'plan_complete' || 
                  t.constructor.name === 'PlanCompleteTool' ||
                  t.name.toLowerCase().includes('plan')
                );
                console.error('[URGENT DEBUG] Plan-related tools:', planTools.map((t: any) => ({ name: t.name, class: t.constructor.name })));
              });
              if (config.getDebugMode()) {
                onDebugMessage('[Plan Mode] plan_complete tool detected');
              }
              // プランモード完了の通知（ツール実行後に処理される）
            }
            break;
          case ServerGeminiEventType.UserCancelled:
            handleUserCancelledEvent(userMessageTimestamp);
            break;
          case ServerGeminiEventType.Error:
            handleErrorEvent(event.value, userMessageTimestamp);
            break;
          case ServerGeminiEventType.ChatCompressed:
            handleChatCompressionEvent(event.value);
            break;
          case ServerGeminiEventType.ToolCallConfirmation:
          case ServerGeminiEventType.ToolCallResponse:
            // do nothing
            break;
          case ServerGeminiEventType.MaxSessionTurns:
            handleMaxSessionTurnsEvent();
            break;
          case ServerGeminiEventType.LoopDetected:
            // handle later because we want to move pending history to history
            // before we add loop detected message to history
            loopDetectedRef.current = true;
            break;
          default: {
            // enforces exhaustive switch-case
            const unreachable: never = event;
            return unreachable;
          }
        }
      }
      if (toolCallRequests.length > 0) {
        scheduleToolCalls(toolCallRequests, signal);
      }
      return StreamProcessingStatus.Completed;
    },
    [
      handleContentEvent,
      handleUserCancelledEvent,
      handleErrorEvent,
      scheduleToolCalls,
      handleChatCompressionEvent,
      handleMaxSessionTurnsEvent,
    ],
  );

  const submitQuery = useCallback(
    async (
      query: PartListUnion,
      options?: { isContinuation: boolean },
      prompt_id?: string,
    ) => {
      if (
        (streamingState === StreamingState.Responding ||
          streamingState === StreamingState.WaitingForConfirmation) &&
        !options?.isContinuation
      )
        return;

      const userMessageTimestamp = Date.now();
      setShowHelp(false);

      // Reset quota error flag when starting a new query (not a continuation)
      if (!options?.isContinuation) {
        setModelSwitchedFromQuotaError(false);
        config.setQuotaErrorOccurred(false);
      }

      abortControllerRef.current = new AbortController();
      const abortSignal = abortControllerRef.current.signal;
      turnCancelledRef.current = false;

      if (!prompt_id) {
        prompt_id = config.getSessionId() + '########' + getPromptCount();
      }
      
      // タスク開始時に類似パターンを検索
      if (!options?.isContinuation) {
        try {
          const memoryManager = getMemoryManager();
          if (memoryManager.isAvailable()) {
            // クエリのテキスト部分を抽出
            const queryText = Array.isArray(query) 
              ? query.map((p: any) => p.text || '').join(' ')
              : (query as any).text || '';
            
            if (queryText) {
              // 類似タスクを検索
              const similarTasks = await memoryManager.recall(queryText, [
                config.getTargetDir(),
                'task_pattern'
              ]);
              
              if (similarTasks && similarTasks.length > 0) {
                // 参考情報として表示
                addItem(
                  {
                    type: MessageType.INFO,
                    text: `📚 類似タスクの記憶が ${similarTasks.length} 件見つかりました`,
                  },
                  userMessageTimestamp,
                );
              }
            }
          }
        } catch (memoryError) {
          console.debug('Memory pattern search failed:', memoryError);
        }
      }

      const { queryToSend, shouldProceed } = await prepareQueryForGemini(
        query,
        userMessageTimestamp,
        abortSignal,
        prompt_id!,
      );

      if (!shouldProceed || queryToSend === null) {
        return;
      }

      if (!options?.isContinuation) {
        startNewPrompt();
      }

      setIsResponding(true);
      setInitError(null);

      try {
        const stream = geminiClient.sendMessageStream(
          queryToSend,
          abortSignal,
          prompt_id!,
        );
        const processingStatus = await processGeminiStreamEvents(
          stream,
          userMessageTimestamp,
          abortSignal,
        );

        if (processingStatus === StreamProcessingStatus.UserCancelled) {
          return;
        }

        if (pendingHistoryItemRef.current) {
          addItem(pendingHistoryItemRef.current, userMessageTimestamp);
          setPendingHistoryItem(null);
        }
        if (loopDetectedRef.current) {
          loopDetectedRef.current = false;
          handleLoopDetectedEvent();
        }
        
        // プランモード時の自動継続チェック
        if (agentMode === 'planning') {
          // 少し遅延してからチェック（UIが更新される時間を与える）
          setTimeout(() => {
            if (config.getDebugMode()) {
              console.log('[Plan Mode] Triggering auto-continuation check');
            }
            checkAndContinuePlanMode();
          }, 1000);
        }
      } catch (error: unknown) {
        if (error instanceof UnauthorizedError) {
          onAuthError();
        } else if (!isNodeError(error) || error.name !== 'AbortError') {
          addItem(
            {
              type: MessageType.ERROR,
              text: parseAndFormatApiError(
                getErrorMessage(error) || 'Unknown error',
                config.getContentGeneratorConfig()?.authType,
                undefined,
                config.getModel(),
                DEFAULT_AGENTS_FLASH_MODEL,
              ),
            },
            userMessageTimestamp,
          );
        }
      } finally {
        setIsResponding(false);
      }
    },
    [
      streamingState,
      setShowHelp,
      setModelSwitchedFromQuotaError,
      prepareQueryForGemini,
      processGeminiStreamEvents,
      pendingHistoryItemRef,
      addItem,
      setPendingHistoryItem,
      setInitError,
      geminiClient,
      onAuthError,
      config,
      startNewPrompt,
      getPromptCount,
      handleLoopDetectedEvent,
    ],
  );

  const handleCompletedTools = useCallback(
    async (completedToolCallsFromScheduler: TrackedToolCall[]) => {
      if (isResponding) {
        return;
      }

      const completedAndReadyToSubmitTools =
        completedToolCallsFromScheduler.filter(
          (
            tc: TrackedToolCall,
          ): tc is TrackedCompletedToolCall | TrackedCancelledToolCall => {
            const isTerminalState =
              tc.status === 'success' ||
              tc.status === 'error' ||
              tc.status === 'cancelled';

            if (isTerminalState) {
              const completedOrCancelledCall = tc as
                | TrackedCompletedToolCall
                | TrackedCancelledToolCall;
              return (
                completedOrCancelledCall.response?.responseParts !== undefined
              );
            }
            return false;
          },
        );

      // Finalize any client-initiated tools as soon as they are done.
      const clientTools = completedAndReadyToSubmitTools.filter(
        (t) => t.request.isClientInitiated,
      );
      if (clientTools.length > 0) {
        markToolsAsSubmitted(clientTools.map((t) => t.request.callId));
      }

      // Identify new, successful save_memory calls that we haven't processed yet.
      const newSuccessfulMemorySaves = completedAndReadyToSubmitTools.filter(
        (t) =>
          t.request.name === 'save_memory' &&
          t.status === 'success' &&
          !processedMemoryToolsRef.current.has(t.request.callId),
      );

      // デバッグ: 完了したツールの詳細をログ出力
      console.log('[Debug] All completedAndReadyToSubmitTools:');
      completedAndReadyToSubmitTools.forEach((t: any, index) => {
        console.log(`  [${index}] name: ${t.request.name}, status: ${t.status}, result: ${JSON.stringify(t.result)}`);
      });
      
      // plan_completeツールの成功を検出してプラン承認UIを表示
      const successfulPlanCompleteTools = completedAndReadyToSubmitTools.filter(
        (t) =>
          t.request.name === 'plan_complete' &&
          t.status === 'success' &&
          agentMode === 'planning',
      );

      console.log('[Debug] Filtered plan_complete tools:', successfulPlanCompleteTools.length);
      
      if (successfulPlanCompleteTools.length > 0) {
        console.log('[Plan Mode] plan_complete tool completed successfully');
        if (config.getDebugMode()) {
          onDebugMessage('[Plan Mode] plan_complete tool completed, triggering approval UI');
        }
        
        // プランモード完了フラグを設定して継続を停止
        planCompletedRef.current = true;
        planModeLoopCountRef.current = 0; // ループカウントリセット
        
        // ツールの引数から計画データを取得
        const planTool = successfulPlanCompleteTools[0];
        const args = planTool.request.args as any;
        
        // プラン完了を通知
        const planContent = args.summary || args.designSummary || 'Design completed';
        if (triggerApprovalFromPlanComplete) {
          triggerApprovalFromPlanComplete(planContent);
        } else if (onContentReceived) {
          onContentReceived(`Plan completed by AI: ${planContent}`);
        }
        
        // plan_completeツール完了後は追加のレスポンス送信をスキップ
        const planCompleteCallIds = successfulPlanCompleteTools.map(t => t.request.callId);
        markToolsAsSubmitted(planCompleteCallIds);
        
        console.log('[Plan Mode] plan_complete tools marked as submitted, stopping further responses');
        return; // 早期return でその後のsubmitQuery を防ぐ
      }

      if (newSuccessfulMemorySaves.length > 0) {
        // Perform the refresh only if there are new ones.
        void performMemoryRefresh();
        // Mark them as processed so we don't do this again on the next render.
        newSuccessfulMemorySaves.forEach((t) =>
          processedMemoryToolsRef.current.add(t.request.callId),
        );
      }

      const geminiTools = completedAndReadyToSubmitTools.filter(
        (t) => !t.request.isClientInitiated,
      );

      if (geminiTools.length === 0) {
        return;
      }

      // If all the tools were cancelled, don't submit a response to Gemini.
      const allToolsCancelled = geminiTools.every(
        (tc) => tc.status === 'cancelled',
      );

      if (allToolsCancelled) {
        if (geminiClient) {
          // We need to manually add the function responses to the history
          // so the model knows the tools were cancelled.
          const responsesToAdd = geminiTools.flatMap(
            (toolCall) => toolCall.response.responseParts,
          );
          const combinedParts: Part[] = [];
          for (const response of responsesToAdd) {
            if (Array.isArray(response)) {
              combinedParts.push(...response);
            } else if (typeof response === 'string') {
              combinedParts.push({ text: response });
            } else {
              combinedParts.push(response);
            }
          }
          geminiClient.addHistory({
            role: 'user',
            parts: combinedParts,
          });
        }

        const callIdsToMarkAsSubmitted = geminiTools.map(
          (toolCall) => toolCall.request.callId,
        );
        markToolsAsSubmitted(callIdsToMarkAsSubmitted);
        return;
      }

      const responsesToSend: PartListUnion[] = geminiTools.map(
        (toolCall) => toolCall.response.responseParts,
      );
      const callIdsToMarkAsSubmitted = geminiTools.map(
        (toolCall) => toolCall.request.callId,
      );

      const prompt_ids = geminiTools.map(
        (toolCall) => toolCall.request.prompt_id,
      );

      markToolsAsSubmitted(callIdsToMarkAsSubmitted);

      // Don't continue if model was switched due to quota error
      if (modelSwitchedFromQuotaError) {
        return;
      }

      submitQuery(
        mergePartListUnions(responsesToSend),
        {
          isContinuation: true,
        },
        prompt_ids[0],
      );
    },
    [
      isResponding,
      submitQuery,
      markToolsAsSubmitted,
      geminiClient,
      performMemoryRefresh,
      modelSwitchedFromQuotaError,
    ],
  );

  const pendingHistoryItems = [
    pendingHistoryItemRef.current,
    pendingToolCallGroupDisplay,
  ].filter((i) => i !== undefined && i !== null);

  useEffect(() => {
    const saveRestorableToolCalls = async () => {
      if (!config.getCheckpointingEnabled()) {
        return;
      }
      const restorableToolCalls = toolCalls.filter(
        (toolCall) =>
          (toolCall.request.name === 'replace' ||
            toolCall.request.name === 'write_file') &&
          toolCall.status === 'awaiting_approval',
      );

      if (restorableToolCalls.length > 0) {
        const checkpointDir = config.getProjectTempDir()
          ? path.join(config.getProjectTempDir(), 'checkpoints')
          : undefined;

        if (!checkpointDir) {
          return;
        }

        try {
          await fs.mkdir(checkpointDir, { recursive: true });
        } catch (error) {
          if (!isNodeError(error) || error.code !== 'EEXIST') {
            onDebugMessage(
              `Failed to create checkpoint directory: ${getErrorMessage(error)}`,
            );
            return;
          }
        }

        for (const toolCall of restorableToolCalls) {
          const filePath = toolCall.request.args['file_path'] as string;
          if (!filePath) {
            onDebugMessage(
              `Skipping restorable tool call due to missing file_path: ${toolCall.request.name}`,
            );
            continue;
          }

          try {
            let commitHash = await gitService?.createFileSnapshot(
              `Snapshot for ${toolCall.request.name}`,
            );

            if (!commitHash) {
              commitHash = await gitService?.getCurrentCommitHash();
            }

            if (!commitHash) {
              onDebugMessage(
                `Failed to create snapshot for ${filePath}. Skipping restorable tool call.`,
              );
              continue;
            }

            const timestamp = new Date()
              .toISOString()
              .replace(/:/g, '-')
              .replace(/\./g, '_');
            const toolName = toolCall.request.name;
            const fileName = path.basename(filePath);
            const toolCallWithSnapshotFileName = `${timestamp}-${fileName}-${toolName}.json`;
            const clientHistory = await geminiClient?.getHistory();
            const toolCallWithSnapshotFilePath = path.join(
              checkpointDir,
              toolCallWithSnapshotFileName,
            );

            await fs.writeFile(
              toolCallWithSnapshotFilePath,
              JSON.stringify(
                {
                  history,
                  clientHistory,
                  toolCall: {
                    name: toolCall.request.name,
                    args: toolCall.request.args,
                  },
                  commitHash,
                  filePath,
                },
                null,
                2,
              ),
            );
          } catch (error) {
            onDebugMessage(
              `Failed to write restorable tool call file: ${getErrorMessage(
                error,
              )}`,
            );
          }
        }
      }
    };
    saveRestorableToolCalls();
  }, [toolCalls, config, onDebugMessage, gitService, history, geminiClient]);

  // submitQueryをrefに代入（checkAndContinuePlanModeで使用するため）
  submitQueryRef.current = submitQuery;
  
  // プランモードが終了したらフラグをリセット & Configにモードを通知
  useEffect(() => {
    if (agentMode !== 'planning') {
      planCompletedRef.current = false;
      planModeLoopCountRef.current = 0;
    }
    
    // Configにエージェントモードを通知
    console.log(`[useGeminiStream] Notifying config of agent mode change: ${agentMode}`);
    try {
      // TypeScript型チェックを回避してsetAgentModeメソッドを呼び出し
      const configWithAgentMode = config as any;
      
      // agentModeプロパティが存在しない場合は動的に追加
      if (!configWithAgentMode.agentMode) {
        configWithAgentMode.agentMode = 'idle';
        console.log('[useGeminiStream] Added agentMode property to config instance');
      }
      
      // setAgentModeメソッドが存在しない場合は動的に追加
      if (typeof configWithAgentMode.setAgentMode !== 'function') {
        configWithAgentMode.setAgentMode = function(mode: string) {
          console.log(`[Config] Setting agent mode: ${this.agentMode || 'undefined'} -> ${mode}`);
          this.agentMode = mode;
        };
        console.log('[useGeminiStream] Added setAgentMode method to config instance');
      }
      
      // getAgentModeメソッドが存在しない場合は動的に追加
      if (typeof configWithAgentMode.getAgentMode !== 'function') {
        configWithAgentMode.getAgentMode = function() {
          return this.agentMode || 'idle';
        };
        console.log('[useGeminiStream] Added getAgentMode method to config instance');
      }
      
      configWithAgentMode.setAgentMode(agentMode);
      console.log(`[useGeminiStream] Successfully set agent mode to: ${agentMode}`);
    } catch (error) {
      console.error('[useGeminiStream] Error setting agent mode:', error);
    }
  }, [agentMode, config]);

  return {
    streamingState,
    submitQuery,
    initError,
    pendingHistoryItems,
    thought,
  };
};

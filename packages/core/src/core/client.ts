/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EmbedContentParameters,
  GenerateContentConfig,
  Part,
  SchemaUnion,
  PartListUnion,
  Content,
  Tool,
  GenerateContentResponse,
} from '@google/genai';
import { getFolderStructure } from '../utils/getFolderStructure.js';
import {
  Turn,
  ServerGeminiStreamEvent,
  GeminiEventType,
  ChatCompressionInfo,
} from './turn.js';
import { Config } from '../config/config.js';
import { getCoreSystemPrompt, getCompressionPrompt, getDeepAgentSystemPrompt } from './prompts.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import { getResponseText } from '../utils/generateContentResponseUtilities.js';
import { checkNextSpeaker } from '../utils/nextSpeakerChecker.js';
import { reportError } from '../utils/errorReporting.js';
import { GeminiChat } from './geminiChat.js';
import { retryWithBackoff } from '../utils/retry.js';
import { getErrorMessage } from '../utils/errors.js';
import { isFunctionResponse } from '../utils/messageInspectors.js';
import { tokenLimit } from './tokenLimits.js';
import {
  AuthType,
  ContentGenerator,
  ContentGeneratorConfig,
  createContentGenerator,
} from './contentGenerator.js';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { LoopDetectionService } from '../services/loopDetectionService.js';
import { FileParserService, VLMService } from '../services/fileParserService.js';
import { CompositeVLMService } from '../services/vlmService.js';
import { getSessionManager } from '../utils/session-manager.js';
import * as path from 'path';

function isThinkingSupported(model: string) {
  if (model.startsWith('gemini-2.5')) return true;
  return false;
}

/**
 * Returns the index of the content after the fraction of the total characters in the history.
 *
 * Exported for testing purposes.
 */
export function findIndexAfterFraction(
  history: Content[],
  fraction: number,
): number {
  if (fraction <= 0 || fraction >= 1) {
    throw new Error('Fraction must be between 0 and 1');
  }

  const contentLengths = history.map(
    (content) => JSON.stringify(content).length,
  );

  const totalCharacters = contentLengths.reduce(
    (sum, length) => sum + length,
    0,
  );
  const targetCharacters = totalCharacters * fraction;

  let charactersSoFar = 0;
  for (let i = 0; i < contentLengths.length; i++) {
    charactersSoFar += contentLengths[i];
    if (charactersSoFar >= targetCharacters) {
      return i;
    }
  }
  return contentLengths.length;
}

export class GeminiClient {
  private contentGenerator?: ContentGenerator;
  private chat?: GeminiChat;
  private sessionTurnCount = 0;
  /**
   * This is the default token limit proportion used for all prompts.
   * Individual tools can override this on a per-tool basis with the
   * {@link SafetyConfig} parameter.
   */
  private readonly DEFAULT_TOKEN_LIMIT_PROPORTION = 0.8;
  private readonly generateContentConfig: GenerateContentConfig = {};
  private readonly embeddingModel: string = 'text-embedding-004';
  private readonly MAX_TURNS = 100;
  /**
   * Threshold for compression token count as a fraction of the model's token limit.
   * If the chat history exceeds this threshold, it will be compressed.
   * コンテキストがほぼ満杯（90%）になった時のみ圧縮を実行するように設定
   */
  private readonly COMPRESSION_TOKEN_THRESHOLD = 0.9;
  /**
   * The fraction of the latest chat history to keep. A value of 0.3
   * means that only the last 30% of the chat history will be kept after compression.
   */
  private readonly COMPRESSION_PRESERVE_THRESHOLD = 0.3;

  private readonly loopDetector: LoopDetectionService;
  private fileParserService: FileParserService;
  private vlmService?: VLMService;
  private lastPromptId?: string;

  constructor(private config: Config) {
    if (config.getProxy()) {
      setGlobalDispatcher(new ProxyAgent(config.getProxy() as string));
    }

    this.embeddingModel = config.getEmbeddingModel();
    this.loopDetector = new LoopDetectionService(config);
    
    // Initialize file parser service without VLM (will be set later)
    this.fileParserService = new FileParserService();
  }

  async initialize(contentGeneratorConfig: ContentGeneratorConfig) {
    this.contentGenerator = await createContentGenerator(
      contentGeneratorConfig,
      this.config,
      this.config.getSessionId(),
    );
    
    // Now initialize VLM service with the content generator
    this.vlmService = new CompositeVLMService(this.contentGenerator);
    this.fileParserService = new FileParserService(this.vlmService);
    
    // Memory APIの初期化（利用可能な場合）
    try {
      const memoryModule = await import('@agents/memory');
      const memoryAPI = memoryModule.getMemoryAPI();
      await memoryAPI.initialize();
      console.log('Memory API initialized successfully');
    } catch (error) {
      // Memory APIが利用できない場合は静かに無視
      console.debug('Memory API not available or failed to initialize:', error);
    }
    
    this.chat = await this.startChat();
  }

  getContentGenerator(): ContentGenerator {
    if (!this.contentGenerator) {
      throw new Error('Content generator not initialized');
    }
    return this.contentGenerator;
  }

  async addHistory(content: Content) {
    this.getChat().addHistory(content);
  }

  getChat(): GeminiChat {
    if (!this.chat) {
      throw new Error('Chat not initialized');
    }
    return this.chat;
  }

  isInitialized(): boolean {
    return this.chat !== undefined && this.contentGenerator !== undefined;
  }

  getHistory(): Content[] {
    return this.getChat().getHistory();
  }

  setHistory(history: Content[]) {
    this.getChat().setHistory(history);
  }

  async resetChat(): Promise<void> {
    this.chat = await this.startChat();
  }

  private async getEnvironment(): Promise<Part[]> {
    const cwd = this.config.getWorkingDir();
    const today = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const platform = process.platform;
    const folderStructure = await getFolderStructure(cwd, {
      fileService: this.config.getFileService(),
    });
    const context = `
  This is the Agents CLI. We are setting up the context for our chat.
  Today's date is ${today}.
  My operating system is: ${platform}
  I'm currently working in the directory: ${cwd}
  ${folderStructure}
          `.trim();

    const initialParts: Part[] = [{ text: context }];
    const toolRegistry = await this.config.getToolRegistry();

    // Add full file context if the flag is set
    if (this.config.getFullContext()) {
      try {
        const readManyFilesTool = toolRegistry.getTool(
          'read_many_files',
        ) as ReadManyFilesTool;
        if (readManyFilesTool) {
          // Read all files in the target directory
          const result = await readManyFilesTool.execute(
            {
              paths: ['**/*'], // Read everything recursively
              useDefaultExcludes: true, // Use default excludes
            },
            AbortSignal.timeout(30000),
          );
          if (result.llmContent) {
            initialParts.push({
              text: `\n--- Full File Context ---\n${result.llmContent}`,
            });
          } else {
            console.warn(
              'Full context requested, but read_many_files returned no content.',
            );
          }
        } else {
          console.warn(
            'Full context requested, but read_many_files tool not found.',
          );
        }
      } catch (error) {
        // Not using reportError here as it's a startup/config phase, not a chat/generation phase error.
        console.error('Error reading full file context:', error);
        initialParts.push({
          text: '\n--- Error reading full file context ---',
        });
      }
    }

    return initialParts;
  }

  private async startChat(extraHistory?: Content[]): Promise<GeminiChat> {
    const envParts = await this.getEnvironment();
    const toolRegistry = await this.config.getToolRegistry();
    const toolDeclarations = toolRegistry.getFunctionDeclarations();
    const tools: Tool[] = [{ functionDeclarations: toolDeclarations }];
    const history: Content[] = [
      {
        role: 'user',
        parts: envParts,
      },
      {
        role: 'model',
        parts: [{ text: 'Got it. Thanks for the context!' }],
      },
      ...(extraHistory ?? []),
    ];
    try {
      const userMemory = this.config.getUserMemory();
      
      // 記憶システムの統計情報を取得
      let memoryStats = null;
      try {
        // MemoryManagerが利用可能な場合のみ統計情報を取得
        const memoryModule = await import('@agents/memory');
        const memoryAPI = memoryModule.getMemoryAPI();
        if (memoryAPI && typeof memoryAPI.getStatistics === 'function') {
          const stats = await memoryAPI.getStatistics();
          memoryStats = stats;
        }
      } catch (error) {
        // 記憶システムが利用できない場合は無視
        console.debug('Memory statistics not available:', error);
      }
      
      // DeepAgentプロンプトを使用
      const systemInstruction = getDeepAgentSystemPrompt(userMemory, memoryStats);
      const generateContentConfigWithThinking = isThinkingSupported(
        this.config.getModel(),
      )
        ? {
            ...this.generateContentConfig,
            thinkingConfig: {
              includeThoughts: true,
            },
          }
        : this.generateContentConfig;
      return new GeminiChat(
        this.config,
        this.getContentGenerator(),
        {
          systemInstruction,
          ...generateContentConfigWithThinking,
          tools,
        },
        history,
      );
    } catch (error) {
      await reportError(
        error,
        'Error initializing Gemini chat session.',
        history,
        'startChat',
      );
      throw new Error(`Failed to initialize chat: ${getErrorMessage(error)}`);
    }
  }

  private async parseFilesFromContent(
    contents: Content[],
  ): Promise<Content[]> {
    const newContents: Content[] = [];
    for (const content of contents) {
      const newParts: Part[] = [];
      if (content.parts) {
        for (const part of content.parts) {
          if (
            'functionCall' in part &&
            part.functionCall &&
            part.functionCall.name === 'file_parser' &&
            part.functionCall.args &&
            typeof part.functionCall.args.path === 'string'
          ) {
            try {
              const filePath = part.functionCall.args.path;
              const markdown =
                await this.fileParserService.parseFileToMarkdown(filePath);
              const fileName = path.basename(filePath);
              newParts.push({
                text: `## Content from file: ${fileName}\n\n${markdown}`,
              });
            } catch (e) {
              newParts.push({
                text: `Error parsing file: ${getErrorMessage(e)}`,
              });
            }
          } else {
            newParts.push(part);
          }
        }
      }
      newContents.push({ ...content, parts: newParts });
    }
    return newContents;
  }

  async *sendMessageStream(
    request: PartListUnion,
    signal: AbortSignal,
    prompt_id: string,
    turns: number = this.MAX_TURNS,
    originalModel?: string,
  ): AsyncGenerator<ServerGeminiStreamEvent, Turn> {
    if (this.lastPromptId !== prompt_id) {
      this.loopDetector.reset();
      this.lastPromptId = prompt_id;
    }
    this.sessionTurnCount++;
    if (
      this.config.getMaxSessionTurns() > 0 &&
      this.sessionTurnCount > this.config.getMaxSessionTurns()
    ) {
      yield { type: GeminiEventType.MaxSessionTurns };
      return new Turn(this.getChat(), prompt_id);
    }
    // Ensure turns never exceeds MAX_TURNS to prevent infinite loops
    const boundedTurns = Math.min(turns, this.MAX_TURNS);
    if (!boundedTurns) {
      return new Turn(this.getChat(), prompt_id);
    }

    // Track the original model from the first call to detect model switching
    const initialModel = originalModel || this.config.getModel();

    const compressed = await this.tryCompressChat(prompt_id);

    if (compressed) {
      yield { type: GeminiEventType.ChatCompressed, value: compressed };
    }

    // Pre-process files before sending the message
    const requestParts = Array.isArray(request) ? request : [request];
    const processedRequest = await this.parseFilesFromContent([
      { role: 'user', parts: requestParts.map(part => typeof part === 'string' ? { text: part } : part) },
    ]);
    const finalRequest = processedRequest[0].parts;

    const turn = new Turn(this.getChat(), prompt_id);
    const resultStream = turn.run(finalRequest || [], signal);
    for await (const event of resultStream) {
      if (this.loopDetector.addAndCheck(event)) {
        yield { type: GeminiEventType.LoopDetected };
        return turn;
      }
      yield event;
    }
    if (!turn.pendingToolCalls.length && signal && !signal.aborted) {
      // Check if model was switched during the call (likely due to quota error)
      const currentModel = this.config.getModel();
      if (currentModel !== initialModel) {
        // Model was switched (likely due to quota error fallback)
        // Don't continue with recursive call to prevent unwanted Flash execution
        return turn;
      }

      const nextSpeakerCheck = await checkNextSpeaker(
        this.getChat(),
        this,
        signal,
      );
      if (nextSpeakerCheck?.next_speaker === 'model') {
        const nextRequest = [{ text: 'Please continue.' }];
        // This recursive call's events will be yielded out, but the final
        // turn object will be from the top-level call.
        yield* this.sendMessageStream(
          nextRequest,
          signal,
          prompt_id,
          boundedTurns - 1,
          initialModel,
        );
      }
    }
    return turn;
  }

  async generateJson(
    contents: Content[],
    schema: SchemaUnion,
    abortSignal: AbortSignal,
    model?: string,
    config: GenerateContentConfig = {},
  ): Promise<Record<string, unknown>> {
    // Use current model from config instead of hardcoded Flash model
    const modelToUse =
      model || this.config.getModel() || DEFAULT_GEMINI_FLASH_MODEL;
    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);
      const requestConfig = {
        abortSignal,
        ...this.generateContentConfig,
        ...config,
      };

      const processedContents = await this.parseFilesFromContent(contents);

      const apiCall = () =>
        this.getContentGenerator().generateContent({
          model: modelToUse,
          config: {
            ...requestConfig,
            systemInstruction,
            responseSchema: schema,
            responseMimeType: 'application/json',
          },
          contents: processedContents,
        });

      const result = await retryWithBackoff(apiCall, {
        authType: this.config.getContentGeneratorConfig()?.authType,
      });

      const text = getResponseText(result);
      if (!text) {
        const error = new Error(
          'API returned an empty response for generateJson.',
        );
        await reportError(
          error,
          'Error in generateJson: API returned an empty response.',
          contents,
          'generateJson-empty-response',
        );
        throw error;
      }
      try {
        return JSON.parse(text);
      } catch (parseError) {
        await reportError(
          parseError,
          'Failed to parse JSON response from generateJson.',
          {
            responseTextFailedToParse: text,
            originalRequestContents: contents,
          },
          'generateJson-parse',
        );
        throw new Error(
          `Failed to parse API response as JSON: ${getErrorMessage(parseError)}`,
        );
      }
    } catch (error) {
      if (abortSignal.aborted) {
        throw error;
      }

      // Avoid double reporting for the empty response case handled above
      if (
        error instanceof Error &&
        error.message === 'API returned an empty response for generateJson.'
      ) {
        throw error;
      }

      await reportError(
        error,
        'Error generating JSON content via API.',
        contents,
        'generateJson-api',
      );
      throw new Error(
        `Failed to generate JSON content: ${getErrorMessage(error)}`,
      );
    }
  }

  async generateContent(
    contents: Content[],
    generationConfig: GenerateContentConfig,
    abortSignal: AbortSignal,
    model?: string,
  ): Promise<GenerateContentResponse> {
    const modelToUse = model ?? this.config.getModel();
    const configToUse: GenerateContentConfig = {
      ...this.generateContentConfig,
      ...generationConfig,
    };

    try {
      const userMemory = this.config.getUserMemory();
      const systemInstruction = getCoreSystemPrompt(userMemory);

      const requestConfig = {
        abortSignal,
        ...configToUse,
        systemInstruction,
      };

      const processedContents = await this.parseFilesFromContent(contents);

      const apiCall = () =>
        this.getContentGenerator().generateContent({
          model: modelToUse,
          config: requestConfig,
          contents: processedContents,
        });

      const result = await retryWithBackoff(apiCall, {
        authType: this.config.getContentGeneratorConfig()?.authType,
      });
      return result;
    } catch (error: unknown) {
      if (abortSignal.aborted) {
        throw error;
      }

      await reportError(
        error,
        `Error generating content via API with model ${modelToUse}.`,
        {
          requestContents: contents,
          requestConfig: configToUse,
        },
        'generateContent-api',
      );
      throw new Error(
        `Failed to generate content with model ${modelToUse}: ${getErrorMessage(error)}`,
      );
    }
  }

  async generateEmbedding(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      return [];
    }
    const embedModelParams: EmbedContentParameters = {
      model: this.embeddingModel,
      contents: texts,
    };

    const embedContentResponse =
      await this.getContentGenerator().embedContent(embedModelParams);
    if (
      !embedContentResponse.embeddings ||
      embedContentResponse.embeddings.length === 0
    ) {
      throw new Error('No embeddings found in API response.');
    }

    if (embedContentResponse.embeddings.length !== texts.length) {
      throw new Error(
        `API returned a mismatched number of embeddings. Expected ${texts.length}, got ${embedContentResponse.embeddings.length}.`,
      );
    }

    return embedContentResponse.embeddings.map((embedding, index) => {
      const values = embedding.values;
      if (!values || values.length === 0) {
        throw new Error(
          `API returned an empty embedding for input text at index ${index}: "${texts[index]}"`,
        );
      }
      return values;
    });
  }

  async tryCompressChat(
    prompt_id: string,
    force: boolean = false,
  ): Promise<ChatCompressionInfo | null> {
    const curatedHistory = this.getChat().getHistory(true);

    // Regardless of `force`, don't do anything if the history is empty.
    if (curatedHistory.length === 0) {
      return null;
    }

    const model = this.config.getModel();

    const { totalTokens: originalTokenCount } =
      await this.getContentGenerator().countTokens({
        model,
        contents: curatedHistory,
      });
    if (originalTokenCount === undefined) {
      console.warn(`Could not determine token count for model ${model}.`);
      return null;
    }

    const modelTokenLimit = tokenLimit(model);
    const threshold = this.COMPRESSION_TOKEN_THRESHOLD * modelTokenLimit;
    const remainingTokens = modelTokenLimit - originalTokenCount;
    const usagePercentage = Math.round(originalTokenCount / modelTokenLimit * 100);
    
    // デバッグログを追加（より詳細に）
    console.log(`[Compression Debug] Model: ${model}, Token Limit: ${modelTokenLimit}`);
    console.log(`[Compression Debug] Current Usage: ${originalTokenCount}/${modelTokenLimit} (${usagePercentage}%)`);
    console.log(`[Compression Debug] Remaining: ${remainingTokens} tokens`);
    console.log(`[Compression Debug] Compression Threshold: ${threshold} (${Math.round(this.COMPRESSION_TOKEN_THRESHOLD * 100)}%)`);
    console.log(`[Compression Debug] Force flag: ${force}`);
    
    // 圧縮条件を判定
    const shouldCompress = force || originalTokenCount >= threshold;
    
    if (!shouldCompress) {
      console.log(`[Compression Debug] Skipping compression: usage ${usagePercentage}% is below threshold ${Math.round(this.COMPRESSION_TOKEN_THRESHOLD * 100)}%`);
      return null;
    }

    console.log(`[Compression Debug] Starting compression...`);

    let compressBeforeIndex = findIndexAfterFraction(
      curatedHistory,
      1 - this.COMPRESSION_PRESERVE_THRESHOLD,
    );
    // Find the first user message after the index. This is the start of the next turn.
    while (
      compressBeforeIndex < curatedHistory.length &&
      (curatedHistory[compressBeforeIndex]?.role === 'model' ||
        isFunctionResponse(curatedHistory[compressBeforeIndex]))
    ) {
      compressBeforeIndex++;
    }

    const historyToCompress = curatedHistory.slice(0, compressBeforeIndex);
    const historyToKeep = curatedHistory.slice(compressBeforeIndex);

    // セッションマネージャーを取得
    const sessionManager = getSessionManager();
    
    // 圧縮前の履歴をセッションに保存
    sessionManager.updateHistory(curatedHistory);
    sessionManager.updateTokenCount(originalTokenCount);

    // Memory APIに圧縮前の重要情報を保存（利用可能な場合）
    try {
      const memoryModule = await import('@agents/memory');
      const memoryAPI = memoryModule.getMemoryAPI();
      
      // 圧縮イベントをメモリに記録
      await memoryAPI.recordEvent({
        type: 'discovery',
        content: {
          event: 'compression_start',
          sessionId: sessionManager.getCurrentSessionId(),
          originalTokenCount,
          historyLength: curatedHistory.length,
          compressBeforeIndex,
          preservedMessages: historyToKeep.length,
        },
        context: {
          model: model,
          threshold: this.COMPRESSION_TOKEN_THRESHOLD,
        },
        timestamp: new Date(),
      });
      
      console.log('[Compression] Saved compression event to Memory API');
    } catch (error) {
      // Memory APIが利用できない場合は静かに無視
      console.debug('[Compression] Memory API not available:', error);
    }

    this.getChat().setHistory(historyToCompress);

    const { text: summary } = await this.getChat().sendMessage(
      {
        message: {
          text: 'First, reason in your scratchpad. Then, generate the <state_snapshot>.',
        },
        config: {
          systemInstruction: { text: getCompressionPrompt() },
        },
      },
      prompt_id,
    );
    
    // 圧縮後の新しい履歴を作成
    const compressedHistory = [
      {
        role: 'user' as const,
        parts: [{ text: summary }],
      },
      {
        role: 'model' as const,
        parts: [{ text: 'Got it. Thanks for the additional context!' }],
      },
      ...historyToKeep,
    ];

    // 圧縮後のセッションを作成
    const newSession = await sessionManager.compressAndStartNewSession(
      compressedHistory,
      summary || '',  // summaryがundefinedの場合は空文字列
      originalTokenCount,
      0  // newTokenCountは後で計算されるため一時的に0
    );

    // Memory APIに圧縮サマリーを保存（利用可能な場合）
    try {
      const memoryModule = await import('@agents/memory');
      const memoryAPI = memoryModule.getMemoryAPI();
      
      // 圧縮サマリーをメモリに保存
      await memoryAPI.recordProjectInfo(
        `compression_summary_${newSession.id}`,
        {
          summary: summary,
          sessionId: newSession.id,
          parentSessionId: newSession.parentSessionId,
          compressedFrom: originalTokenCount,
          timestamp: new Date().toISOString(),
        }
      );
      
      console.log('[Compression] Saved compression summary to Memory API');
    } catch (error) {
      // Memory APIが利用できない場合は静かに無視
      console.debug('[Compression] Memory API summary save failed:', error);
    }

    // Reinitialize the chat with the new history.
    this.chat = await this.startChat(compressedHistory);

    const { totalTokens: newTokenCount } =
      await this.getContentGenerator().countTokens({
        model,
        contents: this.getChat().getHistory(true),
      });
    
    // 圧縮後のトークン数を更新
    sessionManager.updateTokenCount(newTokenCount ?? 0);
    await sessionManager.saveSession();
    
    console.log(`[Compression Debug] Compression complete: ${originalTokenCount} -> ${newTokenCount} tokens`);
    console.log(`[Compression Debug] Reduction: ${Math.round((1 - (newTokenCount ?? 0) / originalTokenCount) * 100)}%`);

    return {
      originalTokenCount,
      newTokenCount: newTokenCount ?? 0,
    };
  }

  async handleQuotaError(
    authType?: string,
    error?: unknown,
  ): Promise<GeminiClient | null> {
    if (error) {
      console.warn('[Quota Error]:', getErrorMessage(error));
    }

    const flashModel = DEFAULT_GEMINI_FLASH_MODEL;
    const currentModel = this.config.getModel();
    
    if (currentModel === flashModel) {
      console.log('[Quota Error] Already on Flash model, cannot fallback further');
      return null;
    }

    console.log(`[Quota Error] Switching from ${currentModel} to ${flashModel} due to quota error`);
    
    // Update the config to use Flash model
    this.config.setModel(flashModel);
    
    // Return this client with updated model
    return this;
  }


}

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
    CountTokensParameters,
    CountTokensResponse,
    EmbedContentParameters,
    EmbedContentResponse,
    GenerateContentParameters,
    GenerateContentResponse,
    FinishReason,
    Part,
    Content,
    ContentListUnion,
    PartUnion,
    FunctionDeclaration,
    FunctionCall,
    FunctionCallingConfigMode,
    Tool,
    ToolListUnion,
    CallableTool
} from '@google/genai';
import { ContentGenerator, ContentGeneratorConfig } from './contentGenerator.js';
import { AgentsToOpenAIConverter, OpenAIToAgentsConverter } from '../utils/adapter.js';
import { logApiResponse } from '../telemetry/loggers.js';
import { ApiResponseEvent } from '../telemetry/types.js';
import { Config } from '../config/config.js';
import OpenAI from 'openai';



export class OpenAIContentGenerator implements ContentGenerator {
    private openai: OpenAI;
    private configForTelemetry?: Config;
    private startTime: number = 0;

    constructor(private readonly config: ContentGeneratorConfig, configForTelemetry?: Config) {
        this.configForTelemetry = configForTelemetry;
        // ローカルLLMまたはOpenAI互換APIのベースURL設定
        let baseURL = process.env.OPENAI_BASE_URL || process.env.LOCAL_LLM_BASE_URL || 'https://api.openai.com/v1';
        
        // LM Studioの場合、/v1が含まれていない場合は追加
        if ((baseURL.includes('localhost:1234') || baseURL.includes('127.0.0.1:1234') || baseURL.includes('host.docker.internal:1234')) && !baseURL.includes('/v1')) {
            baseURL = baseURL.replace(/\/$/, '') + '/v1';
            console.log(`[OpenAI Compatible API] Added /v1 to base URL for LM Studio: ${baseURL}`);
        }
        const isLocalLLM = baseURL.includes('localhost') || 
                           baseURL.includes('127.0.0.1') || 
                           baseURL.includes('0.0.0.0') ||
                           baseURL.includes('host.docker.internal');
        
        const apiKey = config.apiKey || process.env.OPENAI_API_KEY || (isLocalLLM ? 'not-needed' : undefined);
        
        // デバッグ情報を出力
        console.log('[OpenAI Compatible API] Initializing with:');
        console.log(`  Base URL: ${baseURL}`);
        console.log(`  Is Local LLM: ${isLocalLLM}`);
        console.log(`  API Key: ${apiKey ? '***' + apiKey.slice(-4) : 'not set'}`);
        
        this.openai = new OpenAI({
            apiKey: apiKey,
            baseURL: baseURL,
        });
    }

    /**
     * 将ContentListUnion转换为Content数组
     */
    private normalizeContentListUnion(contents: ContentListUnion): Content[] {
        if (!contents) {
            return [];
        }

        // 如果是字符串，转换为Content
        if (typeof contents === 'string') {
            return [{
                role: 'user',
                parts: [{ text: contents }]
            }];
        }

        // 如果是数组
        if (Array.isArray(contents)) {
            const result: Content[] = [];
            for (const item of contents) {
                if (typeof item === 'string') {
                    result.push({
                        role: 'user',
                        parts: [{ text: item }]
                    });
                } else if ('text' in item) {
                    // PartUnion with text
                    result.push({
                        role: 'user',
                        parts: [item as Part]
                    });
                } else if ('role' in item) {
                    // Content object
                    result.push(item as Content);
                }
            }
            return result;
        }

        // 如果是单个Content对象
        if ('role' in contents) {
            return [contents as Content];
        }

        // 如果是单个Part对象
        if ('text' in contents) {
            return [{
                role: 'user',
                parts: [contents as Part]
            }];
        }

        return [];
    }

    /**
     * 将Gemini格式的内容转换为OpenAI格式
     */
    private convertToOpenAIMessages(contents: ContentListUnion): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
        const normalizedContents = this.normalizeContentListUnion(contents);
        return AgentsToOpenAIConverter.convertContentsToMessages(normalizedContents);
    }

    /**
     * 清理JSON响应，移除markdown代码块包装
     */
    private cleanJsonResponse(text: string): string {
        return OpenAIToAgentsConverter.cleanMarkdownJson(text);
    }



    /**
     * 将Gemini工具声明转换为OpenAI函数格式
     */
    private async convertGeminiToolsToOpenAI(tools?: ToolListUnion): Promise<OpenAI.Chat.Completions.ChatCompletionTool[]> {
        return await AgentsToOpenAIConverter.convertToolsToOpenAI(tools);
    }

    /**
     * 将OpenAI函数调用转换为Gemini格式
     */
    private convertOpenAIFunctionCallsToAgents(toolCalls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]): FunctionCall[] {
        return OpenAIToAgentsConverter.convertOpenAIFunctionCallsToAgents(toolCalls);
    }
    /**
     * 使用OpenAI API生成内容（非流式）
     */
    async generateContent(
        request: GenerateContentParameters,
    ): Promise<GenerateContentResponse> {
        try {
            const messages = this.convertToOpenAIMessages(request.contents);

            // 构建OpenAI请求参数
            const openaiRequest: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
                model: this.config.model || 'gpt-3.5-turbo',
                messages,
                ...AgentsToOpenAIConverter.convertConfigToOpenAIParams(request.config),
            };

            // 添加工具支持
            if (request.config?.tools) {
                const openaiTools = await this.convertGeminiToolsToOpenAI(request.config.tools);
                if (openaiTools.length > 0) {
                    openaiRequest.tools = openaiTools;

                    // 处理工具调用配置
                    if (request.config.toolConfig?.functionCallingConfig) {
                        const mode = request.config.toolConfig.functionCallingConfig.mode;
                        if (mode === FunctionCallingConfigMode.ANY) {
                            openaiRequest.tool_choice = 'required';
                        } else if (mode === FunctionCallingConfigMode.NONE) {
                            openaiRequest.tool_choice = 'none';
                        } else {
                            openaiRequest.tool_choice = 'auto';
                        }
                    } else {
                        openaiRequest.tool_choice = 'auto';
                    }
                }
            }

            // 添加系统指令支持
            if (request.config?.systemInstruction) {
                let systemContent = '';
                
                // 处理系统指令（可能是字符串或Part对象）
                if (typeof request.config.systemInstruction === 'string') {
                    systemContent = request.config.systemInstruction;
                } else if (typeof request.config.systemInstruction === 'object' && 'text' in request.config.systemInstruction && request.config.systemInstruction.text) {
                    systemContent = request.config.systemInstruction.text;
                }
                
                if (systemContent) {
                    // 如果需要JSON响应，将JSON格式要求追加到系统指令
                    if (request.config?.responseMimeType === 'application/json') {
                        systemContent += '\n\nYou must respond with valid JSON only. Do not wrap your response in markdown code blocks.';
                        // LM Studio requires 'text' instead of 'json_object'
                        const isLMStudio = this.openai.baseURL?.includes('1234') || this.openai.baseURL?.includes('lmstudio');
                        openaiRequest.response_format = { type: isLMStudio ? 'text' : 'json_object' };
                    }
                    
                    openaiRequest.messages.unshift({
                        role: 'system',
                        content: systemContent
                    });
                }
            } else if (request.config?.responseMimeType === 'application/json') {
                // JSON响应但没有系统指令的情况
                // LM Studio requires 'text' instead of 'json_object'
                        const isLMStudio = this.openai.baseURL?.includes('1234') || this.openai.baseURL?.includes('lmstudio');
                        openaiRequest.response_format = { type: isLMStudio ? 'text' : 'json_object' };
                openaiRequest.messages.unshift({
                    role: 'system',
                    content: 'You must respond with valid JSON only. Do not wrap your response in markdown code blocks.'
                });
            }

            const response = await this.openai.chat.completions.create(openaiRequest);

            // 确保response是ChatCompletion类型而不是Stream
            if ('choices' in response && !('controller' in response)) {
                return OpenAIToAgentsConverter.convertResponseToAgents(response, request.config?.responseMimeType === 'application/json');
            } else {
                throw new Error('Unexpected response type: expected ChatCompletion but got Stream');
            }
        } catch (error) {
            console.error('[OpenAI Compatible API] Request failed:', error);
            console.error('Request details:', {
                model: this.config.model || 'gpt-3.5-turbo',
                baseURL: process.env.OPENAI_BASE_URL || process.env.LOCAL_LLM_BASE_URL,
                hasApiKey: !!(this.config.apiKey || process.env.OPENAI_API_KEY),
            });
            throw error;
        }
    }



    /**
     * 使用OpenAI API生成流式内容
     */
    async generateContentStream(
        request: GenerateContentParameters,
    ): Promise<AsyncGenerator<GenerateContentResponse>> {
        this.startTime = Date.now();
        const messages = this.convertToOpenAIMessages(request.contents);

        // 构建OpenAI请求参数
        const openaiRequest: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
            model: this.config.model || 'gpt-3.5-turbo',
            messages,
            ...AgentsToOpenAIConverter.convertConfigToOpenAIParams(request.config),
            stream: true,
            stream_options: { include_usage: true }, // 启用流式响应中的用量统计
        };

        // 添加工具支持
            if (request.config?.tools) {
                const openaiTools = await this.convertGeminiToolsToOpenAI(request.config.tools);
                if (openaiTools.length > 0) {
                    openaiRequest.tools = openaiTools;

                    // 处理工具调用配置
                    if (request.config.toolConfig?.functionCallingConfig) {
                        const mode = request.config.toolConfig.functionCallingConfig.mode;
                        if (mode === FunctionCallingConfigMode.ANY) {
                            openaiRequest.tool_choice = 'required';
                        } else if (mode === FunctionCallingConfigMode.NONE) {
                            openaiRequest.tool_choice = 'none';
                        } else {
                            openaiRequest.tool_choice = 'auto';
                        }
                    } else {
                        openaiRequest.tool_choice = 'auto';
                    }
                }
            }

        // 添加系统指令支持
        if (request.config?.systemInstruction) {
            let systemContent = '';
            
            // 处理系统指令（可能是字符串或Part对象）
            if (typeof request.config.systemInstruction === 'string') {
                systemContent = request.config.systemInstruction;
            } else if (typeof request.config.systemInstruction === 'object' && 'text' in request.config.systemInstruction && request.config.systemInstruction.text) {
                systemContent = request.config.systemInstruction.text;
            }
            
            if (systemContent) {
                // 如果需要JSON响应，将JSON格式要求追加到系统指令
                if (request.config?.responseMimeType === 'application/json') {
                    systemContent += '\n\nYou must respond with valid JSON only. Do not wrap your response in markdown code blocks.';
                    // LM Studio requires 'text' instead of 'json_object'
                        const isLMStudio = this.openai.baseURL?.includes('1234') || this.openai.baseURL?.includes('lmstudio');
                        openaiRequest.response_format = { type: isLMStudio ? 'text' : 'json_object' };
                }
                
                openaiRequest.messages.unshift({
                    role: 'system',
                    content: systemContent
                });
            }
        } else if (request.config?.responseMimeType === 'application/json') {
            // JSON响应但没有系统指令的情况
            // LM Studio requires 'text' instead of 'json_object'
                        const isLMStudio = this.openai.baseURL?.includes('1234') || this.openai.baseURL?.includes('lmstudio');
                        openaiRequest.response_format = { type: isLMStudio ? 'text' : 'json_object' };
            openaiRequest.messages.unshift({
                role: 'system',
                content: 'You must respond with valid JSON only. Do not wrap your response in markdown code blocks.'
            });
        }

        const stream = await this.openai.chat.completions.create(openaiRequest);

        return this.createGeminiStreamFromOpenAI(stream, request.config?.responseMimeType === 'application/json');
    }

    /**
     * 将OpenAI流转换为Gemini格式的流，处理增量token合并
     */
    private async *createGeminiStreamFromOpenAI(
        stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>,
        isJsonResponse: boolean = false
    ): AsyncGenerator<GenerateContentResponse> {
        // 维护工具调用的累积状态
        const accumulatedToolCalls: Record<string, { id: string; name: string; arguments: string }> = {};
        // 累积usage信息，只在最后一个chunk中提供
        let finalUsage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | undefined;
        let responseText = '';

        for await (const chunk of stream) {
            // OpenAI APIの標準的なストリーミングレスポンスでは、最後のチャンクでusage情報が提供される
            // stream_options: { include_usage: true } を設定した場合のみ
            
            // OpenAI準拠のAPIでは、chunk.usageに直接格納される
            if (chunk.usage) {
                finalUsage = chunk.usage as any;
                console.log('[Usage Debug] Received usage info in chunk:', finalUsage);
            }

            // テキストコンテンツを累積
            if (chunk.choices?.[0]?.delta?.content) {
                responseText += chunk.choices[0].delta.content;
            }

            // 対于包含usage信息的chunk，即使没有其他内容也要处理
            // 传递当前chunk的usage信息（如果有的话）或者累積的finalUsage
            const agentsResponse = OpenAIToAgentsConverter.convertStreamingChunkToAgents(
                chunk,
                isJsonResponse,
                accumulatedToolCalls,
                finalUsage // 传递累积的usage信息
            );
            if (agentsResponse) {
                yield agentsResponse;
            }
        }

        // ストリーミング終了時にAPI応答をログに記録
        if (this.configForTelemetry && finalUsage) {
            const durationMs = Date.now() - this.startTime;
            const promptId = `openai_${Date.now()}_${Math.random().toString(36).substring(7)}`;
            
            // GenerateContentResponseUsageMetadataを作成
            const usageMetadata = {
                promptTokenCount: finalUsage.prompt_tokens,
                candidatesTokenCount: finalUsage.completion_tokens,
                totalTokenCount: finalUsage.total_tokens,
                cachedContentTokenCount: 0,
                thoughtsTokenCount: 0,
                toolUsePromptTokenCount: 0
            };

            logApiResponse(
                this.configForTelemetry,
                new ApiResponseEvent(
                    this.config.model || 'gpt-3.5-turbo',
                    durationMs,
                    promptId,
                    this.config.authType,
                    usageMetadata,
                    responseText
                )
            );
        }
    }

    /**
     * 计算token数量
     * 使用与OpenAI相同的tokenization方法进行准确计算
     */
    async countTokens(
        request: CountTokensParameters,
    ): Promise<CountTokensResponse> {
        try {
            // 内容をOpenAIメッセージ形式に変換
            const messages = this.convertToOpenAIMessages(request.contents);
            
            // モデル名の取得
            const model = request.model || this.config.model || 'gpt-3.5-turbo';
            
            // tiktokenを使用して正確なトークン数を計算
            let tiktoken: any;
            try {
                // tiktoken is an ESM module, use dynamic import
                const tiktokenModule = await import('tiktoken');
                tiktoken = tiktokenModule.default || tiktokenModule;
            } catch (importError) {
                console.warn('[OpenAI Compatible API] tiktoken not available, using estimation:', importError);
                return this.estimateTokens(messages);
            }

            // エンコーディングの取得（モデルに応じて異なる）
            let encoding;
            try {
                // GPT-3.5とGPT-4系のモデルはcl100k_baseエンコーディングを使用
                if (model.includes('gpt-4') || model.includes('gpt-3.5')) {
                    encoding = tiktoken.encoding_for_model(model);
                } else {
                    // その他のモデル（ローカルモデル含む）はcl100k_baseを使用
                    encoding = tiktoken.get_encoding('cl100k_base');
                }
            } catch (encodingError) {
                console.warn('[OpenAI Compatible API] Could not get encoding, using estimation:', encodingError);
                return this.estimateTokens(messages);
            }

            let totalTokens = 0;
            
            // メッセージごとのトークン計算
            // OpenAI APIのトークン計算規則に従う
            for (const message of messages) {
                // メッセージのメタデータ（role等）のトークン
                totalTokens += 3; // <|start|>{role/name}\n{content}<|end|>\n のオーバーヘッド
                
                // ロール名のトークン
                totalTokens += encoding.encode(message.role).length;
                
                // コンテンツのトークン
                if (typeof message.content === 'string') {
                    totalTokens += encoding.encode(message.content).length;
                } else if (Array.isArray(message.content)) {
                    // マルチパートコンテンツの場合
                    for (const part of message.content) {
                        if (part.type === 'text' && part.text) {
                            totalTokens += encoding.encode(part.text).length;
                        }
                        // 画像等の他のタイプは別途トークン計算が必要
                    }
                }
                
                // nameフィールドがある場合
                if ('name' in message && message.name) {
                    totalTokens += encoding.encode(message.name).length;
                    totalTokens -= 1; // nameフィールドがある場合は1トークン減る
                }
            }
            
            // 返答用のプライミングトークン
            totalTokens += 3;
            
            // エンコーディングをクリーンアップ
            encoding.free();
            
            console.log(`[OpenAI Compatible API] Token count for ${model}: ${totalTokens} tokens`);
            
            return {
                totalTokens: Math.max(totalTokens, 1), // 最低1トークンを返す
            };
        } catch (error) {
            console.error('[OpenAI Compatible API] Token counting error:', error);
            // エラー時は推定値を使用
            return this.estimateTokens(this.convertToOpenAIMessages(request.contents));
        }
    }
    
    /**
     * トークン数の推定（tiktokenが利用できない場合のフォールバック）
     */
    private estimateTokens(messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]): CountTokensResponse {
        let totalTokens = 0;
        
        // メッセージのフォーマットオーバーヘッド
        totalTokens += messages.length * 3;
        totalTokens += 3; // 対話の開始/終了マーカー
        
        for (const message of messages) {
            // ロールのトークン
            totalTokens += 1;
            
            if (typeof message.content === 'string') {
                const text = message.content;
                
                // 改進的なトークン推定：
                // - 英文：平均4文字 = 1トークン
                // - 中文：平均1.5文字 = 1トークン
                // - 記号とスペース：通常単独でトークン
                const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
                const otherChars = text.length - chineseChars;
                const punctuationAndSpaces = (text.match(/[\s\p{P}]/gu) || []).length;
                
                const estimatedTokens = Math.ceil(
                    chineseChars / 1.5 + // 中文文字
                    (otherChars - punctuationAndSpaces) / 4 + // 英文文字
                    punctuationAndSpaces * 0.8 // 記号とスペース
                );
                
                totalTokens += estimatedTokens;
            }
        }
        
        console.log(`[OpenAI Compatible API] Estimated token count: ${totalTokens} tokens`);
        
        return {
            totalTokens: Math.max(totalTokens, 1),
        };
    }

    /**
     * 使用OpenAI API生成内容嵌入
     */
    async embedContent(
        request: EmbedContentParameters,
    ): Promise<EmbedContentResponse> {
        try {
            // 提取文本内容
            const normalizedContents = this.normalizeContentListUnion(request.contents);
            const allTextParts: string[] = [];

            for (const content of normalizedContents) {
                const textParts = content.parts?.filter(part => 'text' in part && part.text) || [];
                const texts = textParts.map(part => (part as any).text);
                allTextParts.push(...texts);
            }

            const text = allTextParts.join('\n');

            if (!text) {
                throw new Error('No text content found for embedding');
            }

            // 使用OpenAI的embedding API
            const response = await this.openai.embeddings.create({
                model: 'text-embedding-ada-002', // OpenAI的标准embedding模型
                input: text,
            });

            // 转换为Gemini格式
            const embeddings = response.data.map(item => ({
                values: item.embedding,
            }));

            return {
                embeddings,
            };
        } catch (error) {
            console.error('OpenAI embedding error:', error);
            // 返回一个默认的embedding向量
            return {
                embeddings: [
                    {
                        values: new Array(1536).fill(0).map(() => Math.random() * 0.1 - 0.05),
                    }
                ],
            };
        }
    }
}

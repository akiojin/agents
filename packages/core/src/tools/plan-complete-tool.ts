/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import { SchemaValidator } from '../utils/schemaValidator.js';

/**
 * Parameters for the PlanComplete tool
 */
export interface PlanCompleteParams {
  /**
   * 設計の要約
   */
  summary?: string;
  
  /**
   * 次のステップ
   */
  next_steps?: string[];
  
  /**
   * 推定作業時間
   */
  estimated_time?: string;
  
  /**
   * リスク要因
   */
  risks?: string[];
}

/**
 * プランモード完了を通知する専用ツール
 * LLMがこのツールを呼び出すことで、言語に依存せずプランモードの完了を検出できる
 */
export class PlanCompleteTool extends BaseTool<PlanCompleteParams, ToolResult> {
  static readonly Name = 'plan_complete';

  constructor() {
    super(
      PlanCompleteTool.Name,
      'Plan Complete',
      'プランモードの設計が完了したことを通知します。このツールを呼び出すことで承認UIが表示されます。設計の要約、次のステップ、推定時間、リスクなどの情報を含めてください。',
      {
        properties: {
          summary: {
            description: '設計の要約 - 何を実装するかの概要',
            type: Type.STRING,
          },
          next_steps: {
            description: '次のステップ - 実装の手順',
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
          },
          estimated_time: {
            description: '推定作業時間（例: "2-3時間", "1日"）',
            type: Type.STRING,
          },
          risks: {
            description: 'リスク要因や注意点',
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
          },
        },
        required: [],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: PlanCompleteParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }
    return null;
  }

  async execute(params: PlanCompleteParams): Promise<ToolResult> {
    try {
      // プランモード完了を通知
      const message = `プランモード完了通知を受信しました。

設計要約: ${params.summary || '設計が完了しました'}
推定時間: ${params.estimated_time || '未指定'}
次のステップ数: ${params.next_steps?.length || 0}件
リスク要因数: ${params.risks?.length || 0}件

承認UIを表示します。`;

      return {
        llmContent: message,
        returnDisplay: message
      };
    } catch (error) {
      const errorMessage = `プランモード完了通知でエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
      return {
        llmContent: errorMessage,
        returnDisplay: errorMessage
      };
    }
  }
}
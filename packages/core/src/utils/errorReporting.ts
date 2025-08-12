/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Content } from '@google/genai';

interface ErrorReportData {
  error: { message: string; stack?: string } | { message: string };
  context?: unknown;
  additionalInfo?: Record<string, unknown>;
}

/**
 * Generates an error report, writes it to a temporary file, and logs information to console.error.
 * @param error The error object.
 * @param context The relevant context (e.g., chat history, request contents).
 * @param type A string to identify the type of error (e.g., 'startChat', 'generateJson-api').
 * @param baseMessage The initial message to log to console.error before the report path.
 */
export async function reportError(
  error: Error | unknown,
  baseMessage: string,
  context?: Content[] | Record<string, unknown> | unknown[],
  type = 'general',
): Promise<void> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportFileName = `agents-client-error-${type}-${timestamp}.json`;
  const reportPath = path.join(os.tmpdir(), reportFileName);

  let errorToReport: { message: string; stack?: string };
  if (error instanceof Error) {
    errorToReport = { message: error.message, stack: error.stack };
  } else if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  ) {
    errorToReport = {
      message: String((error as { message: unknown }).message),
    };
  } else {
    errorToReport = { message: String(error) };
  }

  const reportContent: ErrorReportData = { error: errorToReport };

  // コンテキストのサイズを制限（巨大なログを防ぐ）
  if (context) {
    try {
      const contextStr = JSON.stringify(context);
      // コンテキストが100KB以上の場合は切り詰める
      if (contextStr.length > 100000) {
        // 最初と最後の部分のみ保持
        const truncatedContext = {
          note: 'Context was truncated due to size',
          originalSize: contextStr.length,
          firstPart: contextStr.substring(0, 10000),
          lastPart: contextStr.substring(contextStr.length - 10000),
        };
        reportContent.context = truncatedContext;
      } else {
        reportContent.context = context;
      }
    } catch {
      reportContent.context = { note: 'Context could not be serialized' };
    }
  }

  let stringifiedReportContent: string;
  try {
    stringifiedReportContent = JSON.stringify(reportContent, null, 2);
  } catch (stringifyError) {
    // This can happen if context contains something like BigInt
    console.error(
      `${baseMessage} Could not stringify report content (likely due to context):`,
      stringifyError,
    );
    console.error('Original error that triggered report generation:', error);
    if (context) {
      console.error(
        'Original context could not be stringified or included in report.',
      );
    }
    // Fallback: try to report only the error if context was the issue
    try {
      const minimalReportContent = { error: errorToReport };
      stringifiedReportContent = JSON.stringify(minimalReportContent, null, 2);
      // Still try to write the minimal report
      await fs.writeFile(reportPath, stringifiedReportContent);
      console.error(
        `${baseMessage} Partial report (excluding context) available at: ${reportPath}`,
      );
    } catch (minimalWriteError) {
      console.error(
        `${baseMessage} Failed to write even a minimal error report:`,
        minimalWriteError,
      );
    }
    return;
  }

  try {
    await fs.writeFile(reportPath, stringifiedReportContent);
    // コンソールには簡潔なメッセージのみ表示
    console.error(`${baseMessage} Report saved: ${reportPath}`);
  } catch (writeError) {
    console.error(
      `${baseMessage} Additionally, failed to write detailed error report:`,
      writeError,
    );
    // Log the original error as a fallback if report writing fails
    console.error('Original error that triggered report generation:', error);
    if (context) {
      // コンソールへの出力も制限
      try {
        const contextStr = JSON.stringify(context);
        if (contextStr.length > 1000) {
          console.error(
            'Original context (truncated):',
            contextStr.substring(0, 1000) + '...',
          );
        } else {
          console.error('Original context:', context);
        }
      } catch {
        console.error('Original context could not be logged or stringified.');
      }
    }
  }
}

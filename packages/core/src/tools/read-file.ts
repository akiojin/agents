/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import path from 'path';
import { SchemaValidator } from '../utils/schemaValidator.js';
import { makeRelative, shortenPath } from '../utils/paths.js';
import { BaseTool, ToolResult } from './tools.js';
import { Type } from '@google/genai';
import {
  isWithinRoot,
  processSingleFileContent,
  getSpecificMimeType,
} from '../utils/fileUtils.js';
import { Config } from '../config/config.js';
import {
  recordFileOperationMetric,
  FileOperation,
} from '../telemetry/metrics.js';
import { getIntelligentFileService } from '../services/intelligent-file-service.js';

/**
 * Parameters for the ReadFile tool
 */
export interface ReadFileToolParams {
  /**
   * The absolute path to the file to read
   */
  absolute_path: string;

  /**
   * The line number to start reading from (optional)
   */
  offset?: number;

  /**
   * The number of lines to read (optional)
   */
  limit?: number;
}

/**
 * Implementation of the ReadFile tool logic
 */
export class ReadFileTool extends BaseTool<ReadFileToolParams, ToolResult> {
  static readonly Name: string = 'read_file';

  constructor(private config: Config) {
    super(
      ReadFileTool.Name,
      'ReadFile',
      'Reads and returns the content of a specified file from the local filesystem. Handles text, images (PNG, JPG, GIF, WEBP, SVG, BMP), PDF files, and Office files (Word, Excel, PowerPoint). Office files are parsed into readable text format. For text files, it can read specific line ranges.',
      {
        properties: {
          absolute_path: {
            description:
              "The absolute path to the file to read (e.g., '/home/user/project/file.txt'). Relative paths are not supported. You must provide an absolute path.",
            type: Type.STRING,
          },
          offset: {
            description:
              "Optional: For text files, the 0-based line number to start reading from. Requires 'limit' to be set. Use for paginating through large files.",
            type: Type.NUMBER,
          },
          limit: {
            description:
              "Optional: For text files, maximum number of lines to read. Use with 'offset' to paginate through large files. If omitted, reads the entire file (if feasible, up to a default limit).",
            type: Type.NUMBER,
          },
        },
        required: ['absolute_path'],
        type: Type.OBJECT,
      },
    );
  }

  validateToolParams(params: ReadFileToolParams): string | null {
    const errors = SchemaValidator.validate(this.schema.parameters, params);
    if (errors) {
      return errors;
    }

    const filePath = params.absolute_path;
    if (!path.isAbsolute(filePath)) {
      return `File path must be absolute, but was relative: ${filePath}. You must provide an absolute path.`;
    }
    if (!isWithinRoot(filePath, this.config.getTargetDir())) {
      return `File path must be within the root directory (${this.config.getTargetDir()}): ${filePath}`;
    }
    if (params.offset !== undefined && params.offset < 0) {
      return 'Offset must be a non-negative number';
    }
    if (params.limit !== undefined && params.limit <= 0) {
      return 'Limit must be a positive number';
    }

    const fileService = this.config.getFileService();
    if (fileService.shouldGeminiIgnoreFile(params.absolute_path)) {
      return `File path '${filePath}' is ignored by .geminiignore pattern(s).`;
    }

    return null;
  }

  getDescription(params: ReadFileToolParams): string {
    if (
      !params ||
      typeof params.absolute_path !== 'string' ||
      params.absolute_path.trim() === ''
    ) {
      return `Path unavailable`;
    }
    const relativePath = makeRelative(
      params.absolute_path,
      this.config.getTargetDir(),
    );
    return shortenPath(relativePath);
  }

  async execute(
    params: ReadFileToolParams,
    _signal: AbortSignal,
  ): Promise<ToolResult> {
    const validationError = this.validateToolParams(params);
    if (validationError) {
      return {
        llmContent: `Error: Invalid parameters provided. Reason: ${validationError}`,
        returnDisplay: validationError,
      };
    }

    // IntelligentFileSystemを優先的に使用
    const intelligentService = getIntelligentFileService();
    
    // テキストファイルかつoffset/limitが指定されていない場合はIntelligentFileSystemを使用
    const isTextFile = this.isTextFile(params.absolute_path);
    const useIntelligentFS = isTextFile && !params.offset && !params.limit;
    
    if (useIntelligentFS) {
      try {
        const intelligentResult = await intelligentService.readFileIntelligent(params.absolute_path);
        
        if (intelligentResult.success && intelligentResult.data) {
          const lines = intelligentResult.data.content.split('\n').length;
          const mimetype = getSpecificMimeType(params.absolute_path);
          recordFileOperationMetric(
            this.config,
            FileOperation.READ,
            lines,
            mimetype,
            path.extname(params.absolute_path),
          );
          
          // IntelligentFileSystemから取得した豊富な情報を含むコンテンツを構築
          let enhancedContent = intelligentResult.data.content;
          
          if (intelligentResult.data.symbols && intelligentResult.data.symbols.length > 0) {
            enhancedContent += '\n\n// ========== IntelligentFileSystem Analysis ==========\n';
            enhancedContent += `// Found ${intelligentResult.data.symbols.length} code symbols:\n`;
            
            for (const symbol of intelligentResult.data.symbols.slice(0, 10)) { // 最初の10個のシンボルを表示
              enhancedContent += `//   - ${symbol.name} (${symbol.kind}) at line ${symbol.location.line}\n`;
            }
            
            if (intelligentResult.data.symbols.length > 10) {
              enhancedContent += `//   ... and ${intelligentResult.data.symbols.length - 10} more symbols\n`;
            }
          }
          
          if (intelligentResult.data.dependencies && intelligentResult.data.dependencies.length > 0) {
            enhancedContent += `// Dependencies: ${intelligentResult.data.dependencies.join(', ')}\n`;
          }
          
          if (intelligentResult.data.metrics) {
            enhancedContent += `// Code Metrics:\n`;
            enhancedContent += `//   - Complexity: ${intelligentResult.data.metrics.complexity}\n`;
            enhancedContent += `//   - Maintainability: ${intelligentResult.data.metrics.maintainability}\n`;
            enhancedContent += `//   - Lines of Code: ${intelligentResult.data.metrics.lines}\n`;
          }
          
          enhancedContent += '// ====================================================\n';
          
          return {
            llmContent: enhancedContent,
            returnDisplay: `Read ${makeRelative(params.absolute_path, this.config.getTargetDir())} with IntelligentFileSystem analysis`,
          };
        }
      } catch (error) {
        // IntelligentFileSystemでエラーが発生した場合は通常の処理にフォールバック
        console.debug('IntelligentFileSystem failed, falling back to standard processing:', error);
      }
    }

    // 通常の処理（フォールバック）
    const result = await processSingleFileContent(
      params.absolute_path,
      this.config.getTargetDir(),
      params.offset,
      params.limit,
      this.config.getFileParserService(),
    );

    if (result.error) {
      return {
        llmContent: result.error, // The detailed error for LLM
        returnDisplay: result.returnDisplay, // User-friendly error
      };
    }

    const lines =
      typeof result.llmContent === 'string'
        ? result.llmContent.split('\n').length
        : undefined;
    const mimetype = getSpecificMimeType(params.absolute_path);
    recordFileOperationMetric(
      this.config,
      FileOperation.READ,
      lines,
      mimetype,
      path.extname(params.absolute_path),
    );

    return {
      llmContent: result.llmContent,
      returnDisplay: result.returnDisplay,
    };
  }

  /**
   * ファイルがテキストファイルかどうかを判定
   */
  private isTextFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    const textExtensions = ['.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.cs', '.scala', '.clj', '.ml', '.hs', '.sql', '.html', '.css', '.scss', '.less', '.md', '.txt', '.json', '.yaml', '.yml', '.xml', '.toml', '.ini', '.conf'];
    return textExtensions.includes(ext);
  }
}

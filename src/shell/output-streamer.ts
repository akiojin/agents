import EventEmitter from 'events';
import { createWriteStream, WriteStream, promises as fs } from 'fs';
import { join, dirname } from 'path';
import { OutputData } from './background-shell-manager.js';
import { logger } from '../utils/logger.js';

/**
 * 出力バッファのエントリー
 */
export interface BufferedOutput {
  sessionId: string;
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: Date;
  index: number; // バッファ内のインデックス
}

/**
 * ストリーミング設定
 */
export interface StreamingOptions {
  /** リアルタイムストリーミング有効 */
  realtime?: boolean;
  /** バッファサイズ（行数） */
  bufferSize?: number;
  /** ログファイル保存有効 */
  saveToFile?: boolean;
  /** ログファイルディレクトリ */
  logDirectory?: string;
}

/**
 * フィルタリングオプション
 */
export interface FilterOptions {
  /** セッションID */
  sessionId?: string;
  /** 出力タイプ */
  type?: 'stdout' | 'stderr' | 'both';
  /** 開始時間 */
  startTime?: Date;
  /** 終了時間 */
  endTime?: Date;
  /** 検索キーワード */
  keyword?: string;
  /** 最大行数 */
  maxLines?: number;
}

/**
 * 循環バッファクラス
 * メモリ効率的な出力データ管理
 */
class CircularBuffer<T> {
  private buffer: T[];
  private size: number;
  private head = 0;
  private tail = 0;
  private count = 0;
  
  constructor(size: number) {
    this.size = size;
    this.buffer = new Array(size);
  }
  
  push(item: T): void {
    this.buffer[this.tail] = item;
    this.tail = (this.tail + 1) % this.size;
    
    if (this.count < this.size) {
      this.count++;
    } else {
      this.head = (this.head + 1) % this.size;
    }
  }
  
  getAll(): T[] {
    const result: T[] = [];
    
    if (this.count === 0) {
      return result;
    }
    
    let current = this.head;
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[current]);
      current = (current + 1) % this.size;
    }
    
    return result;
  }
  
  getLast(n: number): T[] {
    const all = this.getAll();
    return all.slice(-n);
  }
  
  clear(): void {
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }
  
  getCount(): number {
    return this.count;
  }
  
  isFull(): boolean {
    return this.count === this.size;
  }
}

/**
 * 出力ストリーマークラス
 * シェル出力のリアルタイム管理とログ保存
 */
export class OutputStreamer extends EventEmitter {
  private buffers = new Map<string, CircularBuffer<BufferedOutput>>();
  private logStreams = new Map<string, WriteStream>();
  private globalIndex = 0;
  private options: Required<StreamingOptions>;
  
  constructor(options: StreamingOptions = {}) {
    super();
    
    this.options = {
      realtime: options.realtime ?? true,
      bufferSize: options.bufferSize ?? 1000,
      saveToFile: options.saveToFile ?? true,
      logDirectory: options.logDirectory ?? './logs/shell-sessions'
    };
    
    logger.debug('OutputStreamer initialized', this.options);
  }

  /**
   * 出力データを処理
   */
  async processOutput(outputData: OutputData): Promise<void> {
    const bufferedOutput: BufferedOutput = {
      ...outputData,
      index: ++this.globalIndex
    };
    
    // バッファに追加
    await this.addToBuffer(bufferedOutput);
    
    // ファイルに保存
    if (this.options.saveToFile) {
      await this.saveToFile(bufferedOutput);
    }
    
    // リアルタイムストリーミング
    if (this.options.realtime) {
      this.emit('output:stream', bufferedOutput);
    }
    
    // 統計更新
    this.emit('output:processed', outputData.sessionId);
  }

  /**
   * バッファに出力を追加
   */
  private async addToBuffer(output: BufferedOutput): Promise<void> {
    let buffer = this.buffers.get(output.sessionId);
    
    if (!buffer) {
      buffer = new CircularBuffer<BufferedOutput>(this.options.bufferSize);
      this.buffers.set(output.sessionId, buffer);
    }
    
    buffer.push(output);
  }

  /**
   * ファイルに保存
   */
  private async saveToFile(output: BufferedOutput): Promise<void> {
    try {
      let stream = this.logStreams.get(output.sessionId);
      
      if (!stream) {
        // ディレクトリ作成
        await fs.mkdir(this.options.logDirectory, { recursive: true });
        
        // ログファイルパス
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = `${output.sessionId}-${timestamp}.log`;
        const filepath = join(this.options.logDirectory, filename);
        
        // ストリーム作成
        stream = createWriteStream(filepath, { flags: 'a' });
        this.logStreams.set(output.sessionId, stream);
        
        // セッション開始ログ
        stream.write(`=== Session ${output.sessionId} started at ${output.timestamp.toISOString()} ===\\n`);
      }
      
      // ログエントリー作成
      const logEntry = `[${output.timestamp.toISOString()}] [${output.type.toUpperCase()}] ${output.data}`;
      
      if (!logEntry.endsWith('\\n')) {
        stream.write(logEntry + '\\n');
      } else {
        stream.write(logEntry);
      }
      
    } catch (error) {
      logger.error(`Failed to save output to file: ${output.sessionId}`, error);
    }
  }

  /**
   * セッションの出力を取得
   */
  getSessionOutput(
    sessionId: string,
    options: {
      lines?: number;
      type?: 'stdout' | 'stderr' | 'both';
      since?: Date;
    } = {}
  ): BufferedOutput[] {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) return [];
    
    let outputs = buffer.getAll();
    
    // タイプフィルター
    if (options.type && options.type !== 'both') {
      outputs = outputs.filter(output => output.type === options.type);
    }
    
    // 時間フィルター
    if (options.since) {
      outputs = outputs.filter(output => output.timestamp >= options.since!);
    }
    
    // 行数制限
    if (options.lines) {
      outputs = outputs.slice(-options.lines);
    }
    
    return outputs;
  }

  /**
   * 複数セッションの出力を取得
   */
  getMultiSessionOutput(filter: FilterOptions = {}): BufferedOutput[] {
    let allOutputs: BufferedOutput[] = [];
    
    // 対象セッションの決定
    const targetSessions = filter.sessionId ? [filter.sessionId] : Array.from(this.buffers.keys());
    
    // 各セッションから出力を収集
    targetSessions.forEach(sessionId => {
      const buffer = this.buffers.get(sessionId);
      if (buffer) {
        allOutputs.push(...buffer.getAll());
      }
    });
    
    // フィルタリング
    if (filter.type && filter.type !== 'both') {
      allOutputs = allOutputs.filter(output => output.type === filter.type);
    }
    
    if (filter.startTime) {
      allOutputs = allOutputs.filter(output => output.timestamp >= filter.startTime!);
    }
    
    if (filter.endTime) {
      allOutputs = allOutputs.filter(output => output.timestamp <= filter.endTime!);
    }
    
    if (filter.keyword) {
      const keyword = filter.keyword.toLowerCase();
      allOutputs = allOutputs.filter(output => 
        output.data.toLowerCase().includes(keyword)
      );
    }
    
    // 時間順でソート
    allOutputs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    // 行数制限
    if (filter.maxLines) {
      allOutputs = allOutputs.slice(-filter.maxLines);
    }
    
    return allOutputs;
  }

  /**
   * セッション出力の検索
   */
  searchOutput(
    sessionId: string,
    keyword: string,
    options: {
      maxResults?: number;
      context?: number; // 前後の行数
    } = {}
  ): BufferedOutput[] {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) return [];
    
    const outputs = buffer.getAll();
    const results: BufferedOutput[] = [];
    const keyword_lower = keyword.toLowerCase();
    
    outputs.forEach((output, index) => {
      if (output.data.toLowerCase().includes(keyword_lower)) {
        // コンテキスト行も含める場合
        if (options.context) {
          const start = Math.max(0, index - options.context);
          const end = Math.min(outputs.length, index + options.context + 1);
          results.push(...outputs.slice(start, end));
        } else {
          results.push(output);
        }
      }
    });
    
    // 重複削除（コンテキスト行の重複対応）
    const uniqueResults = results.filter((output, index, arr) => 
      arr.findIndex(o => o.index === output.index) === index
    );
    
    // 最大結果数制限
    if (options.maxResults) {
      return uniqueResults.slice(0, options.maxResults);
    }
    
    return uniqueResults;
  }

  /**
   * セッションのログファイルパスを取得
   */
  getLogFilePath(sessionId: string): string {
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `${sessionId}-${timestamp}.log`;
    return join(this.options.logDirectory, filename);
  }

  /**
   * セッションの統計情報を取得
   */
  getSessionStats(sessionId: string): {
    totalLines: number;
    stdoutLines: number;
    stderrLines: number;
    bufferUsage: number; // パーセンテージ
    oldestEntry?: Date;
    newestEntry?: Date;
  } | null {
    const buffer = this.buffers.get(sessionId);
    if (!buffer) return null;
    
    const outputs = buffer.getAll();
    const stdoutLines = outputs.filter(o => o.type === 'stdout').length;
    const stderrLines = outputs.filter(o => o.type === 'stderr').length;
    
    return {
      totalLines: outputs.length,
      stdoutLines,
      stderrLines,
      bufferUsage: (buffer.getCount() / this.options.bufferSize) * 100,
      oldestEntry: outputs.length > 0 ? outputs[0].timestamp : undefined,
      newestEntry: outputs.length > 0 ? outputs[outputs.length - 1].timestamp : undefined
    };
  }

  /**
   * セッション出力のクリア
   */
  clearSession(sessionId: string): void {
    const buffer = this.buffers.get(sessionId);
    if (buffer) {
      buffer.clear();
    }
    
    // ログストリームを閉じる
    const stream = this.logStreams.get(sessionId);
    if (stream) {
      stream.write(`=== Session ${sessionId} cleared at ${new Date().toISOString()} ===\\n`);
      stream.end();
      this.logStreams.delete(sessionId);
    }
    
    logger.debug(`Session output cleared: ${sessionId}`);
    this.emit('session:cleared', sessionId);
  }

  /**
   * セッション終了時の処理
   */
  finalizeSession(sessionId: string): void {
    const stream = this.logStreams.get(sessionId);
    if (stream) {
      stream.write(`=== Session ${sessionId} ended at ${new Date().toISOString()} ===\\n`);
      stream.end();
      this.logStreams.delete(sessionId);
    }
    
    logger.debug(`Session finalized: ${sessionId}`);
    this.emit('session:finalized', sessionId);
  }

  /**
   * 全セッション統計
   */
  getGlobalStats(): {
    totalSessions: number;
    totalOutputLines: number;
    memoryUsage: number; // MB
    activeStreams: number;
  } {
    let totalLines = 0;
    this.buffers.forEach(buffer => {
      totalLines += buffer.getCount();
    });
    
    // 概算メモリ使用量（1行あたり平均100バイトと仮定）
    const memoryUsage = (totalLines * 100) / (1024 * 1024);
    
    return {
      totalSessions: this.buffers.size,
      totalOutputLines: totalLines,
      memoryUsage,
      activeStreams: this.logStreams.size
    };
  }

  /**
   * リアルタイムストリーミングの開始
   */
  startStreamingSession(sessionId: string, callback: (output: BufferedOutput) => void): () => void {
    const handler = (output: BufferedOutput) => {
      if (output.sessionId === sessionId) {
        callback(output);
      }
    };
    
    this.on('output:stream', handler);
    
    // ストリーミング停止関数を返す
    return () => {
      this.off('output:stream', handler);
    };
  }

  /**
   * クリーンアップ
   */
  cleanup(): void {
    logger.info('OutputStreamer cleanup started');
    
    // 全ストリームを閉じる
    this.logStreams.forEach((stream, sessionId) => {
      stream.write(`=== Session ${sessionId} cleanup at ${new Date().toISOString()} ===\\n`);
      stream.end();
    });
    
    // バッファとストリームマップをクリア
    this.buffers.clear();
    this.logStreams.clear();
    
    // イベントリスナーをクリア
    this.removeAllListeners();
    
    logger.debug('OutputStreamer cleaned up');
  }
}
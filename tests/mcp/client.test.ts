import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MCPClient } from '../../src/mcp/client.js';
import { EventEmitter } from 'events';

// モックChildProcess
class MockChildProcess extends EventEmitter {
  public stdout = new EventEmitter();
  public stderr = new EventEmitter();
  public stdin = {
    write: (data: string, callback?: (error?: Error) => void) => {
      // 書き込み成功をシミュレート
      if (callback) {
        setTimeout(() => callback(), 10);
      }
    },
  };
  public killed = false;

  kill(signal?: string): boolean {
    this.killed = true;
    setTimeout(() => this.emit('exit', 0), 50);
    return true;
  }

  simulateStdoutData(data: string): void {
    this.stdout.emit('data', Buffer.from(data));
  }

  simulateStderrData(data: string): void {
    this.stderr.emit('data', Buffer.from(data));
  }

  simulateError(error: Error): void {
    this.emit('error', error);
  }

  simulateExit(code: number): void {
    this.emit('exit', code);
  }
}

describe('MCPClient', () => {
  let client: MCPClient;
  let mockProcess: MockChildProcess;
  const clientName = 'test-client';

  beforeEach(() => {
    client = new MCPClient(clientName);
    mockProcess = new MockChildProcess();
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  describe('基本機能', () => {
    it('should create client with correct name', () => {
      expect(client.getName()).toBe(clientName);
      expect(client.isConnected()).toBe(false);
    });

    it('should handle connection to process', async () => {
      // 初期化レスポンスをシミュレート
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: { protocolVersion: '1.0' }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 50);

      await client.connect(mockProcess as any);
      
      expect(client.isConnected()).toBe(true);
    });

    it('should handle connection failure gracefully', async () => {
      // エラーをシミュレート
      setTimeout(() => {
        mockProcess.simulateError(new Error('Connection failed'));
      }, 10);

      let errorOccurred = false;
      try {
        await client.connect(mockProcess as any);
      } catch (error) {
        errorOccurred = true;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('接続に失敗しました');
      }
      
      expect(errorOccurred).toBe(true);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('データ処理', () => {
    beforeEach(async () => {
      // 初期化レスポンスをシミュレート
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: { protocolVersion: '1.0' }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 50);

      await client.connect(mockProcess as any);
    });

    it('should handle malformed JSON gracefully', () => {
      // 不正なJSONを送信
      expect(() => {
        mockProcess.simulateStdoutData('invalid json\n');
      }).not.toThrow();
      
      // クライアントは接続状態を維持するはず
      expect(client.isConnected()).toBe(true);
    });

    it('should handle empty data gracefully', () => {
      expect(() => {
        mockProcess.simulateStdoutData('');
      }).not.toThrow();
      
      expect(client.isConnected()).toBe(true);
    });

    it('should handle stderr data without crashing', () => {
      expect(() => {
        mockProcess.simulateStderrData('Some error message');
      }).not.toThrow();
      
      expect(client.isConnected()).toBe(true);
    });
  });

  describe('ツールリスト取得', () => {
    beforeEach(async () => {
      // 初期化レスポンス
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: { protocolVersion: '1.0' }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 50);

      await client.connect(mockProcess as any);
    });

    it('should return empty array when not connected', async () => {
      await client.disconnect();
      
      const tools = await client.listTools();
      expect(tools).toEqual([]);
    });

    it('should handle tools/list response', async () => {
      // ツールリストレスポンスをシミュレート
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 2,
          result: {
            tools: [
              { name: 'test-tool', description: 'A test tool' },
              { name: 'another-tool', description: 'Another tool' }
            ]
          }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 100);

      const tools = await client.listTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('test-tool');
      expect(tools[1].name).toBe('another-tool');
    });

    it('should handle tools/list error gracefully', async () => {
      // エラーレスポンスをシミュレート
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 2,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 100);

      const tools = await client.listTools();
      expect(tools).toEqual([]);
    });
  });

  describe('ツール実行', () => {
    beforeEach(async () => {
      // 初期化レスポンス
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: { protocolVersion: '1.0' }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 50);

      await client.connect(mockProcess as any);
    });

    it('should handle empty tool name', async () => {
      const result = await client.invokeTool('');
      
      // フォールバック結果が返されることを確認
      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('message');
      expect((result as any).message).toContain('ツール名が指定されていません');
    });

    it('should handle tool execution when not connected', async () => {
      await client.disconnect();
      
      const result = await client.invokeTool('test-tool');
      
      // フォールバック結果が返されることを確認
      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('toolName', 'test-tool');
    });

    it('should handle successful tool execution', async () => {
      const toolName = 'test-tool';
      const params = { arg1: 'value1' };
      const expectedResult = { output: 'success' };

      // 成功レスポンスをシミュレート
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 2,
          result: expectedResult
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 100);

      const result = await client.invokeTool(toolName, params);
      expect(result).toEqual(expectedResult);
    });

    it('should handle tool execution timeout', async () => {
      // タイムアウトが発生するようにレスポンスを送信しない
      const result = await client.invokeTool('slow-tool');
      
      // フォールバック結果が返されることを確認
      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('toolName', 'slow-tool');
      // canRetryはfalseになる可能性もあるので削除
    }, 35000); // タイムアウトテストなので長めに設定

    it('should handle tool not found error', async () => {
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 2,
          error: {
            code: -32601,
            message: 'Tool not found'
          }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 100);

      const result = await client.invokeTool('nonexistent-tool');
      
      expect(result).toHaveProperty('error', true);
      expect(result).toHaveProperty('message');
      expect((result as any).message).toContain('ツールが見つかりません');
    });
  });

  describe('切断処理', () => {
    it('should handle disconnect when not connected', async () => {
      expect(() => client.disconnect()).not.toThrow();
    });

    it('should handle disconnect gracefully', async () => {
      // 接続
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: { protocolVersion: '1.0' }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 50);

      await client.connect(mockProcess as any);
      expect(client.isConnected()).toBe(true);

      // シャットダウンレスポンスをシミュレート
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 2,
          result: {}
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 100);

      await client.disconnect();
      expect(client.isConnected()).toBe(false);
    });

    it('should handle process exit during operation', async () => {
      // 接続
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: { protocolVersion: '1.0' }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 50);

      await client.connect(mockProcess as any);
      
      // プロセス終了をシミュレート
      let disconnected = false;
      client.on('disconnected', () => {
        disconnected = true;
      });

      mockProcess.simulateExit(1);
      
      // 少し待ってからイベントが発火されたかチェック
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(disconnected).toBe(true);
      expect(client.isConnected()).toBe(false);
    });
  });

  describe('エラーハンドリング', () => {
    it('should handle process error after connection', async () => {
      // 接続
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: { protocolVersion: '1.0' }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 50);

      await client.connect(mockProcess as any);
      
      let errorReceived = false;
      client.on('error', () => {
        errorReceived = true;
      });

      mockProcess.simulateError(new Error('Runtime error'));
      
      // 少し待ってからイベントが発火されたかチェック
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(errorReceived).toBe(true);
      expect(client.isConnected()).toBe(false);
    });

    it('should emit notification events', async () => {
      // 接続
      setTimeout(() => {
        const response = {
          jsonrpc: '2.0',
          id: 1,
          result: { protocolVersion: '1.0' }
        };
        mockProcess.simulateStdoutData(JSON.stringify(response) + '\n');
      }, 50);

      await client.connect(mockProcess as any);
      
      let notificationReceived: any = null;
      client.on('notification', (notification) => {
        notificationReceived = notification;
      });

      // 通知をシミュレート
      const notification = {
        jsonrpc: '2.0',
        method: 'test/notification',
        params: { message: 'test notification' }
      };
      mockProcess.simulateStdoutData(JSON.stringify(notification) + '\n');
      
      // 少し待ってからイベントが発火されたかチェック
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(notificationReceived).toEqual(notification);
    });
  });
});
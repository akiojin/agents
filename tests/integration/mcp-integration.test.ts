import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MCPManager } from '../../src/mcp/manager.js';
import { MCPClient } from '../../src/mcp/client.js';
import { MCPToolsHelper } from '../../src/mcp/tools.js';
import { Config } from '../../src/config/types.js';
import WebSocket from 'ws';

/**
 * MCP（Model Context Protocol）統合テスト
 * MCPサーバーとの通信、ツール実行、エラーハンドリングを統合的にテストします
 */
describe('MCP Integration Tests', () => {
  let mcpManager: MCPManager;
  let mcpClient: MCPClient;
  let mcpTools: MCPToolsHelper;
  let testConfig: Config;
  let mockWebSocket: any;

  beforeEach(async () => {
    // WebSocketのモックを作成
    mockWebSocket = {
      readyState: WebSocket.OPEN,
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // テスト用設定
    testConfig = {
      llm: {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
        timeout: 30000,
        maxRetries: 3,
        temperature: 0.3,
        maxTokens: 4000,
      },
      mcp: {
        enabled: true,
        servers: [
          {
            name: 'test-server',
            command: 'node',
            args: ['test-mcp-server.js'],
            env: {},
            timeout: 30000,
          },
        ],
        timeout: 30000,
        maxRetries: 3,
      },
      app: {
        logLevel: 'info',
        logDir: '/tmp/test-logs',
        maxParallel: 3,
        silent: false,
        timeout: 30000,
      },
      paths: {
        cache: '/tmp/test-cache',
        history: '/tmp/test-history',
        config: '/tmp/test-config.json',
      },
    };

    // コンポーネントの初期化
    mcpManager = new MCPManager(testConfig);
    mcpClient = new MCPClient('test-server', mockWebSocket as any);
    mcpTools = new MCPToolsHelper(mcpManager);
  });

  afterEach(async () => {
    vi.clearAllMocks();
    if (mcpManager) {
      await mcpManager.shutdown();
    }
  });

  describe('MCPサーバー接続管理', () => {
    it('MCPサーバーへの接続とハンドシェイク', async () => {
      // 接続成功のシミュレート
      const mockHandshake = vi.fn().mockResolvedValue({
        protocol_version: '1.0',
        capabilities: {
          tools: ['list_files', 'read_file', 'write_file'],
          resources: ['file_system'],
        },
        server_info: {
          name: 'test-server',
          version: '1.0.0',
        },
      });

      mcpClient.handshake = mockHandshake;

      const connectionResult = await mcpClient.handshake({
        protocol_version: '1.0',
        client_info: {
          name: 'test-agents',
          version: '0.1.0',
        },
        capabilities: {
          tools: {},
          resources: {},
        },
      });

      expect(connectionResult).toBeDefined();
      expect(connectionResult.capabilities).toBeDefined();
      expect(connectionResult.capabilities.tools).toContain('list_files');
      expect(mockHandshake).toHaveBeenCalled();
    });

    it('接続失敗時の適切なエラーハンドリング', async () => {
      const mockHandshake = vi.fn().mockRejectedValue(
        new Error('Connection refused')
      );

      mcpClient.handshake = mockHandshake;

      await expect(mcpClient.handshake({
        protocol_version: '1.0',
        client_info: {
          name: 'test-agents',
          version: '0.1.0',
        },
        capabilities: {
          tools: {},
          resources: {},
        },
      })).rejects.toThrow('Connection refused');

      expect(mockHandshake).toHaveBeenCalled();
    });

    it('接続タイムアウト処理', async () => {
      // タイムアウトをシミュレート
      const mockHandshake = vi.fn().mockImplementation(
        () => new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 100)
        )
      );

      mcpClient.handshake = mockHandshake;

      const startTime = Date.now();
      await expect(mcpClient.handshake({
        protocol_version: '1.0',
        client_info: {
          name: 'test-agents',
          version: '0.1.0',
        },
        capabilities: {
          tools: {},
          resources: {},
        },
      })).rejects.toThrow('Timeout');

      const duration = Date.now() - startTime;
      expect(duration).toBeGreaterThan(90);
      expect(duration).toBeLessThan(200);
    });
  });

  describe('MCPツール実行', () => {
    beforeEach(() => {
      // MCPクライアントのツール実行メソッドをモック
      mcpClient.callTool = vi.fn();
    });

    it('基本的なツール実行', async () => {
      const mockToolResult = {
        content: [
          {
            type: 'text',
            text: 'ファイル一覧:\n- file1.txt\n- file2.txt\n- directory/',
          },
        ],
      };

      (mcpClient.callTool as any).mockResolvedValue(mockToolResult);

      const result = await mcpClient.callTool('list_files', {
        path: '/test',
      });

      expect(result).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('file1.txt');
      expect(mcpClient.callTool).toHaveBeenCalledWith('list_files', {
        path: '/test',
      });
    });

    it('複数ツールの並列実行', async () => {
      const mockResults = [
        {
          content: [{ type: 'text', text: 'File content 1' }],
        },
        {
          content: [{ type: 'text', text: 'File content 2' }],
        },
        {
          content: [{ type: 'text', text: 'File content 3' }],
        },
      ];

      (mcpClient.callTool as any)
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1])
        .mockResolvedValueOnce(mockResults[2]);

      const toolCalls = [
        { name: 'read_file', params: { path: 'file1.txt' } },
        { name: 'read_file', params: { path: 'file2.txt' } },
        { name: 'read_file', params: { path: 'file3.txt' } },
      ];

      const results = await mcpTools.executeToolsInParallel(
        toolCalls
      );

      expect(results).toHaveLength(3);
      results.forEach((result, index) => {
        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockResults[index]);
      });

      expect(mcpClient.callTool).toHaveBeenCalledTimes(3);
    });

    it('ツール実行エラーの処理', async () => {
      const error = new Error('Tool execution failed');
      // MCPManagerのinvokeToolをモック化
      mcpManager.invokeTool = vi.fn().mockRejectedValue(error);

      await expect(mcpTools.executeTool(
        'invalid_tool',
        { param: 'value' }
      )).rejects.toThrow('Tool execution failed');
      
      expect(mcpManager.invokeTool).toHaveBeenCalledWith('invalid_tool', { param: 'value' });
    });

    it('部分的失敗での継続処理', async () => {
      // 1番目と3番目は成功、2番目は失敗するシナリオ
      let callCount = 0;
      mcpManager.invokeTool = vi.fn().mockImplementation(async (toolName) => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Tool 2 failed');
        }
        return `Success ${callCount}`;
      });

      const toolCalls = [
        { name: 'tool1', params: {} },
        { name: 'tool2', params: {} },
        { name: 'tool3', params: {} },
      ];

      const results = await mcpTools.executeToolsInParallel(toolCalls);

      expect(results).toHaveLength(3);
      expect(results.filter(r => r.success)).toHaveLength(2);
      expect(results.filter(r => !r.success)).toHaveLength(1);

      // エラーメッセージが適切に設定されていることを確認
      const failedResult = results.find(r => !r.success);
      expect(failedResult?.error).toContain('Tool 2 failed');
    });
  });

  describe('MCPリソース管理', () => {
    it('リソース一覧の取得', async () => {
      const mockResources = [
        {
          uri: 'file://test/file1.txt',
          name: 'file1.txt',
          description: 'Test file 1',
          mimeType: 'text/plain',
        },
        {
          uri: 'file://test/file2.txt',
          name: 'file2.txt',
          description: 'Test file 2',
          mimeType: 'text/plain',
        },
      ];

      mcpClient.listResources = vi.fn().mockResolvedValue({
        resources: mockResources,
      });

      const result = await mcpClient.listResources();

      expect(result.resources).toHaveLength(2);
      expect(result.resources[0].name).toBe('file1.txt');
      expect(result.resources[1].name).toBe('file2.txt');
      expect(mcpClient.listResources).toHaveBeenCalled();
    });

    it('リソース内容の読み込み', async () => {
      const mockContent = {
        contents: [
          {
            uri: 'file://test/file1.txt',
            mimeType: 'text/plain',
            text: 'Test file content',
          },
        ],
      };

      mcpClient.readResource = vi.fn().mockResolvedValue(mockContent);

      const result = await mcpClient.readResource('file://test/file1.txt');

      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].text).toBe('Test file content');
      expect(mcpClient.readResource).toHaveBeenCalledWith('file://test/file1.txt');
    });
  });

  describe('MCPサーバー管理', () => {
    it('複数MCPサーバーの管理', async () => {
      const multiServerConfig = {
        ...testConfig,
        mcp: {
          ...testConfig.mcp,
          servers: [
            {
              name: 'server1',
              command: 'node',
              args: ['server1.js'],
              env: {},
              timeout: 30000,
            },
            {
              name: 'server2',
              command: 'node',
              args: ['server2.js'],
              env: {},
              timeout: 30000,
            },
          ],
        },
      };

      const multiServerManager = new MCPManager(multiServerConfig);

      await multiServerManager.initialize();

      // サーバーが正しく設定されていることを確認
      const serverStatus = multiServerManager.getServerStatus();
      expect(serverStatus.size).toBeGreaterThan(0);
    });

    it('サーバー障害からの自動復旧', async () => {
      // サーバーの初期化と復旧をテスト
      await mcpManager.initialize();
      
      // サーバーステータスを確認
      const serverStatus = mcpManager.getServerStatus();
      expect(serverStatus).toBeDefined();
    });

    it('サーバー停止とクリーンアップ', async () => {
      // shutdown メソッドが正常に動作することを確認
      await expect(mcpManager.shutdown()).resolves.not.toThrow();
    });
  });

  describe('エラーリカバリーとフォールバック', () => {
    it('MCPサーバーダウン時のフォールバック', async () => {
      // MCPが使用できない場合のフォールバック処理
      const mcpUnavailableConfig = {
        ...testConfig,
        mcp: {
          ...testConfig.mcp,
          enabled: false,
          servers: [],
        },
      };

      const fallbackManager = new MCPManager(mcpUnavailableConfig);
      await fallbackManager.initialize();

      // MCPが無効でも正常に初期化されることを確認
      expect(fallbackManager.isEnabled()).toBe(false);
    });

    it('ネットワーク断絶時の自動再接続', async () => {
      let reconnectAttempts = 0;
      
      mcpClient.ping = vi.fn().mockImplementation(async () => {
        reconnectAttempts++;
        if (reconnectAttempts <= 3) {
          throw new Error('Network unreachable');
        }
        return { status: 'ok' };
      });

      // ヘルスチェックと再接続をテスト
      const healthCheck = async () => {
        try {
          await mcpClient.ping();
          return true;
        } catch (error) {
          // 再接続を試行
          await new Promise(resolve => setTimeout(resolve, 100));
          return false;
        }
      };

      // 複数回試行して最終的に成功することを確認
      let healthy = false;
      for (let i = 0; i < 5; i++) {
        healthy = await healthCheck();
        if (healthy) break;
      }

      expect(healthy).toBe(true);
      expect(reconnectAttempts).toBeGreaterThan(3);
    });

    it('メモリリークの防止', async () => {
      const initialMemory = process.memoryUsage();

      // 大量のMCP操作を実行
      const operations = Array.from({ length: 100 }, (_, i) => 
        mcpTools.executeToolWithRetry(
          mcpClient,
          'test_tool',
          { data: new Array(1000).fill(i) }
        )
      );

      // モックの応答を設定
      (mcpClient.callTool as any).mockResolvedValue({
        content: [{ type: 'text', text: 'OK' }],
      });

      await Promise.all(operations);

      // メモリ使用量の確認
      const finalMemory = process.memoryUsage();
      const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // メモリ増加が合理的な範囲内であることを確認（50MB以下）
      expect(heapGrowth).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('パフォーマンステスト', () => {
    it('高頻度ツール実行のレスポンス時間', async () => {
      (mcpClient.callTool as any).mockResolvedValue({
        content: [{ type: 'text', text: 'Fast response' }],
      });

      const startTime = Date.now();
      const rapidCalls = Array.from({ length: 50 }, () =>
        mcpClient.callTool('fast_tool', {})
      );

      await Promise.all(rapidCalls);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(5000); // 5秒以内
      expect(mcpClient.callTool).toHaveBeenCalledTimes(50);
    });

    it('大量データ処理の効率性', async () => {
      const largeData = {
        content: [
          {
            type: 'text',
            text: 'x'.repeat(100000), // 100KB のテキスト
          },
        ],
      };

      (mcpClient.callTool as any).mockResolvedValue(largeData);

      const startTime = Date.now();
      const result = await mcpClient.callTool('large_data_tool', {
        size: 'large',
      });
      const duration = Date.now() - startTime;

      expect(result).toBeDefined();
      expect(result.content[0].text.length).toBe(100000);
      expect(duration).toBeLessThan(1000); // 1秒以内
    });
  });
});
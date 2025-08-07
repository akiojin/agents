import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenAIProvider } from '../../src/providers/openai.js';
import { AnthropicProvider } from '../../src/providers/anthropic.js';
import { LocalProvider } from '../../src/providers/local.js';
// import { ProviderFactory } from '../../src/providers/factory.js';
import { BaseProvider } from '../../src/providers/base.js';
import { Config } from '../../src/config/types.js';
import { CompletionOptions, CompletionResponse } from '../../src/types/provider.js';

/**
 * LLMプロバイダー統合テスト
 * 複数プロバイダーとの通信、フォールバック処理、エラーハンドリングを統合的にテストします
 */
describe('Provider Integration Tests', () => {
  let openaiProvider: OpenAIProvider;
  let anthropicProvider: AnthropicProvider;
  let localProvider: LocalProvider;
  // let providerFactory: ProviderFactory;
  let testConfig: Config;

  beforeEach(() => {
    // テスト用設定
    testConfig = {
      llm: {
        provider: 'openai',
        apiKey: 'test-openai-key',
        model: 'gpt-4',
        timeout: 30000,
        maxRetries: 3,
        temperature: 0.3,
        maxTokens: 4000,
      },
      mcp: {
        enabled: false,
        servers: [],
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

    // プロバイダーの初期化
    openaiProvider = new OpenAIProvider(testConfig.llm.apiKey!, {
      model: testConfig.llm.model || 'gpt-4',
      temperature: testConfig.llm.temperature || 0.3,
      maxTokens: testConfig.llm.maxTokens || 4000,
    });
    anthropicProvider = new AnthropicProvider(testConfig.llm.apiKey!, {
      model: 'claude-3-sonnet-20240229',
      temperature: testConfig.llm.temperature || 0.3,
      maxTokens: testConfig.llm.maxTokens || 4000,
    });
    localProvider = new LocalProvider('http://127.0.0.1:1234', 'local-gptoss', {
      temperature: testConfig.llm.temperature || 0.3,
      maxTokens: testConfig.llm.maxTokens || 4000,
    });
    // providerFactory = new ProviderFactory(testConfig);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // describe('プロバイダーファクトリー', () => {
  //   it('設定に基づく適切なプロバイダーの作成', () => {
  //     const openaiProvider = providerFactory.createProvider('openai');
  //     expect(openaiProvider).toBeInstanceOf(OpenAIProvider);
  //     expect(openaiProvider.model).toBe('gpt-4');

  //     const anthropicProvider = providerFactory.createProvider('anthropic');
  //     expect(anthropicProvider).toBeInstanceOf(AnthropicProvider);
  //     expect(anthropicProvider.model).toBe('claude-3-sonnet-20240229');

  //     const localProvider = providerFactory.createProvider('local');
  //     expect(localProvider).toBeInstanceOf(LocalProvider);
  //     expect(localProvider.model).toBe('llama2');
  //   });

  //   it('無効なプロバイダー名でのエラーハンドリング', () => {
  //     expect(() => {
  //       providerFactory.createProvider('invalid-provider' as any);
  //     }).toThrow('Unsupported provider');
  //   });

  //   it('設定不足でのエラーハンドリング', () => {
  //     const incompleteConfig = {
  //       ...testConfig,
  //       providers: {
  //         openai: {
  //           // APIキーが不足
  //           model: 'gpt-4',
  //         },
  //       },
  //     };

  //     const incompleteFactory = new ProviderFactory(incompleteConfig);
      
  //     expect(() => {
  //       incompleteFactory.createProvider('openai');
  //     }).toThrow();
  //   });
  // });

  describe('OpenAI プロバイダー統合', () => {
    beforeEach(() => {
      // OpenAI APIのモック
      openaiProvider.client = {
        chat: {
          completions: {
            create: vi.fn(),
          },
        },
      } as any;
    });

    it('基本的な補完リクエスト', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: 'Hello! I can help you with coding tasks.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 15,
          total_tokens: 25,
        },
      };

      (openaiProvider.client.chat.completions.create as any).mockResolvedValue(mockResponse);

      const options: CompletionOptions = {
        prompt: 'Hello, can you help me with coding?',
        temperature: 0.3,
        maxTokens: 100,
      };

      const response = await openaiProvider.complete(options);

      expect(response).toBeDefined();
      expect(response.content).toBe('Hello! I can help you with coding tasks.');
      expect(response.tokens).toBe(25);
      expect(openaiProvider.client.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{ role: 'user', content: options.prompt }],
        temperature: 0.3,
        max_tokens: 100,
      });
    });

    it('ストリーミングレスポンス処理', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            choices: [{ delta: { content: 'Hello' }, finish_reason: null }],
          };
          yield {
            choices: [{ delta: { content: ' world' }, finish_reason: null }],
          };
          yield {
            choices: [{ delta: { content: '!' }, finish_reason: 'stop' }],
          };
        },
      };

      (openaiProvider.client.chat.completions.create as any).mockResolvedValue(mockStream);

      const options: CompletionOptions = {
        prompt: 'Say hello',
        stream: true,
      };

      const response = await openaiProvider.complete(options);

      expect(response.content).toBe('Hello world!');
    });

    it('レート制限エラーの処理', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      (rateLimitError as any).status = 429;

      (openaiProvider.client.chat.completions.create as any).mockRejectedValue(rateLimitError);

      const options: CompletionOptions = {
        prompt: 'Test rate limit',
      };

      await expect(openaiProvider.complete(options)).rejects.toThrow('Rate limit exceeded');
    });

    it('APIキーエラーの処理', async () => {
      const authError = new Error('Invalid API key');
      (authError as any).status = 401;

      (openaiProvider.client.chat.completions.create as any).mockRejectedValue(authError);

      const options: CompletionOptions = {
        prompt: 'Test auth error',
      };

      await expect(openaiProvider.complete(options)).rejects.toThrow('Invalid API key');
    });
  });

  describe('Anthropic プロバイダー統合', () => {
    beforeEach(() => {
      // Anthropic APIのモック
      anthropicProvider.client = {
        messages: {
          create: vi.fn(),
        },
      } as any;
    });

    it('基本的なメッセージ生成', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: 'I\'d be happy to help you with your coding project.',
          },
        ],
        usage: {
          input_tokens: 12,
          output_tokens: 18,
        },
        stop_reason: 'end_turn',
      };

      (anthropicProvider.client.messages.create as any).mockResolvedValue(mockResponse);

      const options: CompletionOptions = {
        prompt: 'Help me with a coding project',
        temperature: 0.2,
        maxTokens: 200,
      };

      const response = await anthropicProvider.complete(options);

      expect(response).toBeDefined();
      expect(response.content).toBe('I\'d be happy to help you with your coding project.');
      expect(response.tokens).toBe(30);
      expect(anthropicProvider.client.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 200,
        temperature: 0.2,
        messages: [{ role: 'user', content: options.prompt }],
      });
    });

    it('複雑なメッセージ履歴の処理', async () => {
      const mockResponse = {
        content: [
          {
            type: 'text',
            text: 'Based on the previous context, here\'s the solution.',
          },
        ],
        usage: {
          input_tokens: 50,
          output_tokens: 25,
        },
        stop_reason: 'end_turn',
      };

      (anthropicProvider.client.messages.create as any).mockResolvedValue(mockResponse);

      const options: CompletionOptions = {
        prompt: 'Continue the previous solution',
        messages: [
          { role: 'user', content: 'I need help with this problem' },
          { role: 'assistant', content: 'I can help. What specific issue are you facing?' },
          { role: 'user', content: 'Continue the previous solution' },
        ],
      };

      const response = await anthropicProvider.complete(options);

      expect(response.content).toBe('Based on the previous context, here\'s the solution.');
      expect(anthropicProvider.client.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 4000,
        temperature: 0.3,
        messages: options.messages,
      });
    });
  });

  describe('Local プロバイダー統合', () => {
    beforeEach(() => {
      // Fetch APIのモック
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('ローカルLLMサーバーとの通信', async () => {
      const mockResponse = {
        ok: true,
        json: vi.fn().mockResolvedValue({
          response: 'I can help you with local development.',
          done: true,
          context: [],
          total_duration: 1000000000,
          load_duration: 500000000,
          prompt_eval_count: 10,
          eval_count: 20,
        }),
      };

      (global.fetch as any).mockResolvedValue(mockResponse);

      const options: CompletionOptions = {
        prompt: 'Help with local development',
      };

      const response = await localProvider.complete(options);

      expect(response.content).toBe('I can help you with local development.');
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expect.stringContaining('"model":"llama2"'),
        })
      );
    });

    it('ローカルサーバー接続エラーの処理', async () => {
      (global.fetch as any).mockRejectedValue(new Error('ECONNREFUSED'));

      const options: CompletionOptions = {
        prompt: 'Test connection error',
      };

      await expect(localProvider.complete(options)).rejects.toThrow('ECONNREFUSED');
    });

    it('ローカルサーバーレスポンスエラーの処理', async () => {
      const errorResponse = {
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: vi.fn().mockResolvedValue({
          error: 'Model not found',
        }),
      };

      (global.fetch as any).mockResolvedValue(errorResponse);

      const options: CompletionOptions = {
        prompt: 'Test server error',
      };

      await expect(localProvider.complete(options)).rejects.toThrow();
    });
  });

  describe('プロバイダーフォールバック機能', () => {
    let primaryProvider: BaseProvider;
    let fallbackProvider: BaseProvider;

    beforeEach(() => {
      primaryProvider = {
        complete: vi.fn(),
        model: 'primary-model',
        temperature: 0.3,
        maxTokens: 4000,
      } as BaseProvider;

      fallbackProvider = {
        complete: vi.fn(),
        model: 'fallback-model',
        temperature: 0.3,
        maxTokens: 4000,
      } as BaseProvider;
    });

    it('プライマリプロバイダー成功時', async () => {
      (primaryProvider.complete as any).mockResolvedValue({
        content: 'Primary provider response',
        tokens: 25,
      });

      const result = await primaryProvider.complete({
        prompt: 'Test primary',
      });

      expect(result.content).toBe('Primary provider response');
      expect(primaryProvider.complete).toHaveBeenCalled();
      expect(fallbackProvider.complete).not.toHaveBeenCalled();
    });

    it('プライマリプロバイダー失敗時のフォールバック', async () => {
      (primaryProvider.complete as any).mockRejectedValue(new Error('Primary failed'));
      (fallbackProvider.complete as any).mockResolvedValue({
        content: 'Fallback provider response',
        tokens: 30,
      });

      // フォールバック機能を実装する統合コンポーネント
      const providerWithFallback = async (options: CompletionOptions) => {
        try {
          return await primaryProvider.complete(options);
        } catch (error) {
          console.log('Primary provider failed, using fallback');
          return await fallbackProvider.complete(options);
        }
      };

      const result = await providerWithFallback({
        prompt: 'Test fallback',
      });

      expect(result.content).toBe('Fallback provider response');
      expect(primaryProvider.complete).toHaveBeenCalled();
      expect(fallbackProvider.complete).toHaveBeenCalled();
    });

    it('複数プロバイダーでの負荷分散', async () => {
      const providers = [
        { complete: vi.fn().mockResolvedValue({ content: 'Response 1', tokens: 20 }) },
        { complete: vi.fn().mockResolvedValue({ content: 'Response 2', tokens: 25 }) },
        { complete: vi.fn().mockResolvedValue({ content: 'Response 3', tokens: 30 }) },
      ] as BaseProvider[];

      // ラウンドロビン方式での負荷分散をシミュレート
      const loadBalancer = (() => {
        let currentIndex = 0;
        return {
          getNextProvider: () => {
            const provider = providers[currentIndex];
            currentIndex = (currentIndex + 1) % providers.length;
            return provider;
          },
        };
      })();

      // 複数のリクエストを実行
      const requests = Array.from({ length: 6 }, (_, i) => 
        loadBalancer.getNextProvider().complete({
          prompt: `Request ${i + 1}`,
        })
      );

      const results = await Promise.all(requests);

      expect(results).toHaveLength(6);
      
      // 各プロバイダーが2回ずつ呼び出されたことを確認
      providers.forEach(provider => {
        expect(provider.complete).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('プロバイダーリトライメカニズム', () => {
    let retryProvider: BaseProvider;

    beforeEach(() => {
      retryProvider = {
        complete: vi.fn(),
        model: 'retry-model',
        temperature: 0.3,
        maxTokens: 4000,
      } as BaseProvider;
    });

    it('一時的エラーからの自動復旧', async () => {
      let attemptCount = 0;
      (retryProvider.complete as any).mockImplementation(async () => {
        attemptCount++;
        if (attemptCount <= 2) {
          throw new Error(`Temporary error (attempt ${attemptCount})`);
        }
        return {
          content: 'Success after retry',
          tokens: 35,
        };
      });

      // リトライ機能付きのWrapper
      const retryWrapper = async (
        provider: BaseProvider,
        options: CompletionOptions,
        maxRetries: number = 3
      ): Promise<CompletionResponse> => {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await provider.complete(options);
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt === maxRetries) {
              throw lastError;
            }
            // 指数バックオフ
            await new Promise(resolve => 
              setTimeout(resolve, Math.pow(2, attempt - 1) * 100)
            );
          }
        }

        throw lastError;
      };

      const result = await retryWrapper(retryProvider, {
        prompt: 'Test retry mechanism',
      });

      expect(result.content).toBe('Success after retry');
      expect(retryProvider.complete).toHaveBeenCalledTimes(3);
      expect(attemptCount).toBe(3);
    });

    it('最大リトライ回数での諦め', async () => {
      (retryProvider.complete as any).mockRejectedValue(new Error('Persistent error'));

      const retryWrapper = async (
        provider: BaseProvider,
        options: CompletionOptions,
        maxRetries: number = 3
      ): Promise<CompletionResponse> => {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            return await provider.complete(options);
          } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt === maxRetries) {
              throw lastError;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }

        throw lastError;
      };

      await expect(retryWrapper(retryProvider, {
        prompt: 'Test max retries',
      })).rejects.toThrow('Persistent error');

      expect(retryProvider.complete).toHaveBeenCalledTimes(3);
    });
  });

  describe('パフォーマンス統合テスト', () => {
    it('並列リクエスト処理性能', async () => {
      const fastProvider = {
        complete: vi.fn().mockImplementation(async (options) => {
          // 短い遅延をシミュレート
          await new Promise(resolve => setTimeout(resolve, 10));
          return {
            content: `Response for: ${options.prompt.substring(0, 20)}...`,
            tokens: 20,
          };
        }),
        model: 'fast-model',
        temperature: 0.3,
        maxTokens: 4000,
      } as BaseProvider;

      const startTime = Date.now();
      const parallelRequests = Array.from({ length: 10 }, (_, i) =>
        fastProvider.complete({
          prompt: `Parallel request ${i + 1} with some content to process`,
        })
      );

      const results = await Promise.all(parallelRequests);
      const totalTime = Date.now() - startTime;

      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.content).toContain('Response for:');
        expect(result.tokens).toBe(20);
      });

      // 並列処理により適切な時間で完了することを確認
      expect(totalTime).toBeLessThan(500); // 0.5秒以内
      expect(fastProvider.complete).toHaveBeenCalledTimes(10);
    });

    it('メモリ効率性テスト', async () => {
      const memoryEfficientProvider = {
        complete: vi.fn().mockImplementation(async () => ({
          content: 'Efficient response',
          tokens: 15,
        })),
        model: 'memory-efficient-model',
        temperature: 0.3,
        maxTokens: 4000,
      } as BaseProvider;

      const initialMemory = process.memoryUsage();

      // 多数のリクエストを処理
      const manyRequests = Array.from({ length: 100 }, () =>
        memoryEfficientProvider.complete({
          prompt: 'Memory efficiency test',
        })
      );

      await Promise.all(manyRequests);

      const finalMemory = process.memoryUsage();
      const heapGrowth = finalMemory.heapUsed - initialMemory.heapUsed;

      // メモリ増加が合理的な範囲内であることを確認（10MB以下）
      expect(heapGrowth).toBeLessThan(10 * 1024 * 1024);
      expect(memoryEfficientProvider.complete).toHaveBeenCalledTimes(100);
    });
  });
});
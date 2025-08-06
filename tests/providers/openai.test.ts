import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIProvider } from '../../src/providers/openai';
import OpenAI from 'openai';
import type { ChatMessage } from '../../src/types/config';

// OpenAIモジュールをモック
vi.mock('openai');

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;
  let mockClient: any;

  beforeEach(() => {
    mockClient = {
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{
              message: {
                content: 'テスト応答',
              },
            }],
          }),
        },
      },
      models: {
        list: vi.fn().mockResolvedValue({
          data: [
            { id: 'gpt-4' },
            { id: 'gpt-3.5-turbo' },
            { id: 'text-davinci-003' },
          ],
        }),
      },
    };

    vi.mocked(OpenAI).mockImplementation(() => mockClient);
    provider = new OpenAIProvider('test-api-key', 'gpt-4');
  });

  describe('chat', () => {
    it('メッセージを送信して応答を受け取る', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'こんにちは',
          timestamp: new Date(),
        },
      ];

      const response = await provider.chat(messages);

      expect(response).toBe('テスト応答');
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'こんにちは',
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: false,
      });
    });

    it('カスタムオプションを適用できる', async () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: 'テスト',
          timestamp: new Date(),
        },
      ];

      await provider.chat(messages, {
        model: 'gpt-3.5-turbo',
        temperature: 0.5,
        maxTokens: 1000,
      });

      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        messages: expect.any(Array),
        temperature: 0.5,
        max_tokens: 1000,
        stream: false,
      });
    });

    it('空の応答の場合エラーをスローする', async () => {
      mockClient.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: null,
          },
        }],
      });

      await expect(provider.chat([])).rejects.toThrow('応答が空です');
    });
  });

  describe('complete', () => {
    it('プロンプトを送信して応答を受け取る', async () => {
      const response = await provider.complete({
        prompt: 'テストプロンプト',
      });

      expect(response).toBe('テスト応答');
      expect(mockClient.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [
          {
            role: 'user',
            content: 'テストプロンプト',
          },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        stream: false,
      });
    });
  });

  describe('listModels', () => {
    it('利用可能なGPTモデルのリストを返す', async () => {
      const models = await provider.listModels();

      expect(models).toEqual(['gpt-4', 'gpt-3.5-turbo']);
      expect(mockClient.models.list).toHaveBeenCalled();
    });
  });

  describe('validateConnection', () => {
    it('接続が有効な場合trueを返す', async () => {
      const isValid = await provider.validateConnection();

      expect(isValid).toBe(true);
      expect(mockClient.models.list).toHaveBeenCalled();
    });

    it('接続エラーの場合falseを返す', async () => {
      mockClient.models.list.mockRejectedValue(new Error('Connection error'));

      const isValid = await provider.validateConnection();

      expect(isValid).toBe(false);
    });
  });
});
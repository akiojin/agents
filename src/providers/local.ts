import type { ChatMessage } from '../types/config.js';
import { LLMProvider, type ChatOptions, type CompletionOptions } from './base.js';
import { logger } from '../utils/logger.js';

interface LocalAPIRequest {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  prompt?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface LocalAPIResponse {
  choices: Array<{
    message?: { content: string };
    text?: string;
  }>;
}

export class LocalProvider extends LLMProvider {
  private providerType: 'local-gptoss' | 'local-lmstudio';

  constructor(endpoint: string, providerType: 'local-gptoss' | 'local-lmstudio') {
    super(undefined, endpoint);
    this.providerType = providerType;
  }

  private async makeRequest(body: LocalAPIRequest): Promise<LocalAPIResponse> {
    try {
      const endpoint =
        this.providerType === 'local-gptoss'
          ? `${this.endpoint}/v1/chat/completions`
          : `${this.endpoint}/v1/completions`;

      logger.debug(`ローカルAPIリクエスト開始: ${endpoint}`, { 
        providerType: this.providerType,
        hasModel: !!body.model,
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort();
      }, 60000); // 60秒タイムアウト

      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': '@akiojin/agents',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          let errorMessage = `ローカルAPI エラー: ${response.status} ${response.statusText}`;
          
          try {
            const errorBody = await response.text();
            if (errorBody) {
              errorMessage += ` - ${errorBody}`;
            }
          } catch (readError) {
            logger.debug('エラーレスポンス読み取り失敗:', readError);
          }

          // HTTPステータスコード別のエラーメッセージ
          switch (response.status) {
            case 400:
              throw new Error('無効なリクエストです。パラメータを確認してください。');
            case 401:
              throw new Error('認証が必要です。APIキーまたは設定を確認してください。');
            case 404:
              throw new Error('エンドポイントが見つかりません。サーバー設定を確認してください。');
            case 500:
              throw new Error('ローカルサーバーで内部エラーが発生しました。');
            case 502:
            case 503:
            case 504:
              throw new Error('ローカルサーバーが利用できません。サーバーの状態を確認してください。');
            default:
              throw new Error(errorMessage);
          }
        }

        // レスポンス検証
        const contentType = response.headers.get('content-type');
        if (!contentType?.includes('application/json')) {
          throw new Error(`予期されたJSONレスポンスではありません: ${contentType}`);
        }

        const result = await response.json() as LocalAPIResponse;
        
        // 基本的なレスポンス形式検証
        if (!result || typeof result !== 'object') {
          throw new Error('無効なJSONレスポンス形式です');
        }

        if (!result.choices || !Array.isArray(result.choices) || result.choices.length === 0) {
          throw new Error('レスポンスにchoicesが含まれていません');
        }

        logger.debug('ローカルAPIリクエスト完了');
        return result;

      } catch (fetchError) {
        clearTimeout(timeout);
        
        if (fetchError instanceof Error) {
          if (fetchError.name === 'AbortError') {
            throw new Error('ローカルAPIリクエストがタイムアウトしました（60秒）');
          } else if (fetchError.message.includes('ECONNREFUSED')) {
            throw new Error(`ローカルサーバー（${this.endpoint}）に接続できません。サーバーが起動しているか確認してください。`);
          } else if (fetchError.message.includes('ENOTFOUND')) {
            throw new Error(`ローカルサーバーのアドレス（${this.endpoint}）が見つかりません。設定を確認してください。`);
          }
        }
        
        throw fetchError;
      }

    } catch (error) {
      logger.error('ローカルAPIリクエストエラー:', error);
      throw error;
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    try {
      // 入力検証
      if (!messages || messages.length === 0) {
        throw new Error('メッセージが指定されていません');
      }

      // メッセージ形式の検証と変換
      const localMessages = messages.map((msg, index) => {
        if (!msg.role || !msg.content) {
          throw new Error(`無効なメッセージ形式 (インデックス: ${index})`);
        }
        
        const content = msg.content.trim();
        if (content.length === 0) {
          throw new Error(`空のメッセージ内容 (インデックス: ${index})`);
        }
        
        return {
          role: msg.role,
          content,
        };
      });

      const body: LocalAPIRequest = {
        messages: localMessages,
        temperature: Math.min(Math.max(options?.temperature || 0.7, 0), 2),
        max_tokens: Math.min(Math.max(options?.maxTokens || 2000, 1), 8192),
        stream: options?.stream || false,
      };

      if (options?.model) {
        body.model = options.model;
      }

      logger.debug(`ローカルプロバイダーチャット開始: ${this.providerType}`, {
        messageCount: localMessages.length,
        model: body.model,
        maxTokens: body.max_tokens,
      });

      const response = await this.makeRequest(body);

      // レスポンス内容を取得
      const content =
        this.providerType === 'local-gptoss'
          ? response.choices[0]?.message?.content
          : response.choices[0]?.text;

      if (!content) {
        // より詳細なエラー情報
        const choice = response.choices[0];
        if (choice?.finish_reason === 'length') {
          throw new Error('レスポンスが最大トークン数に達しました。max_tokensを増やしてください。');
        } else {
          throw new Error('ローカルAPIから空のレスポンスが返されました');
        }
      }

      const trimmedContent = content.trim();
      if (trimmedContent.length === 0) {
        throw new Error('ローカルAPIから空の内容が返されました');
      }

      logger.debug(`ローカルプロバイダーチャット完了: ${trimmedContent.length}文字`);
      return trimmedContent;

    } catch (error) {
      logger.error('Local provider chat error:', error);
      
      // エラーメッセージの改善
      if (error instanceof Error) {
        if (error.message.includes('接続できません') || error.message.includes('ECONNREFUSED')) {
          throw new Error(`ローカルサーバー（${this.endpoint}）への接続に失敗しました。サーバーが起動しているか確認してください。`);
        } else if (error.message.includes('タイムアウト')) {
          throw new Error('ローカルサーバーへのリクエストがタイムアウトしました。サーバーの負荷を確認してください。');
        }
      }
      
      throw error;
    }
  }

  async complete(options: CompletionOptions): Promise<string> {
    try {
      const body: LocalAPIRequest = {
        prompt: options.prompt,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: options.stream || false,
      };

      if (options.model) {
        body.model = options.model;
      }

      const response = await this.makeRequest(body);

      const content = response.choices[0]?.text || response.choices[0]?.message?.content;

      if (!content) {
        throw new Error('応答が空です');
      }

      return content;
    } catch (error) {
      logger.error('Local provider completion error:', error);
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      // ローカルプロバイダーのモデルリストエンドポイント
      const endpoint = `${this.endpoint}/v1/models`;
      const response = await fetch(endpoint);

      if (!response.ok) {
        logger.warn('モデルリストの取得に失敗しました');
        return ['local-model'];
      }

      const data = (await response.json()) as { data: Array<{ id: string }> };
      return data.data.map((model) => model.id);
    } catch (error) {
      logger.error('Local provider list models error:', error);
      // エラーの場合はデフォルトモデルを返す
      return ['local-model'];
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      logger.debug(`ローカルプロバイダー接続検証開始: ${this.endpoint}`);
      
      // まずヘルスチェックエンドポイントを試す
      try {
        const healthController = new AbortController();
        setTimeout(() => healthController.abort(), 5000);

        const healthResponse = await fetch(`${this.endpoint}/health`, {
          method: 'GET',
          signal: healthController.signal,
          headers: {
            'User-Agent': '@akiojin/agents',
          },
        });

        if (healthResponse.ok) {
          logger.debug('ローカルサーバー接続検証成功（/health）');
          return true;
        }
      } catch (healthError) {
        logger.debug('ヘルスチェックエンドポイントは利用できません、モデルエンドポイントで検証します');
      }

      // ヘルスエンドポイントが利用できない場合はモデルエンドポイントを試す
      try {
        const modelsController = new AbortController();
        setTimeout(() => modelsController.abort(), 5000);

        const modelsResponse = await fetch(`${this.endpoint}/v1/models`, {
          method: 'GET',
          signal: modelsController.signal,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': '@akiojin/agents',
          },
        });

        if (modelsResponse.ok) {
          logger.debug('ローカルサーバー接続検証成功（/v1/models）');
          return true;
        }
        
        logger.warn(`モデルエンドポイントレスポンス: ${modelsResponse.status} ${modelsResponse.statusText}`);
      } catch (modelsError) {
        logger.debug('モデルエンドポイントも失敗しました:', modelsError);
      }

      // 最後の手段として基本的な接続テストを実行
      try {
        const baseController = new AbortController();
        setTimeout(() => baseController.abort(), 3000);

        const baseResponse = await fetch(this.endpoint, {
          method: 'HEAD',
          signal: baseController.signal,
        });

        // ステータスコードが200番台または400番台なら接続は成功している
        if (baseResponse.status < 500) {
          logger.debug(`ローカルサーバー基本接続確認: ${baseResponse.status}`);
          return true;
        }
      } catch (baseError) {
        logger.debug('基本接続テストも失敗:', baseError);
      }

      logger.error(`ローカルプロバイダー接続検証失敗: ${this.endpoint}`);
      return false;

    } catch (error) {
      logger.error('Local provider connection validation failed:', error);
      
      // エラーログに詳細情報を記録
      if (error instanceof Error) {
        logger.error('接続検証エラー詳細:', {
          message: error.message,
          endpoint: this.endpoint,
          providerType: this.providerType,
        });
        
        if (error.message.includes('ECONNREFUSED')) {
          logger.error(`サーバー（${this.endpoint}）が起動していない可能性があります`);
        } else if (error.message.includes('ENOTFOUND')) {
          logger.error(`サーバーアドレス（${this.endpoint}）が無効な可能性があります`);
        }
      }
      
      return false;
    }
  }
}

import { logger } from '../utils/logger.js';
import type { FunctionDefinition } from './function-converter.js';

/**
 * ツール制限検出結果
 */
export interface ToolLimitDetectionResult {
  maxTools: number;
  source: 'cached' | 'detected' | 'default';
  retryCount: number;
}

/**
 * LLMプロバイダーのツール制限を動的に検出・管理
 */
export class ToolLimitDetector {
  private cachedLimits = new Map<string, number>();
  private readonly DEFAULT_LIMITS = [100, 50, 20, 10, 5];
  private readonly PROVIDER_DEFAULTS = new Map([
    ['openai', 50],
    ['anthropic', 40], 
    ['local-gptoss', 25],
    ['local-lmstudio', 20]
  ]);

  /**
   * プロバイダーの最大ツール数を検出
   */
  async detectMaxTools(
    provider: string,
    model: string | undefined,
    testFunction: (toolCount: number) => Promise<boolean>
  ): Promise<ToolLimitDetectionResult> {
    const cacheKey = `${provider}-${model || 'default'}`;
    
    // キャッシュから取得を試行
    const cached = this.cachedLimits.get(cacheKey);
    if (cached) {
      logger.debug(`Using cached tool limit for ${cacheKey}: ${cached}`);
      return {
        maxTools: cached,
        source: 'cached',
        retryCount: 0
      };
    }

    // プロバイダー固有のデフォルト値から開始
    const startLimit = this.getProviderDefault(provider, model);
    const testLimits = this.generateTestSequence(startLimit);
    
    logger.debug(`Detecting tool limit for ${cacheKey}, starting with ${startLimit}`);
    
    let retryCount = 0;
    for (const limit of testLimits) {
      try {
        logger.debug(`Testing with ${limit} tools`);
        const success = await testFunction(limit);
        
        if (success) {
          // 成功した場合、この値をキャッシュ
          this.cachedLimits.set(cacheKey, limit);
          logger.info(`Tool limit detected for ${cacheKey}: ${limit} tools (retries: ${retryCount})`);
          
          return {
            maxTools: limit,
            source: 'detected',
            retryCount
          };
        }
        
        retryCount++;
      } catch (error) {
        logger.debug(`Tool limit test failed at ${limit}: ${error instanceof Error ? error.message : String(error)}`);
        retryCount++;
        continue;
      }
    }
    
    // すべて失敗した場合は最小値を使用
    const fallbackLimit = 5;
    this.cachedLimits.set(cacheKey, fallbackLimit);
    logger.warn(`All tool limit tests failed for ${cacheKey}, using fallback: ${fallbackLimit}`);
    
    return {
      maxTools: fallbackLimit,
      source: 'default',
      retryCount
    };
  }

  /**
   * プロバイダー固有のデフォルト値を取得
   */
  private getProviderDefault(provider: string, model?: string): number {
    // モデル固有の制限があれば優先
    if (provider === 'openai' && model) {
      if (model.includes('gpt-4')) return 128;
      if (model.includes('gpt-3.5')) return 20;
    }
    
    if (provider === 'anthropic' && model) {
      if (model.includes('claude-3')) return 20;
      if (model.includes('claude-2')) return 15;
    }
    
    return this.PROVIDER_DEFAULTS.get(provider) || 10;
  }

  /**
   * テスト用の制限値シーケンスを生成
   */
  private generateTestSequence(startLimit: number): number[] {
    // startLimitから始めて段階的に減少
    const sequence = [];
    
    // startLimitが100より大きい場合は100から開始
    const maxStart = Math.min(startLimit, 100);
    
    // 標準の減少シーケンスを使用
    for (const limit of this.DEFAULT_LIMITS) {
      if (limit <= maxStart) {
        sequence.push(limit);
      }
    }
    
    // startLimitが標準シーケンスにない場合は追加
    if (!sequence.includes(startLimit) && startLimit < 100) {
      sequence.unshift(startLimit);
      sequence.sort((a, b) => b - a); // 降順でソート
    }
    
    return sequence;
  }

  /**
   * エラーメッセージからツール制限エラーかどうかを判定
   */
  isToolLimitError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const toolLimitPatterns = [
      'too many tools',
      'tool limit exceeded',
      'maximum tools',
      'tool count limit',
      'exceed.*tool.*limit',
      'invalid.*tool.*count'
    ];
    
    return toolLimitPatterns.some(pattern => 
      new RegExp(pattern).test(message)
    );
  }

  /**
   * キャッシュされた制限値をクリア
   */
  clearCache(provider?: string): void {
    if (provider) {
      // 特定プロバイダーのキャッシュをクリア
      const keysToDelete = Array.from(this.cachedLimits.keys())
        .filter(key => key.startsWith(provider));
      
      keysToDelete.forEach(key => this.cachedLimits.delete(key));
      logger.debug(`Cleared tool limit cache for provider: ${provider}`);
    } else {
      // 全キャッシュをクリア
      this.cachedLimits.clear();
      logger.debug('Cleared all tool limit cache');
    }
  }

  /**
   * キャッシュされた制限値を取得（デバッグ用）
   */
  getCachedLimits(): Record<string, number> {
    return Object.fromEntries(this.cachedLimits);
  }

  /**
   * 簡易的な制限値取得（キャッシュまたはデフォルト）
   */
  getKnownLimit(provider: string, model?: string): number {
    const cacheKey = `${provider}-${model || 'default'}`;
    return this.cachedLimits.get(cacheKey) || this.getProviderDefault(provider, model);
  }

  /**
   * ツール制限に達しないよう安全にツールを選択
   */
  selectSafeToolCount(tools: FunctionDefinition[], provider: string, model?: string): FunctionDefinition[] {
    const limit = this.getKnownLimit(provider, model);
    if (tools.length <= limit) {
      return tools;
    }
    
    logger.debug(`Limiting tools from ${tools.length} to ${limit} for ${provider}`);
    return tools.slice(0, limit);
  }
}
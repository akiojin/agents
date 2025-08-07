import { describe, it, expect, beforeEach } from 'vitest';
import { withRetry, RetryHandler, sleep } from '../../src/utils/retry.js';

describe('Retry Utility', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const mockFn = () => Promise.resolve('success');
      
      const result = await withRetry(mockFn);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attemptCount).toBe(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      let attempt = 0;
      const mockFn = () => {
        attempt++;
        if (attempt <= 2) {
          return Promise.reject(new Error('timeout'));
        }
        return Promise.resolve('success');
      };
      
      const result = await withRetry(mockFn, { maxRetries: 3, delay: 10 });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attemptCount).toBe(3);
    });

    it('should fail after max retries', async () => {
      const error = new Error('timeout error');
      const mockFn = () => Promise.reject(error);
      
      const result = await withRetry(mockFn, { maxRetries: 2, delay: 10 });

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
      expect(result.attemptCount).toBe(2);
    });

    it('should respect custom shouldRetry function', async () => {
      const error = new Error('custom error');
      const mockFn = () => Promise.reject(error);
      const shouldRetry = () => false;
      
      const result = await withRetry(mockFn, { maxRetries: 3, shouldRetry });

      expect(result.success).toBe(false);
      expect(result.attemptCount).toBe(1);
    });

    it('should handle timeout', async () => {
      const mockFn = () => new Promise(resolve => setTimeout(() => resolve('too late'), 2000));
      
      const result = await withRetry(mockFn, { timeout: 100 });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('タイムアウト');
      expect(result.attemptCount).toBe(1);
    });

    it('should handle non-Error exceptions', async () => {
      const mockFn = () => Promise.reject('string error');
      
      const result = await withRetry(mockFn, { maxRetries: 1, delay: 10 });

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('string error');
    });
  });

  describe('sleep function', () => {
    it('should wait for specified time', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('RetryHandler class', () => {
    let handler: RetryHandler;

    beforeEach(() => {
      handler = new RetryHandler();
    });

    it('should create with default options', () => {
      const options = handler.getDefaultOptions();
      
      expect(options.maxRetries).toBe(3);
      expect(options.delay).toBe(1000);
      expect(options.exponentialBackoff).toBe(false);
      expect(options.timeout).toBe(30000);
    });

    it('should create with custom default options', () => {
      const customOptions = {
        maxRetries: 5,
        delay: 2000,
        exponentialBackoff: true,
        timeout: 60000,
      };
      
      const customHandler = new RetryHandler(customOptions);
      const options = customHandler.getDefaultOptions();
      
      expect(options.maxRetries).toBe(5);
      expect(options.delay).toBe(2000);
      expect(options.exponentialBackoff).toBe(true);
      expect(options.timeout).toBe(60000);
    });

    it('should execute with default options', async () => {
      const mockFn = () => Promise.resolve('success');
      
      const result = await handler.execute(mockFn);

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
    });

    it('should execute with custom options override', async () => {
      const mockFn = () => Promise.reject(new Error('timeout'));
      
      const result = await handler.execute(mockFn, { maxRetries: 1, delay: 10 });

      expect(result.success).toBe(false);
      expect(result.attemptCount).toBe(1);
    });

    it('should update default options', () => {
      handler.setDefaultOptions({ maxRetries: 10 });
      
      const options = handler.getDefaultOptions();
      expect(options.maxRetries).toBe(10);
      expect(options.delay).toBe(1000); // 他のオプションは変更されない
    });
  });

  describe('Default retry conditions', () => {
    it('should retry on timeout errors', async () => {
      let attempt = 0;
      const mockFn = () => {
        attempt++;
        if (attempt === 1) {
          return Promise.reject(new Error('Request timeout'));
        }
        return Promise.resolve('success');
      };
      
      const result = await withRetry(mockFn, { delay: 10 });

      expect(result.success).toBe(true);
      expect(result.attemptCount).toBe(2);
    });

    it('should retry on network errors', async () => {
      let attempt = 0;
      const mockFn = () => {
        attempt++;
        if (attempt === 1) {
          return Promise.reject(new Error('Network connection failed'));
        }
        return Promise.resolve('success');
      };
      
      const result = await withRetry(mockFn, { delay: 10 });

      expect(result.success).toBe(true);
      expect(result.attemptCount).toBe(2);
    });

    it('should retry on rate limit errors', async () => {
      let attempt = 0;
      const mockFn = () => {
        attempt++;
        if (attempt <= 2) {
          const errorMessage = attempt === 1 ? 'Rate limit exceeded' : 'Too many requests';
          return Promise.reject(new Error(errorMessage));
        }
        return Promise.resolve('success');
      };
      
      const result = await withRetry(mockFn, { delay: 10 });

      expect(result.success).toBe(true);
      expect(result.attemptCount).toBe(3);
    });

    it('should not retry on authentication errors', async () => {
      const error = new Error('Authentication failed');
      const mockFn = () => Promise.reject(error);
      
      const result = await withRetry(mockFn, { delay: 10 });

      expect(result.success).toBe(false);
      expect(result.attemptCount).toBe(1);
    });

    it('should not retry on validation errors', async () => {
      const error = new Error('Invalid input format');
      const mockFn = () => Promise.reject(error);
      
      const result = await withRetry(mockFn, { delay: 10 });

      expect(result.success).toBe(false);
      expect(result.attemptCount).toBe(1);
    });
  });

  describe('Edge cases', () => {
    it('should handle zero max retries', async () => {
      const error = new Error('timeout');
      const mockFn = () => Promise.reject(error);
      
      const result = await withRetry(mockFn, { maxRetries: 0 });

      expect(result.success).toBe(false);
      expect(result.attemptCount).toBe(0);
    });

    it('should handle exponential backoff', async () => {
      let attempt = 0;
      const mockFn = () => {
        attempt++;
        if (attempt <= 2) {
          return Promise.reject(new Error('timeout'));
        }
        return Promise.resolve('success');
      };
      
      const result = await withRetry(mockFn, { 
        maxRetries: 3, 
        delay: 10,
        exponentialBackoff: true 
      });

      expect(result.success).toBe(true);
      expect(result.attemptCount).toBe(3);
    });

    it('should track total execution time', async () => {
      const mockFn = () => Promise.resolve('success');
      
      const result = await withRetry(mockFn);

      expect(result.totalTime).toBeGreaterThanOrEqual(0);
      expect(typeof result.totalTime).toBe('number');
    });
  });
});
import { describe, it, expect, beforeEach } from 'vitest';
import { ParallelExecutor } from '../../src/core/parallel-executor.js';

describe('ParallelExecutor', () => {
  let parallelExecutor: ParallelExecutor;

  beforeEach(() => {
    parallelExecutor = new ParallelExecutor(3);
  });

  it('基本的な並列実行が動作する', async () => {
    const tasks = [
      () => Promise.resolve('task1'),
      () => Promise.resolve('task2'),
      () => Promise.resolve('task3'),
    ];

    const results = await parallelExecutor.executeParallel(tasks);
    
    expect(results).toHaveLength(3);
    expect(results).toContain('task1');
    expect(results).toContain('task2');
    expect(results).toContain('task3');
  });

  it('詳細な並列実行が動作する', async () => {
    const parallelTasks = [
      {
        id: 'test1',
        description: 'Test task 1',
        priority: 5,
        task: () => Promise.resolve('result1'),
      },
      {
        id: 'test2',
        description: 'Test task 2',
        priority: 3,
        task: () => Promise.resolve('result2'),
      },
      {
        id: 'test3',
        description: 'Test task 3',
        priority: 8,
        task: () => Promise.resolve('result3'),
      },
    ];

    const results = await parallelExecutor.executeParallelWithDetails(parallelTasks);
    
    expect(results).toHaveLength(3);
    expect(results.every(r => r.success)).toBe(true);
    expect(results.every(r => r.duration >= 0)).toBe(true); // durationは0以上であれば問題なし
    
    // 実行順序は並列処理により不定だが、全て成功することを確認
    const taskIds = results.map(r => r.taskId).sort();
    expect(taskIds).toEqual(['test1', 'test2', 'test3']);
  });

  it('エラー処理が正常に動作する', async () => {
    const parallelTasks = [
      {
        id: 'success',
        description: 'Success task',
        task: () => Promise.resolve('ok'),
      },
      {
        id: 'error',
        description: 'Error task',
        task: () => Promise.reject(new Error('Test error')),
      },
    ];

    const results = await parallelExecutor.executeParallelWithDetails(parallelTasks);
    
    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].error?.message).toBe('Test error');
  });

  it('タイムアウトが正常に動作する', async () => {
    const parallelTasks = [
      {
        id: 'timeout-test',
        description: 'Timeout test',
        timeout: 100,
        task: () => new Promise(resolve => setTimeout(() => resolve('done'), 200)),
      },
    ];

    const results = await parallelExecutor.executeParallelWithDetails(parallelTasks);
    
    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(false);
    expect(results[0].error?.message).toContain('timed out');
  });

  it('並列度の設定と取得が正常に動作する', () => {
    expect(parallelExecutor.getMaxConcurrency()).toBe(3);
    
    parallelExecutor.setMaxConcurrency(5);
    expect(parallelExecutor.getMaxConcurrency()).toBe(5);
    
    // 最小値は1
    parallelExecutor.setMaxConcurrency(0);
    expect(parallelExecutor.getMaxConcurrency()).toBe(1);
  });

  it('進捗コールバックが正常に呼ばれる', async () => {
    const progressUpdates: Array<{completed: number, total: number, currentTask?: string}> = [];
    
    const tasks = [
      () => Promise.resolve('task1'),
      () => Promise.resolve('task2'),
      () => Promise.resolve('task3'),
    ];

    await parallelExecutor.executeParallel(tasks, (completed, total, currentTask) => {
      progressUpdates.push({ completed, total, currentTask });
    });

    expect(progressUpdates).toHaveLength(3);
    expect(progressUpdates[0]).toEqual({ completed: 1, total: 3, currentTask: 'Task 1' });
    expect(progressUpdates[1]).toEqual({ completed: 2, total: 3, currentTask: 'Task 2' });
    expect(progressUpdates[2]).toEqual({ completed: 3, total: 3, currentTask: 'Task 3' });
  });

  it('空のタスク配列を処理できる', async () => {
    const results = await parallelExecutor.executeParallel([]);
    expect(results).toEqual([]);

    const detailedResults = await parallelExecutor.executeParallelWithDetails([]);
    expect(detailedResults).toEqual([]);
  });
});
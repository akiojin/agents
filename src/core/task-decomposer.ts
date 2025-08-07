/**
 * タスク分解機能を提供するクラス
 * 複雑なタスクをより小さなサブタスクに分解する
 */
export class SimpleTaskDecomposer {
  /**
   * タスクをサブタスクに分解する
   * @param task 分解対象のタスク文字列
   * @returns サブタスクの配列
   */
  decompose(task: string): string[] {
    // シンプルなルールベースの分解
    const subtasks: string[] = [];
    
    // "and" で分割
    if (task.includes(' and ')) {
      return task.split(' and ').map(t => t.trim());
    }
    
    // 「、」で分割（日本語）
    if (task.includes('、')) {
      return task.split('、').map(t => t.trim());  
    }
    
    // セミコロンで分割
    if (task.includes(';')) {
      return task.split(';').map(t => t.trim());
    }
    
    // それ以外は分解しない
    return [task];
  }
  
  /**
   * タスクの複雑度を判定する
   * @param task 判定対象のタスク文字列
   * @returns 複雑なタスクの場合true
   */
  isComplexTask(task: string): boolean {
    return task.includes(' and ') || 
           task.includes('、') || 
           task.includes(';') ||
           task.length > 100;
  }
  
  /**
   * タスクの優先度を評価する（将来拡張用）
   * @param task タスク文字列
   * @returns 優先度（1-5、5が最高）
   */
  getPriority(task: string): number {
    // 基本的な優先度判定ロジック
    const urgentKeywords = ['緊急', 'urgent', '至急', 'critical'];
    const importantKeywords = ['重要', 'important', '必要', 'required'];
    
    if (urgentKeywords.some(keyword => task.toLowerCase().includes(keyword))) {
      return 5;
    }
    
    if (importantKeywords.some(keyword => task.toLowerCase().includes(keyword))) {
      return 4;
    }
    
    return 3; // デフォルト優先度
  }
  
  /**
   * サブタスク間の依存関係を推定する（基本実装）
   * @param subtasks サブタスクの配列
   * @returns 依存関係のマップ
   */
  analyzeDependencies(subtasks: string[]): Map<number, number[]> {
    const dependencies = new Map<number, number[]>();
    
    // 基本的な依存関係の推定
    subtasks.forEach((task, index) => {
      const deps: number[] = [];
      
      // 順序を示すキーワードがあるかチェック
      if (task.includes('まず') || task.includes('first')) {
        // 他のタスクより優先
      } else if (task.includes('次に') || task.includes('then') || task.includes('その後')) {
        // 前のタスクに依存
        if (index > 0) {
          deps.push(index - 1);
        }
      }
      
      dependencies.set(index, deps);
    });
    
    return dependencies;
  }
  
  /**
   * サブタスクの実行順序を決定する
   * @param subtasks サブタスクの配列
   * @returns 実行順序に並び替えられたインデックス配列
   */
  getExecutionOrder(subtasks: string[]): number[] {
    const dependencies = this.analyzeDependencies(subtasks);
    const order: number[] = [];
    const visited = new Set<number>();
    const visiting = new Set<number>();
    
    // トポロジカルソートを実行
    const visit = (index: number) => {
      if (visiting.has(index)) {
        // 循環依存が検出された場合、元の順序を維持
        return;
      }
      
      if (visited.has(index)) {
        return;
      }
      
      visiting.add(index);
      const deps = dependencies.get(index) || [];
      
      deps.forEach(depIndex => {
        visit(depIndex);
      });
      
      visiting.delete(index);
      visited.add(index);
      order.push(index);
    };
    
    // 全てのタスクを訪問
    for (let i = 0; i < subtasks.length; i++) {
      if (!visited.has(i)) {
        visit(i);
      }
    }
    
    return order;
  }
}
# 忖度なし実装計画 - @akiojin/agents

## 前提条件の確認

### 現実的なリソース
- 開発者: 1名（パートタイム想定）
- 開発時間: 週10-20時間
- 予算: なし（OSSプロジェクト）
- 既存コード: 約3,000行（品質にばらつき）

### 技術スタック固定
- Runtime: Bun（変更不可）
- Language: TypeScript（変更不可）
- MCP Tools: Serena中心（変更困難）
- LLM: マルチプロバイダー対応必須

## 🔥 緊急対応が必要な問題（今すぐ〜1週間）

### 1. クラッシュ防止
```typescript
// 現状: エラーでアプリ全体がクラッシュ
mcpTool.execute(params); // ← エラー時に死ぬ

// 改善: 最低限のエラーハンドリング
try {
  const result = await mcpTool.execute(params);
  return result;
} catch (error) {
  console.error(`MCP tool failed: ${error.message}`);
  // クラッシュせずに続行
  return { error: true, message: 'Tool execution failed' };
}
```

**作業項目**:
- [ ] src/mcp/client.ts にtry-catch追加
- [ ] src/core/agent.ts のエラーハンドリング
- [ ] src/providers/*.ts の接続エラー処理

### 2. タイムアウト設定
```typescript
// 現状: 無限に待ち続ける
const response = await llm.complete(prompt);

// 改善: 30秒でタイムアウト
const response = await Promise.race([
  llm.complete(prompt),
  new Promise((_, reject) => 
    setTimeout(() => reject(new Error('Timeout')), 30000)
  )
]);
```

**作業項目**:
- [ ] LLM呼び出しにタイムアウト追加
- [ ] MCPツール実行にタイムアウト追加
- [ ] ユーザーへのタイムアウト通知

## 🛠️ 基礎的な改善（1-2週間）

### 1. ログシステムの実装
```typescript
// utils/logger.ts - シンプルだが実用的
enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3
}

class SimpleLogger {
  private level: LogLevel = LogLevel.INFO;
  
  error(message: string, error?: Error): void {
    console.error(`[ERROR] ${new Date().toISOString()} ${message}`);
    if (error) console.error(error.stack);
    // ファイルにも記録
    this.writeToFile('error.log', message, error);
  }
  
  // 他のレベルも同様に実装
}
```

**作業項目**:
- [ ] SimpleLoggerクラスの実装
- [ ] 主要な処理にログ追加
- [ ] エラーログのファイル出力

### 2. 基本的なテスト追加
```typescript
// tests/core/agent.test.ts - 最低限のテスト
describe('Agent', () => {
  it('should handle invalid input', async () => {
    const agent = new Agent(mockConfig);
    const result = await agent.execute('');
    expect(result.error).toBe(true);
  });
  
  it('should timeout long running tasks', async () => {
    // タイムアウトのテスト
  });
  
  it('should retry on failure', async () => {
    // リトライのテスト
  });
});
```

**作業項目**:
- [ ] 主要クラスの基本テスト（各3-5個）
- [ ] エラーケースのテスト
- [ ] CI/CDでのテスト実行設定

### 3. 設定の一元管理
```typescript
// config/index.ts - 散らばった設定を統合
interface Config {
  llm: {
    provider: string;
    apiKey?: string;
    timeout: number;
    maxRetries: number;
  };
  mcp: {
    servers: MCPServer[];
    timeout: number;
  };
  app: {
    logLevel: LogLevel;
    maxParallel: number;
  };
}

// 環境変数、設定ファイル、デフォルト値を統合
const config = loadConfig();
```

**作業項目**:
- [ ] 設定インターフェースの定義
- [ ] 設定ローダーの実装
- [ ] 既存コードの設定参照を統一

## 🎯 実用的な機能改善（3-4週間）

### 1. シンプルなリトライメカニズム
```typescript
// utils/retry.ts - 複雑にしない
async function simpleRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1}/${maxRetries} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      delay *= 2; // exponential backoff
    }
  }
  throw new Error('Should not reach here');
}
```

**作業項目**:
- [ ] リトライユーティリティの実装
- [ ] LLM呼び出しにリトライ適用
- [ ] MCPツールにリトライ適用

### 2. 基本的なタスク分解
```typescript
// core/task-decomposer.ts - 過度に複雑にしない
class SimpleTaskDecomposer {
  decompose(task: string): string[] {
    // ルールベースの簡単な分解
    const subtasks: string[] = [];
    
    // "and" で分割
    if (task.includes(' and ')) {
      return task.split(' and ').map(t => t.trim());
    }
    
    // 「、」で分割（日本語）
    if (task.includes('、')) {
      return task.split('、').map(t => t.trim());
    }
    
    // それ以外は分解しない
    return [task];
  }
}
```

**作業項目**:
- [ ] SimpleTaskDecomposerの実装
- [ ] Agentクラスへの統合
- [ ] 分解結果の表示改善

### 3. 進捗表示の改善
```typescript
// ui/progress.ts - ユーザーに状況を伝える
class ProgressReporter {
  private currentTask: string = '';
  private startTime: number = 0;
  
  startTask(name: string): void {
    this.currentTask = name;
    this.startTime = Date.now();
    console.log(`🔄 ${name}...`);
  }
  
  completeTask(success: boolean = true): void {
    const duration = Date.now() - this.startTime;
    const emoji = success ? '✅' : '❌';
    console.log(`${emoji} ${this.currentTask} (${duration}ms)`);
  }
}
```

**作業項目**:
- [ ] ProgressReporterの実装
- [ ] 主要な処理への組み込み
- [ ] エラー時の適切な表示

## ⏰ 実装スケジュール（現実的な見積もり）

### Week 1: 火消し
- 月曜: エラーハンドリング追加（4h）
- 水曜: タイムアウト実装（3h）
- 金曜: 動作確認とバグ修正（3h）

### Week 2-3: 基礎固め
- ログシステム実装（6h）
- 基本テスト作成（8h）
- 設定管理統一（6h）

### Week 4-5: 機能改善
- リトライメカニズム（4h）
- タスク分解（6h）
- 進捗表示（4h）
- 統合テスト（6h）

### Week 6: 仕上げ
- ドキュメント更新（4h）
- パフォーマンス測定（2h）
- リリース準備（4h）

## 📊 成功指標（現実的な目標）

### 定量的指標
- クラッシュ頻度: 90%削減（週10回→週1回）
- エラー回復率: 50%（リトライで半分は回復）
- テストカバレッジ: 30%（主要機能のみ）
- 平均応答時間: 30秒以内（タイムアウト設定）

### 定性的指標
- エラーメッセージが分かりやすい
- 何が起きているか把握できる
- 基本的なタスクは確実に動作
- デバッグが容易

## ❌ やらないこと（明確に宣言）

### 絶対にやらない
1. StateGraphの完全実装
2. マルチエージェントシステム
3. Virtual File System
4. Context Quarantine
5. 複雑な並列処理
6. LangGraphのTypeScript移植

### 当面やらない
1. 高度なタスク計画
2. 複雑な依存関係解析
3. AIによる自己改善
4. プラグインシステム

## 🚀 次のアクション（具体的に）

### 今日やること
1. `src/mcp/client.ts` を開く
2. try-catchを追加（30分）
3. エラーログを追加（15分）
4. 動作確認（15分）

### 明日やること
1. `src/core/agent.ts` のエラーハンドリング
2. 基本的なテストケース作成
3. タイムアウト処理の実装開始

### 今週の目標
- **最低限**: アプリがクラッシュしない
- **できれば**: 基本的なログ出力
- **理想**: タイムアウトとリトライ

## まとめ

**複雑な機能は一切追加せず、基本を確実に動作させる。**

これが忖度なしの現実的な計画です。派手さはありませんが、確実に改善できます。
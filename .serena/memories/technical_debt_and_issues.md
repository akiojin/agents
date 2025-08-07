# 技術的負債と現在の問題点 - @akiojin/agents

## 🔴 致命的な問題（アプリが落ちる）

### 1. エラーハンドリングの欠如
**場所**: `src/mcp/client.ts`
```typescript
// 現状 - エラーで即死
async executeTool(name: string, params: any) {
  const result = await this.connection.request({ // ← エラー時クラッシュ
    method: 'tools/call',
    params: { name, arguments: params }
  });
  return result;
}
```
**影響**: MCPツールのエラーでアプリ全体がクラッシュ
**修正コスト**: 低（1-2時間）
**優先度**: 最高

### 2. タイムアウト未設定
**場所**: `src/providers/*.ts`, `src/mcp/*.ts`
```typescript
// 現状 - 無限待機
const response = await this.client.complete(prompt); // ← 永遠に待つ
```
**影響**: LLMやツールの応答がない場合、永久にハング
**修正コスト**: 低（2-3時間）
**優先度**: 最高

### 3. メモリリーク疑惑
**場所**: `src/core/memory.ts`
```typescript
// 現状 - メモリが解放されない？
private messages: Message[] = [];
addMessage(msg: Message) {
  this.messages.push(msg); // ← 無限に増える
}
```
**影響**: 長時間実行でメモリ使用量が増大
**修正コスト**: 中（調査含め1日）
**優先度**: 高

## 🟡 重大な問題（機能が正しく動作しない）

### 4. 型定義の不整合
**場所**: 全体
```typescript
// 例: any型の乱用
async processTask(task: any): Promise<any> {
  // 型チェックが効かない
}

// 例: 型の不一致
interface Config {
  apiKey: string; // 必須のはずが...
}
const config: Config = {
  apiKey: process.env.API_KEY // ← undefined の可能性
};
```
**影響**: ランタイムエラー、予期しない動作
**修正コスト**: 中（2-3日）
**優先度**: 中

### 5. 設定管理の混乱
**問題箇所**:
- 環境変数: `.env`, `process.env`
- 設定ファイル: `.agents.yaml`, `config.json`
- ハードコード: 各所に散在
```typescript
// 例: 同じ設定が複数箇所に
const timeout = 30000; // agent.ts
const TIMEOUT = 30; // mcp/client.ts
const DEFAULT_TIMEOUT = '30s'; // config.ts
```
**影響**: 設定変更時の見落とし、不整合
**修正コスト**: 低（1日）
**優先度**: 中

### 6. 非同期処理の不適切な実装
**場所**: `src/core/task-executor.ts`
```typescript
// 現状 - エラーが握りつぶされる
tasks.forEach(async (task) => {
  await executeTask(task); // ← エラーが上に伝播しない
});
```
**影響**: エラーの見落とし、予期しない順序での実行
**修正コスト**: 中（1-2日）
**優先度**: 高

## 🟠 中程度の問題（開発・保守が困難）

### 7. テストの欠如
**現状**:
```
tests/
├── cli.test.ts (形だけ、実質0カバレッジ)
├── core/
│   └── agent.test.ts (未実装)
└── mcp/
    └── tools.test.ts (動作しない)
```
**カバレッジ**: 推定3%以下
**影響**: リグレッション頻発、リファクタリング困難
**修正コスト**: 高（1-2週間）
**優先度**: 中

### 8. ログ機能の不足
**現状**:
```typescript
console.log('Starting...'); // デバッグ用？本番用？
// console.error(error); // コメントアウトされたログ多数
```
**影響**: デバッグ困難、本番環境での問題調査不可
**修正コスト**: 低（1日）
**優先度**: 中

### 9. エラーメッセージの不親切
**例**:
```typescript
throw new Error('Failed'); // 何が失敗したのか不明
throw new Error('Invalid input'); // どう invalid なのか不明
```
**影響**: ユーザーが問題を解決できない
**修正コスト**: 低（継続的改善）
**優先度**: 低

## 📝 コード品質の問題

### 10. 命名の不統一
```typescript
// 同じ概念に複数の名前
executeTask() // task-executor.ts
runTask()     // agent.ts
processTask() // cli.ts
handleTask()  // repl.ts
```
**影響**: コード理解の妨げ
**修正コスト**: 低（リファクタリング）
**優先度**: 低

### 11. コメントの不足
```typescript
// コメントなしの複雑なロジック
if (state.mode === 2 && !flags[3] || override) {
  // 何をしているのか不明
}
```
**影響**: 保守性低下
**修正コスト**: 低（継続的改善）
**優先度**: 低

### 12. マジックナンバー
```typescript
setTimeout(() => {}, 5000); // なぜ5秒？
if (retries > 3) { // なぜ3回？
if (messages.length > 100) { // なぜ100？
```
**影響**: 意図が不明、変更時の影響範囲不明
**修正コスト**: 低
**優先度**: 低

## 🏗️ アーキテクチャの問題

### 13. 責務の不明確
**例**: `Agent`クラスが肥大化
```typescript
class Agent {
  // 全部入り - 1000行超え
  async execute() {}
  async plan() {}
  async decompose() {}
  async retry() {}
  async log() {}
  // ...
}
```
**影響**: 単一責任原則違反、テスト困難
**修正コスト**: 高（設計変更必要）
**優先度**: 低（動作優先）

### 14. 依存関係の複雑化
```
agent.ts → memory.ts → agent.ts (循環依存)
cli.ts → agent.ts → cli.ts (循環依存)
```
**影響**: ビルドエラー、予期しない動作
**修正コスト**: 中
**優先度**: 中

## 📊 問題の統計

### 深刻度別
- 🔴 致命的: 3件
- 🟡 重大: 3件
- 🟠 中程度: 3件
- 📝 品質: 5件

### 修正コスト別
- 低（1日以内）: 8件
- 中（2-3日）: 4件
- 高（1週間以上）: 2件

### 推奨対応順序

#### Phase 1: 即座に対応（今週）
1. エラーハンドリング追加
2. タイムアウト設定
3. 基本的なログ追加

#### Phase 2: 早期対応（来週）
4. メモリリーク調査
5. 非同期処理の修正
6. 設定管理の統一

#### Phase 3: 計画的対応（今月中）
7. 型定義の整理
8. 基本テストの追加
9. エラーメッセージ改善

#### Phase 4: 継続的改善（随時）
10. コード品質向上
11. アーキテクチャ改善
12. ドキュメント整備

## 対応しないもの（意図的に後回し）

### 当面無視
- パフォーマンス最適化（まず動作を安定させる）
- UIの美化（機能優先）
- 国際化対応（日本語のみで十分）
- プラグインシステム（コア機能が未完成）

### 永久に対応しない可能性
- 100%のテストカバレッジ（現実的でない）
- 完璧なエラーハンドリング（コストが高すぎる）
- マイクロサービス化（過剰設計）

## まとめ

**現在のコードベースは「動くけど危うい」状態です。**

最優先事項:
1. クラッシュを防ぐ
2. エラーを適切に処理する
3. 何が起きているか分かるようにする

これらの基本的な問題を解決してから、新機能を考えます。
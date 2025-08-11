# AGENTSプロジェクト サンプル集

このディレクトリには、AGENTSプロジェクトの各機能を実際に試すことができるサンプルプログラムが含まれています。

## サンプル一覧

### 1. simple-approval-demo.js - 承認ワークフローの簡単なデモ

承認プロセスの動作を確認できるシンプルなデモプログラムです。

**実行方法:**

```bash
cd /agents
node examples/simple-approval-demo.js
```

### 2. workflow-demo.ts - 承認ワークフローのデモ（TypeScript版）

WorkflowOrchestratorの承認プロセスを実際に体験できるデモプログラムです。

**実行方法:**

```bash
cd /agents
npx ts-node examples/workflow-demo.ts
```

**注意:** TypeScript版は依存関係の設定が必要です。

**機能:**
- 実行計画の対話的な承認プロセス
- 計画の詳細表示
- 承認/拒否の選択
- 実行結果のサマリー表示

**承認選択肢:**
- `[A]` 承認 - 計画を承認して実行
- `[R]` 拒否 - 計画を拒否して中止
- `[M]` 修正 - 計画を修正（未実装）
- `[D]` 詳細 - 計画の詳細を表示

## 注意事項

- これらのサンプルは開発/テスト用です
- 実際のエージェント実行には適切な環境設定が必要です
- LLM APIキーなどの設定が必要な場合があります

## トラブルシューティング

### ts-nodeが見つからない場合

```bash
npm install -g ts-node typescript
```

### 依存関係エラーの場合

```bash
cd /agents
npm install
npm run build
```
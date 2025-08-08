# AgentsアプリLLMハング問題

## 発生状況
- コマンド: `bun run start -- task "Analyze project"`
- 症状: MCPサーバー初期化後にハング、Ctrl-C強制終了が必要

## 成功した部分
- MCPサーバー初期化: 全て完了
  - ✅ serena (FastMCP 1.12.3)
  - ✅ markitdown (1.8.1) 
  - ✅ google-search (0.1.0)
  - ✅ textlint (15.2.1)

## 問題の箇所
- LLMプロバイダー接続でハング
- 設定: `"provider": "local-lmstudio"`
- エンドポイント: `http://host.docker.internal:1234`
- タイムアウト設定: 120000ms（設定されているが効いていない）

## 技術的原因
1. **タイムアウト処理の不備**: 設定したタイムアウトが実装レベルで効いていない
2. **エラーハンドリングの欠如**: 接続失敗時の適切な処理なし
3. **プロバイダー実装問題**: local-lmstudioプロバイダーの接続処理に問題

## 該当コード箇所
- `src/providers/local.ts`: LocalProviderクラス
- `src/core/agent.ts`: AgentCoreのexecuteTask処理
- `src/config/types.ts`: タイムアウト設定

## 解決が必要な問題
1. LLMプロバイダーでのタイムアウト実装
2. 接続失敗時のエラーハンドリング
3. プロバイダー切り替えのフォールバック機能

## 代替テスト方法
- OpenAIプロバイダーでのテスト
- 内部機能（Bash実行）のみでのテスト
- MCPツール単体でのテスト
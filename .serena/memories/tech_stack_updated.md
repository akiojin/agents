# 技術スタック

## ランタイム/言語

- **Node.js**: v20.0.0以上（必須）
- **TypeScript**: 5.3.3
- **npm/yarn**: パッケージ管理

## ベースフレームワーク

- **Google Gemini CLI**: コア基盤
  - packages/cli: UIレイヤー
  - packages/core: バックエンド処理
  - ツールシステム: ファイル操作、シェル実行等

## 主要ライブラリ

### CLI/UI

- **Commander.js**: CLIフレームワーク（Agents拡張で使用）
- **Inquirer.js**: 対話型プロンプト
- **Chalk**: カラー出力
- **Ora**: スピナー/進捗表示
- **Terminal Kit**: Gemini CLI由来のターミナルレンダリング

### LLM統合

- **Google Generative AI SDK**: Gemini API（Gemini CLI経由）
- **OpenAI SDK**: GPTモデル連携
- **Anthropic SDK**: Claude連携
- **jsonrpc-lite**: MCPプロトコル実装
- **WebSocket (ws)**: リアルタイム通信

### 開発ツール

- **Vitest**: テストフレームワーク（v3.2.4）
- **ESLint**: リンター（v9.24.0）
- **Prettier**: フォーマッター（v3.5.3）
- **TypeScript**: 型チェック（v5.3.3）

### ユーティリティ

- **Winston**: ロギング
- **Zod**: スキーマバリデーション
- **YAML**: 設定ファイル管理
- **p-limit**: 並列処理制御
- **chokidar**: ファイル監視
- **glob**: ファイルパターンマッチング

## Docker環境

- **ベースイメージ**: node:20-slim
- **追加ツール**:
  - GitHub CLI (gh)
  - Docker CLI + Compose
  - SQLite（ローカルファイル）

## ワークスペース構成

```yaml
workspaces:
  - packages/cli    # Gemini CLI UI
  - packages/core   # Gemini CLI Core
  - packages/*      # その他のGemini CLIパッケージ
```

## ビルドツール

- **esbuild**: バンドル生成
- **npm scripts**: タスクランナー
- **GitHub Actions**: CI/CD（self-hosted/macOS）

## MCP (Model Context Protocol)

- **Serena MCP**: コード解析・編集（計画中）
- **カスタムMCPサーバー**: 拡張ツール対応
- **並列実行**: 複数ツールの同時実行

## データ永続化

- **SQLite**: ベクトルデータベース（サーバー不要）
- **ローカルファイル**: 設定・キャッシュ
- **Serenaメモリ**: プロジェクトコンテキスト

## バージョン要件

```json
{
  "engines": {
    "node": ">=20.0.0"
  },
  "packageManager": "npm@10.0.0"
}
```
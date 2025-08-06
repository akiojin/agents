# @akiojin/agents

オープンソースで完全無料の自律型コーディングエージェント。ローカルLLMとクラウドLLMを自由に選択でき、MCPツールによる無限の拡張性を持ちます。

## 特徴

- 🤖 **高度な自律性** - アプリケーション全体を構築できるレベルの自律的動作
- 🚀 **Bunランタイム** - 高速起動と優れたパフォーマンス
- 🔧 **MCP対応** - Serena MCPツールによる精密なコード操作
- ⚡ **並列処理** - タスクの並列実行により3-5倍の高速化
- 🌐 **マルチプロバイダー** - ローカル（GPT-OSS）からクラウド（OpenAI/Claude/Gemini）まで対応
- 🔓 **完全オープンソース** - MITライセンスで自由に利用可能

## インストール

```bash
# Bunを使用したグローバルインストール
bun install -g @akiojin/agents

# または npx/bunx で直接実行
bunx @akiojin/agents
```

## 使い方

### 初期設定

```bash
# 対話形式で設定を初期化
agents init

# LLMプロバイダーを選択:
# - OpenAI
# - Anthropic
# - Local (GPT-OSS)
# - Local (LM Studio)
```

### インタラクティブモード（REPL）

```bash
# 対話モードを開始
agents chat

# スラッシュコマンドが利用可能
agents> /help
agents> /tools
agents> /model gpt-4-turbo-preview
agents> Todoアプリを作成してください
```

### タスク実行モード

```bash
# タスクを直接実行
agents task "RESTful APIを実装"

# ファイルを指定して実行
agents task "このファイルをリファクタリング" -f src/main.ts

# 並列実行を有効化
agents task "テストを追加" --parallel
```

### ファイル監視モード

```bash
# ファイル変更を監視して自動実行
agents watch src/ --task "変更されたファイルをフォーマット"
```

### 設定ファイル（.agents.yaml）

```yaml
provider: openai
apiKey: sk-...
model: gpt-4-turbo-preview
useMCP: true
maxParallel: 5
timeout: 300
logLevel: info
cachePath: .agents-cache
historyPath: .agents-history
mcpServers:
  - name: filesystem
    command: npx
    args: ['-y', '@modelcontextprotocol/server-filesystem']
```

## ドキュメント

- [要件定義書](docs/REQUIREMENTS.md) - プロジェクトの詳細な要件
- [アーキテクチャ設計書](docs/ARCHITECTURE.md) - システム設計と技術仕様
- [ロードマップ](docs/ROADMAP.md) - 開発計画とリリーススケジュール

## プロジェクト構成

```
@akiojin/agents/
├── src/                  # ソースコード
│   ├── core/            # エージェントコア
│   ├── mcp/             # MCPツール実装
│   ├── providers/       # LLMプロバイダー
│   └── cli/             # CLIインターフェース
├── tests/               # テストファイル
├── docs/                # ドキュメント
└── examples/            # 使用例
```

## 開発状況

現在、v0.1.0の初期実装が完了しました。詳細は[ロードマップ](docs/ROADMAP.md)をご覧ください。

### 完了済み

- ✅ CLIインターフェース実装
- ✅ エージェントコア実装
- ✅ MCPマネージャー実装
- ✅ LLMプロバイダー実装（OpenAI、Anthropic、ローカル）
- ✅ REPLモード実装
- ✅ 基本的なタスク実行機能

### 次のマイルストーン（v0.2.0）

- [ ] Serena MCPツール統合
- [ ] 並列タスク実行の最適化
- [ ] テストカバレッジ向上
- [ ] パフォーマンス改善

## コントリビューション

プロジェクトへの貢献を歓迎します！

### 開発フロー

Git Flow に従って開発を行います：

1. `develop` ブランチから機能ブランチを作成
2. 機能開発を実施
3. `develop` ブランチへPRを作成
4. レビュー後マージ
5. リリース時に `main` ブランチへマージ

### ブランチ構成

- `main`: 本番環境用のブランチ
- `develop`: 開発用のメインブランチ
- `feature/*`: 機能開発ブランチ
- `release/*`: リリース準備ブランチ
- `hotfix/*`: 緊急修正ブランチ

## 必要要件

- Bun v1.0以上
- Node.js v18以上（互換性のため）
- Git

## ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

## お問い合わせ

- GitHub Issues: バグ報告や機能要望
- Discussions: 質問や議論
- Pull Requests: コード貢献

## 謝辞

このプロジェクトは以下のオープンソースプロジェクトに触発されています：

- Claude Code (Anthropic)
- Continue.dev
- Aider
- OpenDevin

## ステータス

![GitHub stars](https://img.shields.io/github/stars/akiojin/agents)
![GitHub issues](https://img.shields.io/github/issues/akiojin/agents)
![GitHub pull requests](https://img.shields.io/github/issues-pr/akiojin/agents)
![License](https://img.shields.io/github/license/akiojin/agents)
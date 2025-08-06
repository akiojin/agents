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

### インタラクティブモード

```bash
# プロジェクトディレクトリで実行
@akiojin/agents

> タスク: Todoアプリを作成してください
[Agent] タスクを分析中...
[Agent] 並列実行: Frontend構築、Backend構築、設定ファイル作成
[Agent] 完了しました！
```

### バッチモード

```bash
# コマンドラインから直接タスク実行
@akiojin/agents --task "RESTful APIを実装" --provider local --model gpt-oss-20b
```

### 設定ファイル

```json
{
  "provider": "local",
  "model": "gpt-oss-20b",
  "parallel": 10,
  "mcp": {
    "serena": {
      "enabled": true,
      "memory": "project"
    }
  }
}
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

現在、Phase 0（基盤構築）を実施中です。詳細は[ロードマップ](docs/ROADMAP.md)をご覧ください。

### 次のマイルストーン

- [ ] Week 1-2: 開発環境セットアップ
- [ ] Week 3-6: MVP開発
- [ ] Week 7-10: Serena統合
- [ ] Week 11-14: 並列処理実装

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
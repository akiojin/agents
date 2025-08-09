# @akiojin/agents プロジェクト概要

## プロジェクトの目的

Google Gemini CLIをベースに拡張された、オープンソースで完全無料の自律型コーディングエージェント。Gemini CLIの堅牢な基盤の上に、複数LLMプロバイダー対応とMCPプロトコル統合を実現。

## 基本情報

- **プロジェクト名**: @akiojin/agents
- **現在のバージョン**: 0.1.10
- **ベースプロジェクト**: Google Gemini CLI
- **ライセンス**: MIT
- **リポジトリ**: https://github.com/akiojin/agents

## 主な特徴

### Gemini CLI由来の機能
- 📦 packages/cli: ユーザーインターフェース
- 🎯 packages/core: バックエンドとAPI連携
- 🔧 堅牢なツールシステム
- 🎨 優れたターミナルUI

### @akiojin/agents拡張機能
- 🚀 Node.js 20+による安定動作
- 🤖 複数LLMサポート (Gemini、OpenAI、Anthropic、ローカルLLM)
- 🔧 MCPプロトコルによる拡張可能なツール統合
- ⚡ 並列タスク実行による高速化
- 💻 拡張CLIコマンド
- 🔄 Serenaメモリシステム（計画中）

## 技術スタック

### ランタイム
- **Node.js**: 20.0.0以上（必須）
- **TypeScript**: 5.3.3

### コアフレームワーク
- **Gemini CLI**: Google提供の基盤技術
- **MCP Protocol**: Model Context Protocol
- **Commander.js**: CLIフレームワーク

### 対応LLMプロバイダー
- Google Gemini（デフォルト、Gemini CLI経由）
- OpenAI (GPT-4, GPT-3.5)
- Anthropic (Claude 3 family)
- ローカルLLM (LM Studio, Ollama等)

## プロジェクト構造

```
/agents/
├── packages/           # Gemini CLIコアパッケージ
│   ├── cli/           # UIとユーザーインタラクション
│   └── core/          # バックエンド処理
├── src/               # Agents独自拡張
│   ├── cli.ts         # エントリポイント
│   ├── core/          # エージェントロジック
│   ├── providers/     # LLMプロバイダー実装
│   └── mcp/           # MCP統合
├── docs/              # ドキュメント
└── scripts/           # ビルド・デプロイスクリプト
```

## Docker環境

- Node.js 20-slimベースイメージ
- ChromaDB連携（ベクターDB）
- GitHub CLI統合
- MCP Server対応

## 開発状況

- ✅ Gemini CLIベース機能（完了）
- ✅ マルチLLMプロバイダー（完了）
- ✅ 基本CLI機能（完了）
- ⚠️ MCP統合（基本実装済み）
- 📝 Serenaメモリ（計画中）
- 📝 並列処理最適化（計画中）
# Agents

Agents is an AI-powered development and memory management system that combines the power of Claude Code, Agents CLI, and advanced synaptic memory networks to create an intelligent development assistant.

## 💡 Key Features

Agents provides:

- **Claude Code Integration**: Direct access to Anthropic's Claude Code for intelligent code understanding and generation
- **Agents CLI Integration**: AI integration for diverse AI reasoning capabilities  
- **Synaptic Memory System**: Advanced memory management with brain-inspired neural networks for persistent knowledge and context
- **MCP Tools Integration**: Model Context Protocol tools including Serena for intelligent code exploration
- **Docker Development Environment**: Fully containerized development setup with all necessary tools pre-installed

## 📋 必要条件

### ChromaDB必須
Agentsの記憶システムはChromaDBベクトルデータベースを必要とします。以下のいずれかの方法でChromaDBを起動する必要があります：

1. **Docker経由**:
   ```bash
   docker run -d -p 8000:8000 chromadb/chroma:latest
   ```

2. **Python経由**:
   ```bash
   pip install chromadb
   chroma run --path ./chroma-data
   ```

3. **自動起動**: `npm start`実行時に自動的にChromaDBの起動を試みます

## 🚀 Quick Start

### Docker環境での実行

1. **環境変数を設定**:
   ```bash
   cp .env.example .env
   # .envファイルを編集して、必要なAPIキーを設定
   ```

2. **Docker環境を起動**:
   ```bash
   docker-compose up -d
   ```

3. **コンテナに接続**:
   ```bash
   docker-compose exec agents bash
   ```

4. **Agentsシステムの開始**:
   ```bash
   npm start
   ```

### ローカル環境での実行

1. **前提条件**: Node.js 20以上がインストールされていること
2. **依存関係のインストール**: `npm install`
3. **環境変数を設定**: `.env.example`を`.env`にコピーして編集
4. **システム開始**: `npm start`

### 必要な環境変数

```bash
# Claude Code / Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key_here

# Google AI
GOOGLE_API_KEY=your_google_ai_api_key_here

# GitHub統合（オプション）
GITHUB_TOKEN=your_github_token_here

# ChromaDB（デフォルト設定で動作）
CHROMA_URL=http://chroma:8000
```

## 🏗️ アーキテクチャ

Agentsシステムは以下の主要コンポーネントで構成されています：

### シナプス記憶システム
- **脳神経ネットワーク模倣**: 人間の脳の記憶形成メカニズムを模倣
- **活性化伝播**: 最大3段階の記憶活性化伝播（減衰率0.7）
- **忘却曲線**: Ebbinghausの忘却曲線による時間経過記憶減衰
- **シナプス可塑性**: LTP/LTDによる記憶強度調整

### AI統合レイヤー
- **Claude Code**: Anthropicの高性能コード理解・生成
- **Agents CLI**: 多様なAI推論機能
- **MCP Tools**: Model Context Protocolによるツール統合

### データ永続化
- **ChromaDB**: ベクターデータベースによる意味的記憶保存
- **Docker Volumes**: 設定とデータの永続化

## 🔮 開発計画

- **Phase 1**: 基本的なClaude Code/Agents統合 ✅
- **Phase 2**: シナプス記憶システム実装 ✅
- **Phase 3**: 高度なMCP Tools統合
- **Phase 4**: マルチモーダルファイル処理
- **Phase 5**: チーム連携機能

## 🤝 コントリビューション

Agentsはオープンソースプロジェクトです。バグレポート、機能提案、コードコントリビューションなど、あらゆる形での貢献を歓迎します。

### 開発参加方法

1. **Issues**: バグ報告や機能要望は[GitHub Issues](https://github.com/akiojin/agents/issues)で
2. **Pull Requests**: コード貢献は[Pull Requests](https://github.com/akiojin/agents/pulls)で
3. **Discussion**: アイデアや質問は[GitHub Discussions](https://github.com/akiojin/agents/discussions)で

## 📄 ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

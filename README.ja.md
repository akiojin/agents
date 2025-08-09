# Agents

AgentsはClaude Code、Gemini CLI、先進的なシナプス記憶ネットワークを組み合わせて、インテリジェントな開発アシスタントを作成するAI搭載開発・記憶管理システムです。

## 💡 主要機能

Agentsが提供する機能：

- **Claude Code統合**: コードの理解と生成のためのAnthropic Claude Codeへの直接アクセス
- **Gemini CLI統合**: 多様なAI推論能力のためのGoogle AI統合  
- **シナプス記憶システム**: 永続的な知識とコンテキストのための脳にインスパイアされた神経ネットワークを使った先進的記憶管理
- **MCPツール統合**: インテリジェントなコード探索のためのSerenaを含むModel Context Protocolツール
- **Docker開発環境**: 必要なツールがすべてプリインストールされた完全にコンテナ化された開発セットアップ

## 🚀 クイックスタート

### Docker環境での実行（推奨）

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

# Google AI / Gemini
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
- **Gemini CLI**: Googleの多様なAI推論機能
- **MCP Tools**: Model Context Protocolによるツール統合

### データ永続化
- **ChromaDB**: ベクターデータベースによる意味的記憶保存
- **Docker Volumes**: 設定とデータの永続化

## 🔮 開発計画

- **Phase 1**: 基本的なClaude Code/Gemini統合 ✅
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
# 🧠 Agents - 次世代AI開発アシスタント

Agentsは、生物学的な脳の記憶メカニズムを模倣した**シナプス記憶ネットワーク**と**因果関係解決エンジン**を中核とする、革新的なAI搭載開発支援システムです。単なるコード生成ツールを超え、学習・記憶・推論・因果追跡を統合した次世代の開発環境を提供します。

## 🚀 他システムとの決定的な違い

### **1. 生物学的記憶システム**
従来の単純なRAG（検索拡張生成）とは根本的に異なる、**人間の脳を模倣したシナプス記憶ネットワーク**：

- **ヘブ則学習**: "一緒に発火するニューロンは結びつく"
- **活性化伝播**: 関連記憶の連鎖的活性化（最大3段階、減衰率0.7）
- **長期増強/長期抑制（LTP/LTD）**: 動的なシナプス強度調整
- **ホメオスタシス機能**: 過活性化を防ぐ自己調整メカニズム

### **2. 因果関係解決エンジン**
従来のAIが苦手とする「なぜ」を追跡する**因果チェーン構築システム**：

- **決定ログシステム**: すべての行動と理由を記録
- **WhyChain構築**: 決定間の因果関係を遡及追跡
- **循環参照検出**: 無限ループを防ぐ安全機構
- **パターン学習**: 成功/失敗の因果関係から学習

### **3. IntelligentFileSystem**
単なるファイル操作を超えた**コード理解型ファイルシステム**：

- **13言語対応**: TypeScript/Python/Java/Go/Rust/C#/PHP/Ruby/Swift/Kotlin/C++/C/JavaScript
- **シンボルレベル理解**: 関数・クラス・変数の意味的関係を把握
- **セマンティック編集**: 意味を理解した安全なリファクタリング
- **依存関係自動解決**: インポート文の自動更新

### **4. AI最適化エンジン**
過去の経験から学習する**予測型最適化システム**：

- **バグ予測**: null-pointer、配列境界、リソースリークを事前検出
- **アーキテクチャ分析**: 設計パターン/アンチパターンの自動識別
- **コード品質評価**: 複雑度・保守性・テストカバレッジの総合評価
- **リファクタリング提案**: 具体的な改善策を根拠と共に提示

## 💡 革新的機能

### **記憶の永続化と進化**
- **ChromaDB統合**: ベクトル類似性による意味的検索
- **SQLite統合**: 構造化データの高速アクセス
- **シンボルインデックス**: `.agents/cache/`に統一されたデータ管理
- **セッション学習**: 作業パターンの学習と最適化

### **多言語コード理解**
- **LSPクライアント統合**: TypeScript Language Serverとの連携
- **汎用パーサー**: 13言語のシンボル情報抽出
- **クロスリファレンス**: ファイル間の依存関係追跡
- **リアルタイム解析**: ファイル変更の即座な反映

### **因果関係の可視化**
- **決定ツリー**: 意思決定プロセスの可視化
- **影響分析**: 変更の波及効果予測
- **学習履歴**: 過去の判断からの継続的学習
- **エラー原因追跡**: 問題の根本原因分析

## 🏗️ システム特徴

Agentsシステムは以下の革新的アーキテクチャで構成されています：

### **生物学的記憶アーキテクチャ**
```
シナプス記憶ネットワーク
├── MemoryNode (記憶ノード)
│   ├── activationLevel (活性化レベル)
│   ├── incomingConnections (入力結合)
│   └── outgoingConnections (出力結合)
├── SynapticConnection (シナプス結合)
│   ├── strength (結合強度: 0.0-1.0)
│   ├── coActivationCount (共起回数)
│   └── lastActivated (最終活性化時刻)
└── ContextMemoryMapping (文脈記憶マッピング)
    ├── contextSignature (文脈特徴量)
    ├── preferredMemories (優先記憶)
    └── temporalPatterns (時系列パターン)
```

### **因果関係追跡アーキテクチャ**
```
決定ログシステム
├── Decision (決定ノード)
│   ├── action (実行された行動)
│   ├── reason (行動の理由)
│   ├── result (結果)
│   └── parent_decision_id (親決定)
├── WhyChain (因果チェーン)
│   ├── chain[] (因果関係の連鎖)
│   └── summary (要約説明)
└── Pattern (パターン検出)
    ├── pattern_type (パターンタイプ)
    ├── frequency (頻度)
    └── success_rate (成功率)
```

### **コード理解アーキテクチャ**
```
IntelligentFileSystem
├── MultiLanguageParser (多言語パーサー)
│   ├── TypeScriptParser (LSP統合)
│   ├── PythonParser (AST解析)
│   └── [11言語サポート]
├── SymbolIndex (シンボルインデックス)
│   ├── symbol-index.db (SQLite)
│   └── シンボル関係グラフ
└── SemanticEditor (セマンティック編集)
    ├── リファクタリング機能
    └── 依存関係自動更新
```

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
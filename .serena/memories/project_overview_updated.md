# @akiojin/agents プロジェクトの概要（2025年8月更新）

## プロジェクトの目的

@akiojin/agentsは、Google Gemini CLIをベースに拡張された自律型コーディングエージェントシステムです。MCPプロトコルサポート、複数LLMプロバイダー対応、高度なメモリ管理機能を追加し、完全オープンソースで提供されています。

## プロジェクト構造

### メインパッケージ
1. **packages/adapter** - OpenAI互換APIとの接続を可能にするアダプター機能
2. **packages/agents** - サブエージェント実装（ReActパターン）
3. **packages/cli** - コマンドラインインターフェース
4. **packages/core** - エージェントコアロジックとReActパターン実装
5. **packages/memory** - メモリ管理機能
6. **packages/planning** - プランニング機能
7. **packages/prompts** - プロンプト管理
8. **packages/tools** - ツール機能
9. **packages/vscode-ide-companion** - VSCode IDE補助機能

### ソースコード構造
1. **src/core** - エージェントコアロジックとReActパターン実装
2. **src/providers** - 多種のLLMプロバイダー（OpenAI、Anthropic、ローカル）サポート
3. **src/mcp** - MCP（Model Context Protocol）統合
4. **src/utils** - ユーティリティ関数と設定管理
5. **src/config** - 設定管理

## 主な機能

### OpenAI互換APIとの接続
- API Adaptorレイヤーを導入して、透明なバックエンド切り替えを実現
- Agents内部形式をOpenAI互換形式に変換
- ストリーミング出力、パッシブツール呼び出し、アクティブツール呼び出し、マルチラウンドアクティブツール呼び出しをサポート

### サブエージェント機能
- ReActパターン実装（思考-行動-観察の反復ループ）
- タスク実行機能
- 履歴管理（メモリマネージャー連携）
- イベントエミッション
- パフォーマンス計測

### MCP統合
- Model Context Protocolのサポート
- シンボル解析とコード理解
- インテリジェントなコンテキスト管理
- 効率的なファイル操作

### 複数LLMプロバイダー対応
- Google Gemini: 原本Gemini CLI統合（デフォルト）
- OpenAI: GPT-4, GPT-3.5サポート
- Anthropic: Claude 3ファミリー対応
- ローカルLLM: LM Studio, Ollamaなどへの対応

### 高度なメモリシステム
- シナプス記憶ネットワーク（脳に似た記憶管理）
- SQLiteベクトルデータベース（サーバー不要のローカル意味的記憶保存）
- 永続的なプロジェクトコンテキストと知識

## 実装状況（2025年8月時点）

### ✅ 実装済み機能
- Gemini CLIコア（packages/cli, packages/core）
- OpenAI互換APIとの接続（packages/adapter/gemini-to-openai.ts）
- サブエージェント実装（packages/agents/sub-agent.ts）
- Geminiアダプター（src/providers/gemini-adapter.ts）
- LLMプロバイダー基盤（src/providers/base.ts）

### ⚠️ 部分実装機能
- Agents拡張（src/cli.ts, src/providers/）
- MCPマネージャー（src/mcp/）

### 📝 未実装機能
- エージェントコア（src/core/agent.ts）
- タスク実行（src/core/task-executor.ts）
- メモリ管理（src/core/memory.ts）
- REPLモード（src/cli/）

## ロードマップ

### Phase 1: 基盤構築（Week 1-2）
- 開発環境の整備と基本構造の確立

### Phase 2: MVP開発（Week 3-6）
- 基本的な自律型エージェントの実装
- CLI基本実装（Commander.js）
- Agent Core実装（ReActパターン）
- LLMプロバイダー基盤

### Phase 3: Serena統合とメモリシステム（Week 7-10）
- シンボル解析とコード理解の強化
- メモリシステム基盤

### Phase 4: 並列処理とマルチプロバイダー（Week 11-14）
- 並列タスク処理
- マルチプロバイダー対応（ローカルLLM、Anthropic Claude、Google Gemini）

### Phase 5: エンタープライズ機能（Week 15-18）
- セキュリティ強化
- 監査ログ・コンプライアンス対応

### Phase 6: プラグインエコシステム（Month 5-6）
- プラグインシステム
- 開発者SDK
- コミュニティ機能

## 技術スタック

### コア技術
- TypeScript 5.3.3
- Node.js 20+
- Gemini CLI Core
- MCP Protocol

### 主要依存関係
- @anthropic-ai/sdk: Anthropic Claude API
- commander: CLIフレームワーク
- inquirer: 対話型プロンプト
- openai: OpenAI API
- chalk: カラー出力
- ora: 進捗スピナー
- chokidar: ファイル監視
- winston: ログ管理
- ws: WebSocket（MCP用）
- zod: 入力検証
- p-limit: 並列処理制御

### 開発依存関係
- @types/node, typescript, eslint, prettier, vitest

## 開発環境とデプロイ

### Docker環境
- Node.js 20-slimベースイメージ
- Gemini CLIコア機能搭載
- MCP Server対応
- GitHub CLI統合
- SQLiteメモリシステム（サーバー不要）

### 開発環境セットアップ
```bash
# リポジトリクローン
git clone https://github.com/akiojin/agents.git
cd agents

# npmで依存関係インストール
npm install

# 開発サーバー起動
npm start

# テスト実行
npm test

# ビルド
npm run build
```

### GitHub Actions CI/CD
- self-hosted/macOS専用ランナー
- 自動テスト・ビルド・デプロイパイプライン
- マルチブランチ対応（develop/main）

## セキュリティと品質管理

### 品質保証
- ESLint + Prettier: コード品質とスタイル統一
- TypeScript厳密型チェック: 型安全性確保
- Vitest: 単体・統合テスト
- commitlint: 一貫したコミットメッセージ

### セキュリティ対策
- 環境変数によるAPIキー管理
- 入力検証（Zod使用）
- プロセス分離（MCPサーバー）
- 権限最小化原則

## プロジェクトの将来展望

### 短期目標（3ヶ月）
- 1000スター獲得
- 100人のコントリビューター
- 10個のサードパーティMCPツール
- 日次アクティブユーザー500人

### 中期目標（6ヶ月）
- 5000スター獲得
- エンタープライズ採用事例5社
- プラグインエコシステム確立
- 多言語対応（5言語以上）

### 長期目標（1年）
- 業界標準ツールとしての地位確立
- 20000スター獲得
- 商用サポートの提供開始
- AIエージェント連携標準の策定

## プロジェクトの特徴

1. **OpenAI互換APIとの接続**: Geminiアダプターを通じて、任意のOpenAI互換APIに接続可能
2. **マルチLLMプロバイダー対応**: Gemini、OpenAI、Anthropic、ローカルLLMをサポート
3. **MCP Protocol統合**: Model Context Protocolによるツール統合
4. **Node.js 20+による安定動作**: 安定した実行環境
5. **Docker完全対応**: 本格運用可能な環境
6. **高度なメモリ管理**: シナプス記憶ネットワークによるコンテキスト保持
7. **並列処理対応**: タスクの依存関係グラフ構築と並列実行最適化
8. **拡張性**: プラグインシステムとカスタムツール開発SDKを備える
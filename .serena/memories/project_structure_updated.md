# プロジェクト構造

## ルートディレクトリ

```
/agents/
├── packages/               # Gemini CLIコアパッケージ（モノレポ）
├── src/                    # Agents独自拡張コード  
├── scripts/                # ビルド・ユーティリティスクリプト
├── tests/                  # テストファイル
├── integration-tests/      # 統合テスト
├── docs/                   # ドキュメント
├── .github/                # GitHub Actions設定
├── .serena/               # Serena MCP設定
├── .agents/               # Agents設定
├── .claude/               # Claude Code設定
└── node_modules/          # 依存関係

## 設定ファイル
├── package.json           # プロジェクト設定（ワークスペース定義）
├── tsconfig.json          # TypeScript設定
├── eslint.config.js       # ESLint設定
├── .prettierrc.json       # Prettier設定
├── vitest.config.ts       # Vitest設定
├── docker-compose.yml     # Docker Compose設定
├── Dockerfile             # Dockerイメージ定義
├── .env.example           # 環境変数サンプル
└── CLAUDE.md              # Claude Code指示書
```

## packages/ディレクトリ（Gemini CLIコア）

```
packages/
├── cli/                    # CLIユーザーインターフェース
│   ├── src/
│   │   ├── index.ts       # CLIエントリポイント
│   │   ├── commands/      # コマンド実装
│   │   ├── ui/            # ターミナルUI
│   │   └── utils/         # ユーティリティ
│   ├── package.json
│   └── tsconfig.json
│
└── core/                   # コアバックエンド
    ├── src/
    │   ├── index.ts       # コアエントリポイント
    │   ├── api/           # LLM API連携
    │   ├── tools/         # ツール実装
    │   ├── state/         # 状態管理
    │   └── utils/         # ユーティリティ
    ├── package.json
    └── tsconfig.json
```

## src/ディレクトリ（Agents拡張）

```
src/
├── cli.ts                  # Agentsエントリポイント
├── cli/                    # Agents CLI拡張
│   ├── commands.ts        # 追加コマンド
│   └── repl.ts            # REPLモード（計画中）
├── core/                   # エージェントコア
│   ├── agent.ts           # エージェントロジック
│   ├── task-executor.ts   # タスク実行
│   └── memory.ts          # メモリ管理（計画中）
├── mcp/                    # MCP統合
│   ├── manager.ts         # MCPマネージャー
│   └── client.ts          # MCPクライアント
├── providers/              # LLMプロバイダー
│   ├── base.ts            # 基底インターフェース
│   ├── factory.ts         # プロバイダーファクトリー
│   ├── openai.ts          # OpenAI実装
│   ├── anthropic.ts       # Anthropic実装
│   └── local.ts           # ローカルLLM実装
├── functions/              # 内部関数
├── config/                 # 設定管理
├── types/                  # 型定義
└── utils/                  # ユーティリティ
```

## docs/ディレクトリ

```
docs/
├── ARCHITECTURE.md         # アーキテクチャ概要
├── REQUIREMENTS.md         # 要件定義
├── IMPLEMENTATION_STATUS.md # 実装状況
├── ROADMAP.md             # ロードマップ
├── cli/                   # CLI関連ドキュメント
├── core/                  # コア機能ドキュメント
├── design/                # 設計ドキュメント
├── tools/                 # ツールドキュメント
└── testing/               # テストドキュメント
```

## scripts/ディレクトリ

```
scripts/
├── start.js               # アプリケーション起動
├── build.js               # ビルドスクリプト
├── clean.js               # クリーンアップ
├── telemetry.js           # テレメトリ
├── version.js             # バージョン管理
└── tests/                 # スクリプトテスト
```

## 重要な特徴

1. **モノレポ構造**: packages/*でGemini CLIコアを管理
2. **拡張分離**: src/*でAgents固有機能を実装
3. **設定分離**: 各ツール（Serena、Claude等）の設定を独立管理
4. **ドキュメント充実**: docs/に包括的なドキュメント
5. **Docker対応**: コンテナ化された開発環境

## ファイル命名規則

- TypeScriptファイル: kebab-case.ts
- テストファイル: *.test.ts または *.spec.ts
- 設定ファイル: ドット始まり（.eslintrc等）
- ドキュメント: UPPERCASE.md または kebab-case.md
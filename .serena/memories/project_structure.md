# プロジェクト構造

## ルートディレクトリ
```
/agents/.git/worktree/feature-feature-requirements/
├── src/                    # ソースコード
├── tests/                  # テストファイル
├── docs/                   # ドキュメント
├── .github/                # GitHub Actions
├── dist/                   # ビルド成果物
├── node_modules/           # 依存関係
└── scripts/                # ユーティリティスクリプト
```

## src/ディレクトリ詳細
```
src/
├── cli/                    # CLIインターフェース
│   ├── cli.ts             # エントリーポイント
│   └── repl.ts            # REPLモード実装
├── core/                   # コア機能
│   ├── agent.ts           # エージェントコア
│   ├── task-executor.ts   # タスク実行エンジン
│   └── memory.ts          # メモリ管理
├── mcp/                    # MCPプロトコル
│   ├── manager.ts         # MCPマネージャー
│   └── client.ts          # MCPクライアント
├── providers/              # LLMプロバイダー
│   ├── base.ts            # 基底クラス
│   ├── factory.ts         # ファクトリー
│   ├── openai.ts          # OpenAI実装
│   ├── anthropic.ts       # Anthropic実装
│   └── local.ts           # ローカルLLM実装
├── types/                  # 型定義
│   └── config.ts          # 設定型
└── utils/                  # ユーティリティ
    ├── config.ts          # 設定管理
    └── logger.ts          # ログ管理
```

## 重要ファイル
- **package.json**: プロジェクト設定
- **tsconfig.json**: TypeScript設定
- **.eslintrc.json**: ESLint設定
- **.prettierrc.json**: Prettier設定
- **Dockerfile**: Docker設定
- **docker-compose.yml**: Docker Compose設定
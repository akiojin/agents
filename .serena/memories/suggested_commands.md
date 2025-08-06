# 開発コマンド一覧

## 開発実行
```bash
bun run dev           # 開発モードで実行
bun run start         # ビルド済みを実行
```

## ビルド
```bash
bun run build         # TypeScriptをビルド
bun run build:types   # 型定義のみ生成
bun run build:all     # 完全ビルド
```

## テスト
```bash
bun test              # テスト実行
bun test:watch        # ウォッチモード
bun test:coverage     # カバレッジ測定
```

## コード品質
```bash
bun run lint          # ESLint実行
bun run lint:fix      # ESLint自動修正
bun run format        # Prettier実行
bun run format:check  # フォーマットチェック
bun run typecheck     # 型チェック
```

## その他
```bash
bun run clean         # ビルド成果物削除
bun install           # 依存関係インストール
```

## Git操作
```bash
git status
git add -A
git commit -m "メッセージ"
git push origin <branch>
gh pr create          # PR作成
```

## Docker
```bash
docker compose build  # イメージビルド
docker compose up     # コンテナ起動
```
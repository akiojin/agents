# コードスタイルと規約

## TypeScript規約

- strictモード有効
- 型定義を必須とする
- interfaceよりtypeを優先
- 非同期処理はasync/await使用

## ファイル構造

- モジュール単位でディレクトリ分割
- index.tsは使用しない
- 拡張子は.jsを使用（ESM）
- 相対パスインポートは.js拡張子付き

## 命名規則

- ファイル名: kebab-case
- クラス名: PascalCase
- 関数/変数: camelCase
- 定数: UPPER_SNAKE_CASE
- 型/インターフェース: PascalCase

## コメント

- 日本語でコメント記載
- JSDocは不要（TypeScriptの型で表現）
- 複雑なロジックのみコメント追加

## エラーハンドリング

- try-catchでエラーをキャッチ
- loggerでエラーログ出力
- ユーザー向けメッセージは日本語

## Git規約

- commitlint準拠
- feat/fix/refactor等のprefix使用
- コミットメッセージは日本語可

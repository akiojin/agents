# 内部関数システム設計書

## 概要
agents内部に組み込み関数システムを実装し、外部MCPサーバーに依存しないファイルシステム操作とBash実行機能を提供する。

## アーキテクチャ

### 1. コンポーネント構成
```
src/functions/
├── security.ts       # セキュリティ制御
├── filesystem.ts     # ファイルシステム操作
├── bash.ts           # Bash実行機能
└── registry.ts       # 関数登録・実行システム
```

### 2. 統合ポイント
- `MCPFunctionConverter`: 内部関数をFunction Calling形式で統合
- `MCPToolsHelper`: 内部関数を優先実行
- `AgentCore`: 設定を通じて内部関数を初期化

## セキュリティ設計

### ファイルシステムセキュリティ
```typescript
interface SecurityConfig {
  allowedPaths: string[];              // 許可パス
  allowCurrentDirectoryChange: boolean; // ディレクトリ変更許可
  restrictToStartupDirectory: boolean;  // 開始ディレクトリ制限
}
```

**制御機能:**
- パス正規化とシンボリックリンク解決
- パストラバーサル攻撃防止
- 許可ディレクトリ外アクセス禁止

### Bash実行セキュリティ
```typescript
interface BashSecurityConfig {
  enabled: boolean;                 // 実行許可
  allowedCommands: string[];        // 許可コマンド
  blockedCommands: string[];        // 禁止コマンド
  timeout: number;                  // タイムアウト
  restrictWorkingDirectory: boolean; // 作業ディレクトリ制限
  allowedShells: string[];          // 許可シェル
}
```

**危険パターン検出:**
- `rm -rf /` - システム全削除
- Fork bomb パターン
- 直接ディスク書き込み
- システム制御コマンド

## 実装済み内部関数

### ファイルシステム関数
1. `internal_read_text_file` - ファイル読み取り
2. `internal_write_file` - ファイル書き込み
3. `internal_list_directory` - ディレクトリ一覧
4. `internal_create_directory` - ディレクトリ作成
5. `internal_delete_file` - ファイル削除
6. `internal_delete_directory` - ディレクトリ削除
7. `internal_get_file_info` - ファイル情報取得
8. `internal_change_directory` - ディレクトリ変更
9. `internal_get_current_directory` - 現在ディレクトリ取得
10. `internal_get_security_info` - セキュリティ情報取得

### Bash実行関数
11. `internal_execute_command` - コマンド実行
12. `internal_execute_command_interactive` - 対話式実行
13. `internal_get_bash_security_info` - Bash設定情報取得

## 実行フロー

1. **Function Calling**: LLMが`internal_`プレフィックス付き関数を呼び出し
2. **ルーティング**: `MCPToolsHelper`が内部関数を検出
3. **セキュリティ検証**: パスやコマンドの安全性をチェック
4. **実行**: 検証通過後に実際の操作を実行
5. **結果返却**: 成功/失敗の結果をLLMに返却

## 設定システム

### Config構造
```typescript
Config.functions = {
  filesystem: {
    enabled: boolean;
    security: SecurityConfig;
  },
  bash: {
    enabled: boolean;
    security: BashSecurityConfig;
  }
}
```

### デフォルト設定
- ファイルシステム: 実行ディレクトリ配下のみアクセス許可
- Bash: 基本コマンドのみ許可、危険コマンドは禁止
- タイムアウト: 30秒

## 利点

### パフォーマンス
- プロセス間通信不要で高速実行
- MCPサーバー起動時間の排除
- メモリ使用量の削減

### 安定性
- 外部プロセス依存の排除
- MCPサーバー接続エラーの回避
- より確実な関数実行

### セキュリティ
- 細かいアクセス制御
- 危険コマンドの防止
- パストラバーサル攻撃の防御

### 拡張性
- 新しい内部関数の容易な追加
- プラグインシステムの基盤
- カスタム関数の動的登録

## 現在の実装状況

### 完了済み
- [x] セキュリティ基盤 (`security.ts`)
- [x] ファイルシステム関数 (`filesystem.ts`)  
- [x] Bash実行機能 (`bash.ts`)
- [x] 関数登録システム (`registry.ts`)
- [x] MCPFunctionConverter統合
- [x] MCPToolsHelper統合
- [x] 設定システム統合

### 残作業
- [ ] InternalFunctionRegistryにbashプロパティ追加
- [ ] コンストラクタでBash機能初期化
- [ ] 設定システムにBash設定追加
- [ ] ビルド・テスト・動作確認

## セキュリティ考慮事項

### ファイルシステム
- 開始ディレクトリ外への書き込み禁止
- システムファイルへのアクセス制限
- 一時ファイルの適切な管理

### Bash実行
- 危険コマンドのブラックリスト
- タイムアウトによる無限実行防止
- 作業ディレクトリの制限
- 環境変数の制限

### 全般
- エラーメッセージでの情報漏洩防止
- ログ出力での機密情報の除外
- リソース使用量の制限
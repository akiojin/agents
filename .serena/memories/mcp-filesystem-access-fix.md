# MCP ファイルシステムアクセス修正

## 問題の概要
- ユーザーから「ファイルシステムへのアクセスができませんでした」というエラー報告
- 履歴を確認すると、MCPツール（serena、filesystem、google-search）が`Unknown tool`エラーで認識されていない
- LM Studio側がMCPツールを認識しておらず、Function Calling時にエラーが発生

## 根本原因
1. MCPLoaderが`stdio`タイプのサーバーのみをサポート
2. `.mcp.json`内の`http`および`sse`タイプのサーバーが無視されていた
3. MCPServerConfigインターフェースに`url`と`type`フィールドが不足

## 修正内容

### 1. MCPServerConfig型の拡張 (src/config/types.ts)
```typescript
export interface MCPServerConfig {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string; // HTTP/SSE サーバー用のURL
  type?: 'stdio' | 'sse' | 'http'; // サーバータイプ
}
```

### 2. MCPLoader拡張 (src/config/mcp-loader.ts)
- HTTP/SSEタイプのサーバー設定をサポート
- `convertServerEntry`メソッドでHTTP/SSE形式の設定を処理
- 環境変数展開とURL設定を追加

### 3. MCPManager拡張 (src/mcp/manager.ts)
- `startServer`メソッドでHTTP/SSEタイプを認識
- 現在は実装未完了のため警告メッセージ表示
- stdioタイプの既存処理は維持

## 設定ファイル構成
- `.mcp.json`: MCPサーバー設定（Claude Code互換）
- `.agents/settings.json`: アプリケーション設定
- 従来の`.agents.yaml`サポートは削除済み

## 現在のMCPサーバー対応状況
- **stdio**: ✅ 完全対応（filesystem、serena、textlint等）
- **http**: ⚠️ 設定解析のみ対応、接続未実装
- **sse**: ⚠️ 設定解析のみ対応、接続未実装

## 今回のエラー解決
- serenaツール（`mcp__serena__list_dir`等）は正常動作確認済み
- 履歴のエラーはLM Studio側の認識問題と判明
- REPLでのSerenaツール使用で正常にディレクトリ一覧取得成功

## 次のステップ
- HTTP/SSE接続の実装が必要な場合は追加開発
- 現在はstdioベースのMCPサーバーで十分動作
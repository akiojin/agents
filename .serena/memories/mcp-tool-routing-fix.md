# MCP Tool Routing Fix

## 問題
GPT-OSSがFunction Callingで`serena_list_dir`を呼び出した際、間違ったMCPサーバー（markitdownサーバー）に送信されていた。

## 原因
- MCPManager.invokeTool()でツール名にサーバープレフィックスがない場合、getDefaultServer()を使用
- getDefaultServer()は単純に最初のサーバー（markitdown）を返していた
- serenaプレフィックス付きツールが適切にserenaサーバーにルーティングされていなかった

## 修正内容

### 1. invokeTool()メソッドの修正
```typescript
async invokeTool(toolName: string, params?: Record<string, unknown>): Promise<unknown> {
  const [serverName, name] = toolName.includes(':')
    ? toolName.split(':', 2)
    : [this.getServerForTool(toolName), toolName];

  const client = this.servers.get(serverName || '');
  if (!client) {
    throw new Error(`MCPServernot found: ${serverName || 'デフォルト'}`);
  }

  return client.invokeTool(name || '', params);
}
```

### 2. getServerForTool()メソッドの追加
```typescript
private getServerForTool(toolName: string): string {
  // serenaプレフィックスのツールはserenaサーバーに送信
  if (toolName.startsWith('serena_')) {
    const serenaServer = Array.from(this.servers.keys()).find(name => 
      name.includes('serena') || name === 'serena'
    );
    if (serenaServer) {
      logger.debug(`Routing ${toolName} to serena server: ${serenaServer}`);
      return serenaServer;
    }
  }

  // mcp__で始まるツールは対応するサーバーを検索
  if (toolName.startsWith('mcp__')) {
    const serverHint = toolName.split('__')[1]; // mcp__filesystem__ -> filesystem
    const matchingServer = Array.from(this.servers.keys()).find(name => 
      name.includes(serverHint)
    );
    if (matchingServer) {
      logger.debug(`Routing ${toolName} to MCP server: ${matchingServer}`);
      return matchingServer;
    }
  }

  // フォールバック: デフォルトサーバーを使用
  const defaultServer = this.getDefaultServer();
  logger.debug(`Routing ${toolName} to default server: ${defaultServer}`);
  return defaultServer;
}
```

## 効果
- `serena_list_dir`が正しくserenaサーバーに送信される
- `mcp__filesystem__`系ツールも適切なサーバーにルーティング
- ログで実際のルーティング先が確認可能

## 動作確認
- ビルドは成功
- Function Calling機能は既に動作していたため、この修正によりツール実行エラーが解決される見込み

## ファイル
- src/mcp/manager.ts: invokeTool()とgetServerForTool()メソッドを修正/追加
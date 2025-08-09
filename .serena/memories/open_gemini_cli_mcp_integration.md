# open-gemini-cliのMCP統合状況

## 既に実装済みの機能

### MCPツール実装
- `packages/core/src/tools/mcp-tool.ts`
  - DiscoveredMCPToolクラス
  - 動的ツール発見
  - 信頼レベル管理（allowlist機能）
  - 実行前確認フロー

### MCPクライアント実装
- `packages/core/src/tools/mcp-client.ts`
  - 複数トランスポート対応
    - Stdio（プロセス間通信）
    - SSE（Server-Sent Events）
    - StreamableHTTP
  - サーバーステータス管理
  - ディスカバリー状態追跡

### MCP SDK統合
```typescript
// @modelcontextprotocol/sdk の完全統合
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
```

## 重要な発見
open-gemini-cliは既にMCPを完全にサポートしているため、agents側でMCP統合を別途実装する必要がない。
完全コピー戦略により、この成熟したMCP実装をそのまま活用できる。
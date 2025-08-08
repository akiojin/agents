#!/usr/bin/env bun

import { MCPManager } from './dist/mcp/manager.js';
import { AgentCore } from './dist/core/agent.js';
import { ConfigManager } from './dist/config/index.js';

async function testMCP() {
  console.log('=== MCP Test Starting ===\n');
  
  try {
    // 設定ファイルを読み込み
    const configManager = new ConfigManager();
    const config = await configManager.load();
    console.log('Config loaded successfully');
    console.log('Local endpoint:', config.localEndpoint);
    console.log('MCP enabled:', config.mcp?.enabled);
    console.log('MCP servers count:', config.mcp?.servers?.length);
    
    // AgentCoreを初期化
    console.log('\nInitializing AgentCore...');
    const agent = new AgentCore(config);
    
    // MCPManagerを初期化
    console.log('\nInitializing MCPManager...');
    const mcpManager = MCPManager.fromUnifiedConfig(config);
    
    // サーバー初期化イベントをリスニング
    mcpManager.on('server-initialized', (data) => {
      console.log(`[Event] Server initialized: ${data.serverName} (${data.toolCount} tools)`);
    });
    
    mcpManager.on('server-status-updated', (data) => {
      if (data.status.status === 'failed') {
        console.log(`[Event] Server failed: ${data.serverName} - ${data.status.error}`);
      }
    });
    
    // MCP初期化
    console.log('\nInitializing MCP servers...');
    await mcpManager.initialize();
    
    // 初期化結果を表示
    const progress = mcpManager.getInitializationProgress();
    console.log('\n=== Initialization Results ===');
    console.log(`Total servers: ${progress.total}`);
    console.log(`Completed: ${progress.completed}`);
    console.log(`Failed: ${progress.failed}`);
    
    // AgentにMCPツールを設定
    console.log('\nSetting up MCP tools in agent...');
    await agent.setupMCPTools(mcpManager);
    
    // 利用可能なツールを確認
    const functionCount = agent.getAvailableFunctionCount();
    console.log(`\nAvailable functions: ${functionCount}`);
    
    const mcpTools = await agent.getAvailableMCPTools();
    console.log(`Available MCP tools: ${mcpTools.length}`);
    
    if (mcpTools.length > 0) {
      console.log('\nFirst 5 MCP tools:');
      mcpTools.slice(0, 5).forEach(tool => {
        console.log(`  - ${tool.name}: ${tool.description.substring(0, 50)}...`);
      });
    }
    
    // Function Callingテスト
    console.log('\n=== Testing Function Calling ===');
    const testMessage = 'ファイルシステムを使って現在のディレクトリのファイル一覧を表示して';
    console.log(`Test message: ${testMessage}`);
    
    try {
      const response = await agent.chat(testMessage);
      console.log('\nResponse type:', typeof response);
      if (typeof response === 'object' && response.tool_calls) {
        console.log('Tool calls detected:', response.tool_calls.length);
        response.tool_calls.forEach(call => {
          console.log(`  - ${call.function.name}: ${JSON.stringify(call.function.arguments).substring(0, 100)}`);
        });
      } else {
        console.log('Text response:', response.substring(0, 200));
      }
    } catch (error) {
      console.error('Chat error:', error.message);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  process.exit(0);
}

testMCP();
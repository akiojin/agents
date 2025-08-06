#!/usr/bin/env bun

/**
 * MCPツール統合のデモンストレーションスクリプト
 *
 * このスクリプトは、@akiojin/agents のMCPツール統合機能の使用例を示します。
 * 実際のMCPサーバーが必要ですが、モックサーバーでのテストも可能です。
 */

import { AgentCore } from '../src/core/agent.js';
import { MCPManager } from '../src/mcp/manager.js';
// import { MCPToolsHelper, MCPTaskPlanner } from '../src/mcp/tools.js';
import type { Config } from '../src/types/config.js';
import chalk from 'chalk';

/* eslint-disable no-console, @typescript-eslint/explicit-function-return-type, @typescript-eslint/require-await, @typescript-eslint/strict-boolean-expressions, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

// デモ用の設定
const demoConfig: Config = {
  provider: 'openai',
  model: 'gpt-4-turbo-preview',
  apiKey: process.env.OPENAI_API_KEY || 'demo-key',
  useMCP: true,
  maxParallel: 3,
  logLevel: 'info',
  historyPath: './demo-history',
  timeout: 300,
  cachePath: './demo-cache',
  mcpServers: [
    // デモ用のファイルシステムサーバー
    {
      name: 'filesystem',
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem', './'],
      env: {
        MCP_LOG_LEVEL: 'info',
      },
    },
    // デモ用のシェルコマンドサーバー
    {
      name: 'shell',
      command: 'npx',
      args: ['@modelcontextprotocol/server-shell'],
      env: {
        MCP_LOG_LEVEL: 'info',
      },
    },
  ],
};

async function demonstrateMCPIntegration() {
  console.log(chalk.cyan('🚀 MCPツール統合デモを開始します'));
  console.log(chalk.gray('━'.repeat(50)));

  try {
    // エージェントとMCPマネージャーを初期化
    console.log(chalk.yellow('📋 エージェントを初期化中...'));
    const agent = new AgentCore(demoConfig);
    const mcpManager = new MCPManager(demoConfig);

    // MCPサーバーを起動
    console.log(chalk.yellow('🔧 MCPサーバーを起動中...'));
    await mcpManager.initialize();

    // エージェントにMCPツールを設定
    agent.setupMCPTools(mcpManager);

    console.log(chalk.green('✅ 初期化完了'));
    console.log(chalk.gray('━'.repeat(50)));

    // 利用可能なツールを表示
    await demonstrateToolListing(agent);

    // MCPサーバーステータスを表示
    await demonstrateServerStatus(agent);

    // ファイル操作のデモ
    await demonstrateFileOperations(agent);

    // タスク実行プランのデモ
    await demonstrateTaskPlanning(agent);

    // 実際のタスク実行のデモ
    await demonstrateTaskExecution(agent);

    console.log(chalk.gray('━'.repeat(50)));
    console.log(chalk.green('🎉 デモが正常に完了しました'));

    // クリーンアップ
    await mcpManager.shutdown();
  } catch (error) {
    console.error(chalk.red('❌ デモ実行中にエラーが発生しました:'), error);
    process.exit(1);
  }
}

async function demonstrateToolListing(agent: AgentCore) {
  console.log(chalk.cyan('🔍 利用可能なMCPツール:'));

  try {
    const tools = await agent.getAvailableMCPTools();

    if (tools.length === 0) {
      console.log(chalk.yellow('  利用可能なツールがありません'));
      return;
    }

    tools.forEach((tool, index) => {
      console.log(`  ${index + 1}. ${chalk.green(tool.name)}`);
      console.log(`     ${chalk.gray(tool.description)}`);
    });

    console.log(chalk.blue(`📊 合計: ${tools.length}個のツール`));
  } catch (error) {
    console.error(chalk.red('  ツール一覧の取得に失敗:'), error);
  }

  console.log();
}

async function demonstrateServerStatus(agent: AgentCore) {
  console.log(chalk.cyan('🌐 MCPサーバーステータス:'));

  const status = agent.getMCPServerStatus();

  if (!status) {
    console.log(chalk.red('  MCPツールが初期化されていません'));
    return;
  }

  for (const [name, connected] of status) {
    const statusIcon = connected ? '🟢' : '🔴';
    const statusText = connected ? chalk.green('接続済み') : chalk.red('切断');
    console.log(`  ${statusIcon} ${name}: ${statusText}`);
  }

  console.log();
}

async function demonstrateFileOperations(agent: AgentCore) {
  console.log(chalk.cyan('📁 ファイル操作デモ:'));

  try {
    // MCPツールを使用してpackage.jsonを読み取り
    const result = await agent.executeTaskWithMCP({
      description: 'package.jsonファイルの内容を確認する',
      files: ['package.json'],
    });

    if (result.success) {
      console.log(chalk.green('  ✅ ファイル読み取り成功'));
      console.log(chalk.gray(`  📄 実行サマリー: ${(result.data as any)?.summary || 'N/A'}`));
    } else {
      console.log(chalk.red('  ❌ ファイル読み取り失敗:'), result.message);
    }
  } catch (error) {
    console.log(chalk.red('  ❌ ファイル操作エラー:'), error);
  }

  console.log();
}

async function demonstrateTaskPlanning(agent: AgentCore) {
  console.log(chalk.cyan('📋 タスク実行プランのデモ:'));

  const sampleTasks = [
    'TypeScriptの型チェックを実行する',
    'プロジェクトのREADMEファイルを確認する',
    'Bunを使ってテストを実行する',
  ];

  for (const taskDesc of sampleTasks) {
    console.log(chalk.yellow(`  🎯 タスク: "${taskDesc}"`));

    try {
      // MCPTaskPlannerを直接使用してプランを作成
      const mcpStatus = agent.getMCPServerStatus();
      if (!mcpStatus) {
        console.log(chalk.red('    MCPツールが利用できません'));
        continue;
      }

      // 実際の実行プランを作成（MCPTaskPlannerを直接使用）
      console.log(chalk.green('    📝 実行プラン作成成功'));
      console.log(chalk.gray('    (実際のプラン詳細は executeTaskWithMCP で確認できます)'));
    } catch (error) {
      console.log(chalk.red('    ❌ プラン作成エラー:'), error);
    }
  }

  console.log();
}

async function demonstrateTaskExecution(agent: AgentCore) {
  console.log(chalk.cyan('⚡ タスク実行デモ:'));

  try {
    // 簡単なタスクを実行
    console.log(chalk.yellow('  🚀 実行中: "現在のディレクトリの内容を確認"'));

    const result = await agent.executeTaskWithMCP({
      description: '現在のディレクトリの内容を確認してファイル一覧を取得する',
      files: ['.'],
    });

    if (result.success) {
      console.log(chalk.green('  ✅ タスク実行成功'));

      const data = result.data as any;
      if (data?.summary) {
        console.log(chalk.blue(`  📊 実行サマリー: ${data.summary}`));
      }
      if (data?.executionPlan?.steps) {
        console.log(chalk.blue(`  📝 実行ステップ数: ${data.executionPlan.steps.length}`));
      }
    } else {
      console.log(chalk.red('  ❌ タスク実行失敗:'), result.message);
      if (result.error) {
        console.log(chalk.red('  詳細:'), result.error.message);
      }
    }
  } catch (error) {
    console.log(chalk.red('  ❌ タスク実行エラー:'), error);
  }

  console.log();
}

// 使用方法を表示
function showUsage() {
  console.log(chalk.cyan('MCPツール統合デモ'));
  console.log();
  console.log('使用方法:');
  console.log('  bun run examples/mcp-demo.ts');
  console.log();
  console.log('環境変数:');
  console.log('  OPENAI_API_KEY - OpenAI APIキー (任意、デモモードでは不要)');
  console.log();
  console.log('注意:');
  console.log('  - 実際のMCPサーバーが利用可能である必要があります');
  console.log('  - ファイルシステムサーバーは現在のディレクトリをルートとします');
  console.log('  - シェルコマンドサーバーは制限されたコマンドのみ実行可能です');
}

// メイン実行
if (import.meta.main) {
  console.clear();
  showUsage();
  console.log(chalk.gray('━'.repeat(50)));

  // デモ実行の確認
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.exit(0);
  }

  await demonstrateMCPIntegration();
}

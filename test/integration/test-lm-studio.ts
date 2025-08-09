#!/usr/bin/env bun
/**
 * LM Studio接続テストスクリプト
 * 実際にLM Studioと通信して動作を確認
 */

import { GeminiAdapterProvider } from '../../src/providers/gemini-adapter';
import { SubAgentManager } from '../../packages/agents/sub-agent';
import { TodoWriteTool } from '../../packages/tools/todo-write';
import { logger } from '../../src/utils/logger';

// 環境変数の設定
const LM_STUDIO_URL = process.env.LM_STUDIO_URL || 'http://localhost:1234/v1';
const API_KEY = process.env.LM_STUDIO_API_KEY || 'lm-studio';
const MODEL = process.env.LM_STUDIO_MODEL || 'local-model';

async function testLMStudioConnection() {
  console.log('🔍 LM Studio接続テスト開始...\n');
  
  // 1. Provider接続テスト
  console.log('1️⃣ GeminiAdapterProvider接続テスト');
  const provider = new GeminiAdapterProvider(API_KEY, MODEL, LM_STUDIO_URL);
  
  try {
    const isAvailable = await provider.validateConnection();
    if (isAvailable) {
      console.log('✅ LM Studioへの接続成功');
    } else {
      console.log('❌ LM Studioへの接続失敗 - サーバーが起動していることを確認してください');
      console.log(`   URL: ${LM_STUDIO_URL}`);
      return false;
    }
  } catch (error) {
    console.log('❌ 接続エラー:', error);
    return false;
  }

  // 2. 基本的なchat機能テスト
  console.log('\n2️⃣ 基本的なchat機能テスト');
  try {
    const response = await provider.chat([
      { role: 'user', content: 'Hello, this is a test. Please respond with "Test successful".' }
    ], {
      temperature: 0.1,
      maxTokens: 100,
    });
    
    console.log('✅ Chat応答受信:', response.substring(0, 100));
  } catch (error) {
    console.log('❌ Chatエラー:', error);
    return false;
  }

  // 3. システムプロンプトのテスト
  console.log('\n3️⃣ システムプロンプトのテスト');
  try {
    const response = await provider.chat([
      { role: 'user', content: 'What tools do you have access to?' }
    ], {
      temperature: 0.1,
      maxTokens: 500,
    });
    
    console.log('✅ システムプロンプト応答:', response.substring(0, 200));
    
    // DeepAgentプロンプトの要素が含まれているかチェック
    if (response.toLowerCase().includes('todo') || response.toLowerCase().includes('task')) {
      console.log('✅ DeepAgentシステムプロンプトが適用されている');
    } else {
      console.log('⚠️  DeepAgentシステムプロンプトが適用されていない可能性があります');
    }
  } catch (error) {
    console.log('❌ システムプロンプトテストエラー:', error);
  }

  return true;
}

async function testTodoWriteTool() {
  console.log('\n4️⃣ TodoWriteツールテスト');
  
  const todoTool = new TodoWriteTool();
  
  try {
    // TODOを作成
    const result1 = await todoTool.execute({
      todos: [
        { id: '1', content: 'タスク1', status: 'pending' },
        { id: '2', content: 'タスク2', status: 'in_progress' },
        { id: '3', content: 'タスク3', status: 'completed' },
      ]
    });
    
    console.log('✅ TodoWrite実行成功:', result1.message);
    console.log('   サマリー:', result1.summary);
    
    // フォーマットされたTODOを表示
    const formatted = todoTool.getFormattedTodos();
    console.log('✅ フォーマット済みTODO:\n', formatted);
    
  } catch (error) {
    console.log('❌ TodoWriteツールエラー:', error);
    return false;
  }
  
  return true;
}

async function testSubAgent() {
  console.log('\n5️⃣ SubAgentテスト');
  
  const provider = new GeminiAdapterProvider(API_KEY, MODEL, LM_STUDIO_URL);
  const subAgentManager = new SubAgentManager(provider);
  
  try {
    // サブエージェントでタスクを実行
    const result = await subAgentManager.executeTask(
      'general-purpose',
      'Please list 3 benefits of using TypeScript',
      {}
    );
    
    if (result.success) {
      console.log('✅ SubAgent実行成功');
      console.log('   応答:', result.response.substring(0, 200));
      console.log('   実行時間:', result.metadata?.duration, 'ms');
    } else {
      console.log('❌ SubAgent実行失敗:', result.response);
      return false;
    }
  } catch (error) {
    console.log('❌ SubAgentエラー:', error);
    return false;
  }
  
  return true;
}

async function main() {
  console.log('='.repeat(60));
  console.log('LM Studio統合テスト');
  console.log('='.repeat(60));
  console.log(`URL: ${LM_STUDIO_URL}`);
  console.log(`Model: ${MODEL}`);
  console.log('='.repeat(60) + '\n');
  
  // LM Studio接続テスト
  const connectionOk = await testLMStudioConnection();
  if (!connectionOk) {
    console.log('\n⚠️  LM Studioが起動していないか、設定が間違っています');
    console.log('以下を確認してください:');
    console.log('1. LM Studioが起動している');
    console.log('2. ローカルサーバーが有効になっている');
    console.log('3. ポートが1234（デフォルト）で正しい');
    console.log('4. モデルがロードされている');
    process.exit(1);
  }
  
  // TodoWriteツールテスト
  const todoOk = await testTodoWriteTool();
  
  // SubAgentテスト（LM Studio接続が必要）
  const subAgentOk = await testSubAgent();
  
  // 結果サマリー
  console.log('\n' + '='.repeat(60));
  console.log('テスト結果サマリー');
  console.log('='.repeat(60));
  console.log(`✅ LM Studio接続: ${connectionOk ? 'OK' : 'NG'}`);
  console.log(`✅ TodoWriteツール: ${todoOk ? 'OK' : 'NG'}`); 
  console.log(`✅ SubAgent: ${subAgentOk ? 'OK' : 'NG'}`);
  console.log('='.repeat(60));
  
  if (connectionOk && todoOk && subAgentOk) {
    console.log('\n🎉 すべてのテストが成功しました！');
    process.exit(0);
  } else {
    console.log('\n❌ 一部のテストが失敗しました');
    process.exit(1);
  }
}

// エラーハンドリング
process.on('unhandledRejection', (error) => {
  console.error('未処理のエラー:', error);
  process.exit(1);
});

// メイン実行
if (import.meta.main) {
  main().catch((error) => {
    console.error('エラー:', error);
    process.exit(1);
  });
}
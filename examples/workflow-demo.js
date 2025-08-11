#!/usr/bin/env node

/**
 * WorkflowOrchestrator承認プロセスのデモ
 * 
 * 使用方法:
 * 1. cd /agents
 * 2. node examples/workflow-demo.js
 */

const { WorkflowOrchestrator } = require('../packages/agents/dist/src/workflow-orchestrator');

async function main() {
  console.log('='.repeat(60));
  console.log('🚀 WorkflowOrchestrator 承認プロセスデモ');
  console.log('='.repeat(60));
  console.log('');
  
  // WorkflowOrchestratorのインスタンスを取得
  const orchestrator = WorkflowOrchestrator.getInstance();
  
  // テスト用のユーザーリクエストを作成
  const request = {
    id: `req-${Date.now()}`,
    description: 'ユーザー管理システムの作成（認証機能、データベース、APIエンドポイント、フロントエンド画面を含む）',
    context: {
      projectType: 'web-application',
      technologies: ['Node.js', 'Express', 'React', 'PostgreSQL']
    },
    constraints: [
      'セキュリティを重視する',
      'スケーラブルな設計にする'
    ],
    priority: 8,
    timestamp: new Date()
  };
  
  console.log('📝 リクエスト内容:');
  console.log(`  - ID: ${request.id}`);
  console.log(`  - 説明: ${request.description}`);
  console.log(`  - 優先度: ${request.priority}`);
  console.log('');
  
  try {
    // ワークフローを実行（承認プロセスを含む）
    console.log('🔄 ワークフローを開始します...\n');
    const result = await orchestrator.processUserRequest(request);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 最終結果:');
    console.log('='.repeat(60));
    console.log(`  状態: ${result.state}`);
    console.log(`  サマリー: ${result.summary}`);
    console.log(`  実行時間: ${(result.totalDuration / 1000).toFixed(2)}秒`);
    
    if (result.error) {
      console.log(`  エラー: ${result.error}`);
    }
    
    if (result.taskResults && result.taskResults.length > 0) {
      console.log('\n📋 タスク結果:');
      result.taskResults.forEach((task, index) => {
        const status = task.status === 'success' ? '✅' : '❌';
        console.log(`  ${index + 1}. ${status} ${task.agentName} - ${task.status}`);
      });
    }
    
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
  } finally {
    // リソースをクリーンアップ
    orchestrator.reset();
    console.log('\n✨ デモを終了します');
    process.exit(0);
  }
}

// エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// メイン関数を実行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
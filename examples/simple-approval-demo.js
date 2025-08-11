#!/usr/bin/env node

/**
 * 承認ワークフローの簡単なデモ
 * 
 * 使用方法:
 * node examples/simple-approval-demo.js
 */

const readline = require('readline');

// 承認インターフェースのシンプルな実装
class SimpleApprovalInterface {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async requestApproval(plan) {
    console.log('\n' + '='.repeat(60));
    console.log('📋 実行計画の承認が必要です');
    console.log('='.repeat(60));
    
    // 計画の概要を表示
    console.log('\n📊 計画概要:');
    console.log(`  - タスク数: ${plan.tasks.length}`);
    console.log(`  - 推定実行時間: ${plan.estimatedDuration}分`);
    console.log(`  - 複雑度: ${plan.complexity}`);
    
    console.log('\n📝 主要タスク:');
    plan.tasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task}`);
    });
    
    // 承認選択肢を取得
    while (true) {
      console.log('\n選択肢:');
      console.log('  [A] 承認 - 計画を承認して実行');
      console.log('  [R] 拒否 - 計画を拒否して中止');
      console.log('  [D] 詳細 - 計画の詳細を表示');
      console.log('');
      
      const answer = await this.askQuestion('選択してください [A/R/D]: ');
      const choice = answer.toLowerCase();
      
      switch (choice) {
        case 'a':
          console.log('\n✅ 計画が承認されました。実行を開始します...\n');
          return { choice: 'approve' };
          
        case 'r':
          const reason = await this.askQuestion('拒否理由を入力してください（任意）: ');
          console.log('\n❌ 計画が拒否されました。\n');
          return { 
            choice: 'reject',
            reason: reason || '理由なし'
          };
          
        case 'd':
          this.displayPlanDetails(plan);
          continue;
          
        default:
          console.log('\n⚠️  無効な選択です。A, R, D のいずれかを入力してください。');
      }
    }
  }

  displayPlanDetails(plan) {
    console.log('\n' + '='.repeat(60));
    console.log('📄 実行計画詳細');
    console.log('='.repeat(60));
    
    console.log('\n🎯 要件:');
    plan.requirements.forEach(req => {
      console.log(`  - ${req}`);
    });
    
    console.log('\n🔄 実行グループ:');
    plan.executionGroups.forEach((group, index) => {
      console.log(`\n  グループ ${index + 1} (${group.type}):`);
      group.tasks.forEach(task => {
        console.log(`    - ${task}`);
      });
    });
    
    console.log('\n✅ 成功基準:');
    plan.successCriteria.forEach(criteria => {
      console.log(`  - ${criteria}`);
    });
  }

  askQuestion(prompt) {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  close() {
    this.rl.close();
  }
}

// デモ用のワークフローシミュレーター
class WorkflowSimulator {
  constructor() {
    this.approvalInterface = new SimpleApprovalInterface();
  }

  async processRequest(request) {
    console.log('='.repeat(60));
    console.log('🚀 ワークフロー承認プロセスデモ');
    console.log('='.repeat(60));
    console.log('');
    
    console.log('📝 リクエスト内容:');
    console.log(`  - 説明: ${request.description}`);
    console.log(`  - 優先度: ${request.priority}`);
    console.log('');
    
    // 実行計画を作成（デモ用のダミーデータ）
    const plan = {
      tasks: [
        'ユーザー認証機能の実装',
        'データベーススキーマの作成',
        'APIエンドポイントの実装',
        'フロントエンド画面の作成',
        'テストの作成と実行'
      ],
      estimatedDuration: 30,
      complexity: 'medium',
      requirements: [
        'ユーザー登録・ログイン機能',
        'セキュアな認証トークン管理',
        'RESTful API設計'
      ],
      executionGroups: [
        {
          type: '⚡ 並列実行',
          tasks: ['データベーススキーマの作成', 'フロントエンド画面の作成']
        },
        {
          type: '📝 順次実行',
          tasks: ['ユーザー認証機能の実装', 'APIエンドポイントの実装']
        },
        {
          type: '📝 順次実行',
          tasks: ['テストの作成と実行']
        }
      ],
      successCriteria: [
        'すべての機能が実装されている',
        'テストが通過している',
        'コードレビューが完了している'
      ]
    };
    
    console.log('🔄 実行計画を作成しました\n');
    
    // 承認プロセス
    const approvalResult = await this.approvalInterface.requestApproval(plan);
    
    if (approvalResult.choice === 'approve') {
      // 実行をシミュレート
      console.log('⚙️  タスクを実行中...');
      
      for (let i = 0; i < plan.tasks.length; i++) {
        await this.delay(500); // 0.5秒待機
        console.log(`  ✅ タスク ${i + 1}/${plan.tasks.length}: ${plan.tasks[i]} - 完了`);
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ 実行完了');
      console.log('='.repeat(60));
      console.log(`📊 結果: ${plan.tasks.length}個成功, 0個失敗`);
      console.log(`⏱️  実行時間: 2.50秒`);
      console.log('='.repeat(60) + '\n');
    } else {
      console.log('ワークフローがユーザーによって拒否されました');
      console.log(`理由: ${approvalResult.reason}`);
    }
    
    this.approvalInterface.close();
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// メイン関数
async function main() {
  const simulator = new WorkflowSimulator();
  
  const request = {
    description: 'ユーザー管理システムの作成（認証機能、データベース、APIエンドポイント、フロントエンド画面を含む）',
    priority: 8
  };
  
  try {
    await simulator.processRequest(request);
  } catch (error) {
    console.error('エラーが発生しました:', error);
  }
  
  process.exit(0);
}

// エラーハンドリング
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// 実行
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
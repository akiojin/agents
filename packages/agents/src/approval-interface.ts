/**
 * 承認インターフェース - ユーザーの承認を対話的に取得
 */

import * as readline from 'readline';
import { ExecutionPlan, Requirements } from './workflow-orchestrator';

// 承認の選択肢
export enum ApprovalChoice {
  APPROVE = 'approve',
  REJECT = 'reject',
  MODIFY = 'modify',
  SHOW_DETAILS = 'details'
}

// 承認結果
export interface ApprovalResult {
  choice: ApprovalChoice;
  modifiedPlan?: Partial<ExecutionPlan>;
  reason?: string;
}

/**
 * ユーザー承認インターフェース
 */
export class ApprovalInterface {
  private rl: readline.Interface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  /**
   * 実行計画の承認を求める
   */
  public async requestApproval(plan: ExecutionPlan): Promise<ApprovalResult> {
    console.log('\n' + '='.repeat(60));
    console.log('📋 実行計画の承認が必要です');
    console.log('='.repeat(60));
    
    // 計画の概要を表示
    this.displayPlanSummary(plan);
    
    // 承認選択肢を取得
    return await this.getApprovalChoice(plan);
  }

  /**
   * 計画の概要を表示
   */
  private displayPlanSummary(plan: ExecutionPlan): void {
    console.log('\n📊 計画概要:');
    console.log(`  - 計画ID: ${plan.id}`);
    console.log(`  - タスク数: ${plan.tasks.length}`);
    console.log(`  - 実行グループ数: ${plan.executionGroups.length}`);
    console.log(`  - 推定実行時間: ${plan.estimatedDuration || '不明'}分`);
    console.log(`  - 複雑度: ${plan.requirements.estimatedComplexity}`);
    
    // 主要なタスクを表示
    console.log('\n📝 主要タスク:');
    const displayTasks = plan.tasks.slice(0, 5);
    displayTasks.forEach((task, index) => {
      console.log(`  ${index + 1}. ${task.description}`);
    });
    
    if (plan.tasks.length > 5) {
      console.log(`  ... 他 ${plan.tasks.length - 5} タスク`);
    }
  }

  /**
   * 計画の詳細を表示
   */
  private displayPlanDetails(plan: ExecutionPlan): void {
    console.log('\n' + '='.repeat(60));
    console.log('📄 実行計画詳細');
    console.log('='.repeat(60));
    
    // 要件を表示
    console.log('\n🎯 要件:');
    console.log('  機能要件:');
    plan.requirements.functionalRequirements.forEach(req => {
      console.log(`    - ${req}`);
    });
    
    if (plan.requirements.nonFunctionalRequirements.length > 0) {
      console.log('  非機能要件:');
      plan.requirements.nonFunctionalRequirements.forEach(req => {
        console.log(`    - ${req}`);
      });
    }
    
    // 実行グループを表示
    console.log('\n🔄 実行グループ:');
    plan.executionGroups.forEach((group, index) => {
      const mode = group.canRunInParallel ? '⚡ 並列実行' : '📝 順次実行';
      console.log(`\n  グループ ${index + 1} (${mode}):`);
      
      group.tasks.forEach(match => {
        const deps = match.task.dependencies?.length 
          ? ` [依存: ${match.task.dependencies.join(', ')}]` 
          : '';
        console.log(`    - [${match.agent.name}] ${match.task.description}${deps}`);
      });
    });
    
    // 成功基準を表示
    console.log('\n✅ 成功基準:');
    plan.requirements.successCriteria.forEach(criteria => {
      console.log(`  - ${criteria}`);
    });
  }

  /**
   * 承認選択肢を取得
   */
  private async getApprovalChoice(plan: ExecutionPlan): Promise<ApprovalResult> {
    while (true) {
      console.log('\n選択肢:');
      console.log('  [A] 承認 - 計画を承認して実行');
      console.log('  [R] 拒否 - 計画を拒否して中止');
      console.log('  [M] 修正 - 計画を修正（未実装）');
      console.log('  [D] 詳細 - 計画の詳細を表示');
      console.log('');
      
      const answer = await this.askQuestion('選択してください [A/R/M/D]: ');
      const choice = answer.toLowerCase();
      
      switch (choice) {
        case 'a':
          console.log('\n✅ 計画が承認されました。実行を開始します...\n');
          return { choice: ApprovalChoice.APPROVE };
          
        case 'r':
          const reason = await this.askQuestion('拒否理由を入力してください（任意）: ');
          console.log('\n❌ 計画が拒否されました。\n');
          return { 
            choice: ApprovalChoice.REJECT,
            reason: reason || '理由なし'
          };
          
        case 'm':
          console.log('\n⚠️  修正機能は現在未実装です。');
          continue;
          
        case 'd':
          this.displayPlanDetails(plan);
          continue;
          
        default:
          console.log('\n⚠️  無効な選択です。A, R, M, D のいずれかを入力してください。');
      }
    }
  }

  /**
   * 質問をしてユーザー入力を取得
   */
  private askQuestion(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * インターフェースを閉じる
   */
  public close(): void {
    this.rl.close();
  }

  /**
   * 実行結果のサマリーを表示
   */
  public displayExecutionSummary(
    success: boolean,
    summary: string,
    duration: number
  ): void {
    console.log('\n' + '='.repeat(60));
    console.log(success ? '✅ 実行完了' : '❌ 実行失敗');
    console.log('='.repeat(60));
    console.log(`📊 結果: ${summary}`);
    console.log(`⏱️  実行時間: ${(duration / 1000).toFixed(2)}秒`);
    console.log('='.repeat(60) + '\n');
  }
}
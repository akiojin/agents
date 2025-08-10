#!/usr/bin/env node

/**
 * 入力キューイングシステムのテスト
 * 
 * このスクリプトは、エージェントが処理中でも
 * 新しい入力を受け付けることを検証します。
 */

const chalk = require('chalk');
const { spawn } = require('child_process');
const path = require('path');

console.log(chalk.cyan('=== 入力キューイングシステムテスト ==='));
console.log('');

// agents CLIを起動
const agentsPath = path.join(__dirname, '..', 'bin', 'agents.js');
const agentProcess = spawn('node', [agentsPath], {
  stdio: ['pipe', 'pipe', 'pipe']
});

let outputBuffer = '';
let testPhase = 0;
let testStartTime = Date.now();

// 標準出力を監視
agentProcess.stdout.on('data', (data) => {
  const output = data.toString();
  outputBuffer += output;
  process.stdout.write(output);
  
  // プロンプトが表示されたら次の入力を送信
  if (output.includes('>') && testPhase < 5) {
    setTimeout(() => sendNextCommand(), 500);
  }
});

// エラー出力を監視
agentProcess.stderr.on('data', (data) => {
  console.error(chalk.red('STDERR:'), data.toString());
});

// プロセス終了時
agentProcess.on('close', (code) => {
  const duration = Date.now() - testStartTime;
  console.log('');
  console.log(chalk.cyan('=== テスト結果 ==='));
  console.log(`実行時間: ${duration}ms`);
  console.log(`終了コード: ${code}`);
  
  // テスト結果の評価
  evaluateTestResults();
  
  process.exit(code);
});

function sendNextCommand() {
  testPhase++;
  
  switch(testPhase) {
    case 1:
      console.log(chalk.yellow('\n[TEST] 長時間処理を開始...'));
      agentProcess.stdin.write('大規模なコードベースの分析を開始してください\n');
      break;
      
    case 2:
      console.log(chalk.yellow('\n[TEST] 処理中に新しいコマンドを送信...'));
      agentProcess.stdin.write('/status\n');
      break;
      
    case 3:
      console.log(chalk.yellow('\n[TEST] さらに別のコマンドを送信...'));
      agentProcess.stdin.write('/jobs\n');
      break;
      
    case 4:
      console.log(chalk.yellow('\n[TEST] バックグラウンドシェルコマンド...'));
      agentProcess.stdin.write('/shell sleep 5 && echo "Background task completed"\n');
      break;
      
    case 5:
      console.log(chalk.yellow('\n[TEST] 終了コマンド...'));
      setTimeout(() => {
        agentProcess.stdin.write('/exit\n');
      }, 2000);
      break;
  }
}

function evaluateTestResults() {
  console.log('');
  console.log(chalk.cyan('=== 評価 ==='));
  
  // キューメッセージが表示されているか確認
  const hasQueueMessage = outputBuffer.includes('[Queue:') || outputBuffer.includes('キューに追加');
  console.log(hasQueueMessage 
    ? chalk.green('✅ キューイングメッセージが確認されました')
    : chalk.red('❌ キューイングメッセージが見つかりません'));
  
  // 複数のプロンプトが表示されているか確認
  const promptCount = (outputBuffer.match(/>/g) || []).length;
  console.log(promptCount > 3
    ? chalk.green(`✅ 複数のプロンプトが表示されました (${promptCount}回)`)
    : chalk.red(`❌ プロンプトの表示が少なすぎます (${promptCount}回)`));
  
  // バックグラウンドジョブが開始されたか確認
  const hasBackgroundJob = outputBuffer.includes('bg-') || outputBuffer.includes('Started background job');
  console.log(hasBackgroundJob
    ? chalk.green('✅ バックグラウンドジョブが開始されました')
    : chalk.yellow('⚠️ バックグラウンドジョブが確認できません'));
  
  // エラーが発生していないか確認
  const hasError = outputBuffer.toLowerCase().includes('error') && !outputBuffer.includes('[TEST]');
  console.log(!hasError
    ? chalk.green('✅ エラーは発生していません')
    : chalk.yellow('⚠️ エラーメッセージが検出されました'));
}

// 最初のコマンドを少し待ってから送信
setTimeout(() => {
  console.log(chalk.cyan('テストを開始します...'));
  console.log('');
}, 2000);
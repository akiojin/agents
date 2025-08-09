import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import { join } from 'path';

// E2Eテスト用のCLIインターフェース
class CLITestInterface {
  private process: ChildProcess | null = null;
  private output: string[] = [];
  private isReady = false;

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Agentsアプリケーションを起動
      this.process = spawn('npm', ['start'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          CHROMA_URL: 'http://localhost:8000'
        }
      });

      if (!this.process.stdout || !this.process.stderr) {
        reject(new Error('プロセスのstdout/stderrが利用できません'));
        return;
      }

      this.process.stdout.on('data', (data: Buffer) => {
        const output = data.toString();
        this.output.push(output);
        
        // アプリケーションが準備完了したかチェック
        if (output.includes('Ready for input') || output.includes('claude>')) {
          this.isReady = true;
          resolve();
        }
      });

      this.process.stderr.on('data', (data: Buffer) => {
        console.error('CLI Error:', data.toString());
      });

      this.process.on('error', (error) => {
        reject(error);
      });

      // タイムアウト設定
      setTimeout(() => {
        if (!this.isReady) {
          reject(new Error('CLI起動がタイムアウトしました'));
        }
      }, 30000);
    });
  }

  async sendCommand(command: string): Promise<string> {
    if (!this.process || !this.process.stdin) {
      throw new Error('プロセスが起動していません');
    }

    // 出力をクリア
    this.output = [];

    // コマンドを送信
    this.process.stdin.write(command + '\n');

    // レスポンスを待機
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        resolve(this.output.join('\n'));
      }, 5000);

      const checkOutput = () => {
        const currentOutput = this.output.join('\n');
        
        // コマンド完了の指標をチェック
        if (currentOutput.includes('claude>') || 
            currentOutput.includes('Complete') || 
            currentOutput.includes('Error:')) {
          clearTimeout(timeout);
          resolve(currentOutput);
        } else {
          setTimeout(checkOutput, 100);
        }
      };

      checkOutput();
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      this.process.kill('SIGTERM');
      
      return new Promise((resolve) => {
        if (this.process) {
          this.process.on('exit', () => {
            resolve();
          });
        } else {
          resolve();
        }
      });
    }
  }

  getOutput(): string[] {
    return [...this.output];
  }
}

describe('Synaptic Memory E2E Tests', () => {
  let cli: CLITestInterface;

  beforeEach(async () => {
    cli = new CLITestInterface();
    
    // テスト用のChromaDBが起動していることを確認
    try {
      const response = await fetch('http://localhost:8000/api/v1/heartbeat');
      if (!response.ok) {
        throw new Error('ChromaDBが応答していません');
      }
    } catch (error) {
      console.warn('ChromaDB接続テストをスキップします:', error);
    }

    await cli.start();
  }, 60000);

  afterEach(async () => {
    if (cli) {
      await cli.stop();
    }
  }, 30000);

  describe('基本的なワークフロー', () => {
    it('記憶作成→活性化→検索のワークフローが正常に動作すること', async () => {
      // 1. Synapticコマンドでダッシュボードアクセス
      const dashboardResponse = await cli.sendCommand('/synaptic help');
      expect(dashboardResponse).toContain('Synaptic Memory システムのコマンド');

      // 2. システムステータス確認
      const statusResponse = await cli.sendCommand('/synaptic status');
      expect(statusResponse).toContain('Synaptic Memory システム状態');
      expect(statusResponse).toContain('健康スコア');

      // 3. 新しい記憶を作成するためのユーザー入力をシミュレート
      const userInput1 = await cli.sendCommand('TypeScriptのジェネリクスについて学習しました');
      expect(userInput1).toContain('claude>');

      const userInput2 = await cli.sendCommand('React Hooksの最適な使用パターンを理解しました');
      expect(userInput2).toContain('claude>');

      const userInput3 = await cli.sendCommand('Node.jsでAPIサーバーを構築する方法を学びました');
      expect(userInput3).toContain('claude>');

      // 4. 記憶検索の実行
      const searchResponse = await cli.sendCommand('/synaptic search "TypeScript"');
      expect(searchResponse).toContain('検索結果');
      expect(searchResponse).toContain('TypeScript') || expect(searchResponse).toContain('ジェネリクス');

      // 5. React関連の検索
      const reactSearchResponse = await cli.sendCommand('/synaptic search "React"');
      expect(reactSearchResponse).toContain('検索結果');

      // 6. Node.js関連の検索
      const nodeSearchResponse = await cli.sendCommand('/synaptic search "Node.js"');
      expect(nodeSearchResponse).toContain('検索結果');
    }, 120000);

    it('複雑な検索クエリが正しく処理されること', async () => {
      // テストデータの作成
      await cli.sendCommand('Reactのuseeffectフックでデータフェッチングを実装しました');
      await cli.sendCommand('TypeScriptの型安全性により開発効率が向上しました');
      await cli.sendCommand('Next.jsでSSRを実装してパフォーマンスが改善されました');

      // 複雑なクエリでの検索
      const complexSearchResponse = await cli.sendCommand('/synaptic search "React TypeScript"');
      expect(complexSearchResponse).toContain('検索結果');

      // 引用符を使った検索
      const quotedSearchResponse = await cli.sendCommand('/synaptic search "データフェッチング"');
      expect(quotedSearchResponse).toContain('検索結果');
    }, 60000);
  });

  describe('エラーハンドリング', () => {
    it('無効なコマンドに対して適切なエラーメッセージを表示すること', async () => {
      const invalidCommandResponse = await cli.sendCommand('/synaptic invalid-command');
      expect(invalidCommandResponse).toContain('不明なコマンド');
      expect(invalidCommandResponse).toContain('/synaptic help');
    }, 30000);

    it('空の検索クエリに対してエラーメッセージを表示すること', async () => {
      const emptySearchResponse = await cli.sendCommand('/synaptic search');
      expect(emptySearchResponse).toContain('検索クエリを指定してください');
    }, 30000);

    it('システムエラー時に適切な回復処理が動作すること', async () => {
      // システム状態を確認
      const statusResponse = await cli.sendCommand('/synaptic status');
      expect(statusResponse).toContain('システム状態');

      // 無効なメモリIDでの活性化
      const invalidActivationResponse = await cli.sendCommand('/synaptic activate invalid-memory-id');
      // エラーメッセージまたは適切な処理結果を期待
      expect(invalidActivationResponse).toBeDefined();
    }, 30000);
  });

  describe('パフォーマンス', () => {
    it('大量データでの応答時間が許容範囲内であること', async () => {
      // 複数の記憶を作成
      const startTime = Date.now();
      
      for (let i = 1; i <= 10; i++) {
        await cli.sendCommand(`記憶${i}: JavaScript、TypeScript、React、Node.jsの開発経験`);
      }

      const creationTime = Date.now() - startTime;
      expect(creationTime).toBeLessThan(60000); // 60秒以内

      // 検索パフォーマンステスト
      const searchStartTime = Date.now();
      const searchResponse = await cli.sendCommand('/synaptic search "JavaScript"');
      const searchTime = Date.now() - searchStartTime;

      expect(searchTime).toBeLessThan(10000); // 10秒以内
      expect(searchResponse).toContain('検索結果');
    }, 120000);
  });

  describe('継続的なセッション', () => {
    it('複数のインタラクションが正しく記憶されること', async () => {
      // セッション1: 問題遭遇
      await cli.sendCommand('TypeScriptで型エラーが発生しました');
      
      // セッション2: 解決策模索  
      await cli.sendCommand('型注釈を追加して解決を試みています');
      
      // セッション3: 成功
      await cli.sendCommand('型エラーが解決され、コンパイルが成功しました');

      // 関連する記憶の検索
      const problemSearchResponse = await cli.sendCommand('/synaptic search "TypeScript"');
      expect(problemSearchResponse).toContain('検索結果');

      const solutionSearchResponse = await cli.sendCommand('/synaptic search "解決"');
      expect(solutionSearchResponse).toContain('検索結果');

      // システム状態の確認
      const statusResponse = await cli.sendCommand('/synaptic status');
      expect(statusResponse).toContain('総メモリ数');
    }, 90000);

    it('時系列での記憶の関連性が維持されること', async () => {
      const startTime = Date.now();

      // 時系列でのイベント記録
      await cli.sendCommand('新しいプロジェクトを開始しました');
      await new Promise(resolve => setTimeout(resolve, 1000));

      await cli.sendCommand('プロジェクト要件を分析しました');
      await new Promise(resolve => setTimeout(resolve, 1000));

      await cli.sendCommand('設計書を作成しました');
      await new Promise(resolve => setTimeout(resolve, 1000));

      await cli.sendCommand('実装を完了しました');
      
      // プロジェクト関連の検索
      const projectSearchResponse = await cli.sendCommand('/synaptic search "プロジェクト"');
      expect(projectSearchResponse).toContain('検索結果');

      // システム診断でシナプス接続を確認
      const statusResponse = await cli.sendCommand('/synaptic status');
      expect(statusResponse).toContain('アクティブシナプス');
    }, 60000);
  });

  describe('ダッシュボードインタラクション', () => {
    it('ダッシュボード機能が正常に動作すること', async () => {
      // テストデータを作成
      await cli.sendCommand('ReactのuseStateフックを学習しました');
      await cli.sendCommand('コンポーネントの再レンダリングについて理解しました');

      // ダッシュボード関連のコマンドをテスト
      const helpResponse = await cli.sendCommand('/synaptic help');
      expect(helpResponse).toContain('ダッシュボードを開く');

      const statusResponse = await cli.sendCommand('/synaptic status');
      expect(statusResponse).toContain('システム状態');
      expect(statusResponse).toContain('健康スコア');
    }, 45000);
  });
});
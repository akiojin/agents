# エージェントモニター実装ドキュメント

## 概要

サブエージェントの実行状況をリアルタイムで視認できるようにするため、`AgentMonitor`クラスを実装しました。これにより、複数のエージェントが並列実行される際の状況が分かりやすく表示されます。

## 実装内容

### 1. AgentMonitorクラス（`packages/agents/src/agent-monitor.ts`）

#### 主な機能

- **リアルタイム監視**: エージェントの実行状況をリアルタイムで追跡
- **階層表示**: 親子関係を持つエージェントをツリー構造で表示
- **進捗表示**: 各エージェントの作業進捗をプログレスバーで表示
- **状態管理**: エージェントの状態遷移を管理（IDLE → EXECUTING → COMPLETED等）
- **ツール使用記録**: 各エージェントが使用したツールを記録
- **実行履歴**: 完了したエージェントの履歴を保持

#### エージェント状態

```typescript
enum AgentExecutionState {
  IDLE = 'idle',              // 待機中
  INITIALIZING = 'initializing',  // 初期化中
  PLANNING = 'planning',      // 計画中
  EXECUTING = 'executing',    // 実行中
  WAITING = 'waiting',        // 待機中
  COMPLETED = 'completed',    // 完了
  FAILED = 'failed',          // 失敗
  CANCELLED = 'cancelled'     // キャンセル
}
```

#### 表示例

```
═══════════════════════════════════════════════════════════════
                    エージェント実行状況モニター                    
═══════════════════════════════════════════════════════════════

⚙️ Workflow Orchestrator [orchestrator] EXECUTING
  📝 実行計画: 3個のタスク
  → グループ 2/3 - 並列実行
  ████████████░░░░░░░░ 66% (2/3)
  ⏱️  2分15秒

  ├─ ⚙️ Code Reviewer [code-reviewer] EXECUTING
  │   📝 コードレビューの実行
  │   → ツール実行中: analyze_code (2/3)
  │   ██████░░░░░░░░░░░░░░ 33% (1/3)
  │   ⏱️  45秒
  │   🔧 ツール: read_file, analyze_code

  ├─ ✅ Test Runner [test-runner] COMPLETED
  │   📝 テストの実行
  │   ⏱️  1分30秒
  │   🔧 ツール: execute_command, write_todos

📊 サマリー:
  合計: 3 | 実行中: 2 | 完了: 1 | 失敗: 0 | 待機中: 0
```

### 2. SubAgentクラスの拡張（`packages/agents/sub-agent.ts`）

#### 追加機能

- **進捗報告**: タスク実行中の進捗をモニターに報告
- **状態更新**: 実行状態の変化をモニターに通知
- **ツール使用通知**: 使用したツールをモニターに記録

#### 実装詳細

```typescript
// エージェント実行時の処理
async execute(task: string, context: SubAgentContext = {}): Promise<SubAgentResult> {
  // モニターにエージェントを登録
  if (this.monitor) {
    const agentInfo: AgentExecutionInfo = {
      agentId: this.id,
      agentType: this.type,
      agentName: this.config.name,
      taskId: this.currentTaskId,
      taskDescription: task,
      state: AgentExecutionState.INITIALIZING,
      startTime: new Date(),
      parentAgentId: context.parentContext?.agentId
    };
    this.monitor.registerAgent(agentInfo);
  }
  
  // 実行中の状態変化を報告
  this.updateMonitorState(AgentExecutionState.PLANNING, { 
    currentStep: 'タスクを分析中...' 
  });
  
  // 進捗を更新
  this.updateMonitorProgress(1, 4, 'LLMを呼び出し中...');
  
  // ... 実際の処理 ...
}
```

### 3. WorkflowOrchestratorとの統合（`packages/agents/src/workflow-orchestrator.ts`）

#### 統合内容

- **モニターの初期化**: WorkflowOrchestrator起動時にモニターを初期化
- **実行開始/終了の管理**: タスク実行開始時にモニタリングを開始し、完了後に停止
- **親子関係の設定**: オーケストレーターを親として、各サブエージェントを子として登録
- **詳細なログ出力**: 実行グループ、並列/順次実行、タスクの進捗を表示

#### 実装詳細

```typescript
// 計画実行時
public async executePlan(planId: string): Promise<WorkflowExecutionResult> {
  // モニタリングを開始
  this.monitor.startMonitoring();
  
  // メインオーケストレーターをモニターに登録
  this.monitor.registerAgent({
    agentId: this.mainAgentId,
    agentType: 'orchestrator',
    agentName: 'Workflow Orchestrator',
    taskId: planId,
    taskDescription: `実行計画: ${plan.tasks.length}個のタスク`,
    state: AgentExecutionState.EXECUTING,
    startTime: new Date()
  });
  
  // 各タスクを実行（親エージェントIDを渡す）
  const result = await this.executeTask(
    match.task, 
    match.agent.name, 
    this.mainAgentId  // 親エージェントID
  );
  
  // 完了後、5秒後にモニタリングを停止
  setTimeout(() => {
    this.monitor.stopMonitoring();
  }, 5000);
}
```

## 利点

1. **視認性の向上**
   - 複数エージェントの実行状況が一目で分かる
   - 階層構造により、エージェント間の関係が明確

2. **デバッグの容易化**
   - 各エージェントの状態遷移を追跡可能
   - エラー発生時の原因特定が容易

3. **パフォーマンス分析**
   - 各エージェントの実行時間を記録
   - ボトルネックの特定が可能

4. **拡張性**
   - イベントベースの設計により、カスタムハンドラーの追加が容易
   - 様々な表示形式への対応が可能

## 使用方法

### 基本的な使用

```typescript
import { AgentMonitor, AgentExecutionState } from './agent-monitor';

// モニターのインスタンスを取得（シングルトン）
const monitor = AgentMonitor.getInstance({
  updateInterval: 500,
  showDetails: true,
  colorize: true,
  groupByParent: true
});

// モニタリングを開始
monitor.startMonitoring();

// エージェントを登録
monitor.registerAgent({
  agentId: 'agent-1',
  agentType: 'worker',
  agentName: 'Worker Agent',
  taskId: 'task-1',
  taskDescription: 'データ処理',
  state: AgentExecutionState.IDLE
});

// 状態を更新
monitor.updateAgentState('agent-1', AgentExecutionState.EXECUTING);

// 進捗を更新
monitor.updateAgentProgress('agent-1', 5, 10, 'ファイル5/10を処理中');

// ツール使用を記録
monitor.recordToolUsage('agent-1', 'read_file');

// 完了
monitor.updateAgentState('agent-1', AgentExecutionState.COMPLETED);

// モニタリングを停止
monitor.stopMonitoring();
```

### イベントリスナー

```typescript
// エージェント登録時
monitor.on('agent-registered', (agent) => {
  console.log(`新しいエージェント: ${agent.agentName}`);
});

// 状態変更時
monitor.on('agent-state-changed', ({ agentId, previousState, newState }) => {
  console.log(`${agentId}: ${previousState} → ${newState}`);
});

// 進捗更新時
monitor.on('agent-progress-updated', ({ agentId, progress }) => {
  console.log(`${agentId}: ${progress.percentage}%`);
});
```

## テスト

`packages/agents/src/__tests__/agent-monitor.test.ts`にテストスイートを実装しました。

以下のテストケースをカバー：
- シングルトンパターンの動作
- エージェントの登録と削除
- 親子関係の管理
- 状態遷移
- 進捗管理
- ツール使用記録
- 実行履歴
- イベント発火

## 今後の改善案

1. **Web UI対応**
   - WebSocketを使用したリアルタイム更新
   - ブラウザベースのダッシュボード

2. **ログ永続化**
   - 実行履歴のファイル保存
   - 統計情報の集計

3. **アラート機能**
   - エラー発生時の通知
   - 長時間実行タスクの警告

4. **パフォーマンス最適化**
   - 大量のエージェント処理時の最適化
   - メモリ使用量の削減
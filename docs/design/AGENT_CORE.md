# エージェントコア設計書

## 概要

本設計書は、@akiojin/agentsの中核となるエージェントコアの設計を定義します。Gemini CLIのReActループアーキテクチャを参考に、高度な自律性と並列処理能力を実現します。

## 設計原則

1. **自律性**: 最小限の人間の介入で複雑なタスクを完遂
2. **観察可能性**: 思考過程と実行状態の完全な可視化
3. **回復力**: エラーからの自動回復とグレースフルデグレード
4. **並列性**: 独立したタスクの同時実行による高速化
5. **拡張性**: 新しい能力の追加が容易なプラグインアーキテクチャ

## コアアーキテクチャ

### ReActパターンの実装

```
┌─────────────────────────────────────────┐
│              User Task                   │
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│           Task Analyzer                  │
│     (タスクの理解と計画立案)            │
└────────────────┬────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│           ReAct Loop                     │
│  ┌─────────────────────────────────┐   │
│  │  1. Reason (推論)                │   │
│  │     ↓                           │   │
│  │  2. Act (行動)                   │   │
│  │     ↓                           │   │
│  │  3. Observe (観察)               │   │
│  │     ↓                           │   │
│  │  4. Reflect (振り返り)          │   │
│  │     ↓                           │   │
│  │  [完了判定] → 未完了なら1へ     │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
                 ▼
┌─────────────────────────────────────────┐
│           Result Synthesis               │
│         (結果の統合と報告)              │
└─────────────────────────────────────────┘
```

## エージェントコアクラス設計

### 1. メインエージェントクラス

```typescript
// エージェントの設定
interface AgentConfig {
  maxIterations: number;        // 最大反復回数
  timeout: number;              // タイムアウト（ミリ秒）
  parallelTasks: number;        // 並列実行可能タスク数
  memoryProvider: MemoryProvider; // メモリプロバイダー（Serena）
  llmProvider: LLMProvider;    // LLMプロバイダー
  mcpManager: MCPManager;       // MCPマネージャー
  debugMode: boolean;           // デバッグモード
}

// エージェントコアクラス
class AgentCore {
  private state: AgentState;
  private history: ExecutionHistory;
  private taskQueue: TaskQueue;
  private memoryManager: MemoryManager;
  
  constructor(private config: AgentConfig) {
    this.state = new AgentState();
    this.history = new ExecutionHistory();
    this.taskQueue = new TaskQueue(config.parallelTasks);
    this.memoryManager = new MemoryManager(config.memoryProvider);
  }
  
  // メインエントリーポイント
  async execute(userTask: string): Promise<ExecutionResult> {
    // タスクの初期化
    const task = await this.analyzeTask(userTask);
    this.state.setCurrentTask(task);
    
    // ReActループの実行
    const result = await this.runReActLoop(task);
    
    // 結果の合成と返却
    return this.synthesizeResult(result);
  }
  
  // ReActループ
  private async runReActLoop(task: Task): Promise<LoopResult> {
    let iteration = 0;
    const startTime = Date.now();
    
    while (!this.isComplete(task) && iteration < this.config.maxIterations) {
      // タイムアウトチェック
      if (Date.now() - startTime > this.config.timeout) {
        throw new AgentError('TIMEOUT', 'Task execution timeout');
      }
      
      // ReActステップの実行
      const step = await this.executeReActStep(task, iteration);
      this.history.addStep(step);
      
      // 状態の更新
      await this.updateState(step);
      
      iteration++;
    }
    
    return {
      task,
      steps: this.history.getSteps(),
      success: this.isComplete(task)
    };
  }
}
```

### 2. ReActステップ実装

```typescript
// ReActステップの定義
interface ReActStep {
  iteration: number;
  thought: Thought;
  action: Action;
  observation: Observation;
  reflection: Reflection;
  timestamp: Date;
  metadata: StepMetadata;
}

// 思考プロセス
interface Thought {
  reasoning: string;           // 推論内容
  plan: string[];              // 実行計画
  confidence: number;          // 確信度（0-1）
  alternatives: string[];      // 代替案
}

// アクション
interface Action {
  type: ActionType;
  tool: string;                // 使用するMCPツール
  params: any;                 // パラメータ
  parallel?: Action[];         // 並列実行するアクション
}

// 観察結果
interface Observation {
  success: boolean;
  result: any;
  error?: Error;
  sideEffects: SideEffect[];  // 副作用の記録
}

// 振り返り
interface Reflection {
  progress: number;            // 進捗率（0-1）
  learnings: string[];         // 学習事項
  adjustments: string[];       // 計画の調整
  nextSteps: string[];         // 次のステップ
}

class ReActExecutor {
  // ReActステップの実行
  async executeStep(
    task: Task,
    iteration: number,
    context: ExecutionContext
  ): Promise<ReActStep> {
    // 1. 推論フェーズ
    const thought = await this.reason(task, context);
    
    // 2. 行動決定フェーズ
    const action = await this.decideAction(thought, context);
    
    // 3. 実行フェーズ
    const observation = await this.act(action, context);
    
    // 4. 振り返りフェーズ
    const reflection = await this.reflect(thought, action, observation, context);
    
    return {
      iteration,
      thought,
      action,
      observation,
      reflection,
      timestamp: new Date(),
      metadata: this.collectMetadata(context)
    };
  }
  
  // 推論フェーズ
  private async reason(task: Task, context: ExecutionContext): Promise<Thought> {
    // コンテキストの収集
    const relevantContext = await this.gatherContext(task, context);
    
    // LLMによる推論
    const prompt = this.buildReasoningPrompt(task, relevantContext);
    const response = await context.llm.complete(prompt);
    
    return this.parseThought(response);
  }
  
  // アクション決定
  private async decideAction(thought: Thought, context: ExecutionContext): Promise<Action> {
    // 利用可能なツールの取得
    const availableTools = await context.mcp.listTools();
    
    // 最適なアクションの選択
    const prompt = this.buildActionPrompt(thought, availableTools);
    const response = await context.llm.complete(prompt);
    
    const action = this.parseAction(response);
    
    // 並列実行可能なアクションの識別
    if (this.canParallelize(action)) {
      action.parallel = await this.identifyParallelActions(thought, context);
    }
    
    return action;
  }
  
  // アクション実行
  private async act(action: Action, context: ExecutionContext): Promise<Observation> {
    try {
      // 並列アクションがある場合
      if (action.parallel && action.parallel.length > 0) {
        const results = await this.executeParallel([action, ...action.parallel], context);
        return this.mergeObservations(results);
      }
      
      // 単一アクションの実行
      const result = await context.mcp.executeTool(action.tool, action.params);
      
      return {
        success: result.success,
        result: result.data,
        error: result.error,
        sideEffects: this.detectSideEffects(action, result)
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: error as Error,
        sideEffects: []
      };
    }
  }
  
  // 振り返り
  private async reflect(
    thought: Thought,
    action: Action,
    observation: Observation,
    context: ExecutionContext
  ): Promise<Reflection> {
    const prompt = this.buildReflectionPrompt(thought, action, observation);
    const response = await context.llm.complete(prompt);
    
    return this.parseReflection(response);
  }
}
```

### 3. タスク管理とステートマシン

```typescript
// タスクの状態
enum TaskState {
  PENDING = 'PENDING',
  ANALYZING = 'ANALYZING',
  PLANNING = 'PLANNING',
  EXECUTING = 'EXECUTING',
  VALIDATING = 'VALIDATING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

// タスククラス
class Task {
  id: string;
  description: string;
  state: TaskState;
  subtasks: Task[];
  dependencies: string[];  // 他タスクへの依存
  priority: number;
  context: TaskContext;
  result?: any;
  error?: Error;
  
  constructor(description: string) {
    this.id = generateId();
    this.description = description;
    this.state = TaskState.PENDING;
    this.subtasks = [];
    this.dependencies = [];
    this.priority = 0;
    this.context = new TaskContext();
  }
  
  // ステート遷移
  transition(newState: TaskState): void {
    if (!this.canTransition(this.state, newState)) {
      throw new Error(`Invalid state transition: ${this.state} -> ${newState}`);
    }
    this.state = newState;
  }
  
  // サブタスクへの分解
  decompose(subtasks: string[]): void {
    this.subtasks = subtasks.map(desc => new Task(desc));
  }
  
  // 完了判定
  isComplete(): boolean {
    return this.state === TaskState.COMPLETED ||
           (this.subtasks.length > 0 && this.subtasks.every(t => t.isComplete()));
  }
}

// ステートマシン
class StateMachine {
  private transitions: Map<string, Set<string>>;
  
  constructor() {
    this.transitions = new Map([
      [TaskState.PENDING, new Set([TaskState.ANALYZING, TaskState.CANCELLED])],
      [TaskState.ANALYZING, new Set([TaskState.PLANNING, TaskState.FAILED])],
      [TaskState.PLANNING, new Set([TaskState.EXECUTING, TaskState.FAILED])],
      [TaskState.EXECUTING, new Set([TaskState.VALIDATING, TaskState.FAILED])],
      [TaskState.VALIDATING, new Set([TaskState.COMPLETED, TaskState.EXECUTING, TaskState.FAILED])],
      [TaskState.COMPLETED, new Set()],
      [TaskState.FAILED, new Set([TaskState.ANALYZING])], // リトライ可能
      [TaskState.CANCELLED, new Set()]
    ]);
  }
  
  canTransition(from: TaskState, to: TaskState): boolean {
    return this.transitions.get(from)?.has(to) ?? false;
  }
  
  // 状態遷移の実行
  async transition(task: Task, newState: TaskState, context: ExecutionContext): Promise<void> {
    const oldState = task.state;
    task.transition(newState);
    
    // 状態遷移時のフック
    await this.onTransition(task, oldState, newState, context);
  }
  
  private async onTransition(
    task: Task,
    from: TaskState,
    to: TaskState,
    context: ExecutionContext
  ): Promise<void> {
    // ログ記録
    context.logger.info(`Task ${task.id} transitioned: ${from} -> ${to}`);
    
    // 状態別の処理
    switch (to) {
      case TaskState.ANALYZING:
        await this.onAnalyzing(task, context);
        break;
      case TaskState.PLANNING:
        await this.onPlanning(task, context);
        break;
      case TaskState.EXECUTING:
        await this.onExecuting(task, context);
        break;
      case TaskState.COMPLETED:
        await this.onCompleted(task, context);
        break;
      case TaskState.FAILED:
        await this.onFailed(task, context);
        break;
    }
  }
}
```

### 4. 並列タスク処理

```typescript
// タスクキュー
class TaskQueue {
  private queue: PriorityQueue<Task>;
  private executing: Map<string, Task>;
  private completed: Map<string, Task>;
  private dependencyGraph: DependencyGraph;
  
  constructor(private maxParallel: number) {
    this.queue = new PriorityQueue((a, b) => b.priority - a.priority);
    this.executing = new Map();
    this.completed = new Map();
    this.dependencyGraph = new DependencyGraph();
  }
  
  // タスクの追加
  enqueue(task: Task): void {
    this.queue.push(task);
    this.dependencyGraph.addNode(task.id, task.dependencies);
  }
  
  // 並列実行
  async processQueue(executor: TaskExecutor): Promise<void> {
    while (this.queue.size() > 0 || this.executing.size > 0) {
      // 実行可能なタスクを取得
      const executableTasks = this.getExecutableTasks();
      
      // 並列実行
      const promises = executableTasks.map(task => 
        this.executeTask(task, executor)
      );
      
      // 完了を待つ
      await Promise.race(promises);
    }
  }
  
  // 実行可能なタスクの取得
  private getExecutableTasks(): Task[] {
    const tasks: Task[] = [];
    const availableSlots = this.maxParallel - this.executing.size;
    
    while (tasks.length < availableSlots && this.queue.size() > 0) {
      const task = this.queue.peek();
      
      // 依存関係チェック
      if (this.canExecute(task)) {
        tasks.push(this.queue.pop()!);
      } else {
        break; // 依存関係が解決されていない
      }
    }
    
    return tasks;
  }
  
  // タスク実行可能性チェック
  private canExecute(task: Task): boolean {
    return task.dependencies.every(dep => this.completed.has(dep));
  }
  
  // タスクの実行
  private async executeTask(task: Task, executor: TaskExecutor): Promise<void> {
    this.executing.set(task.id, task);
    
    try {
      const result = await executor.execute(task);
      task.result = result;
      task.state = TaskState.COMPLETED;
      this.completed.set(task.id, task);
    } catch (error) {
      task.error = error as Error;
      task.state = TaskState.FAILED;
      
      // リトライロジック
      if (this.shouldRetry(task)) {
        task.state = TaskState.PENDING;
        this.queue.push(task);
      }
    } finally {
      this.executing.delete(task.id);
    }
  }
}

// 依存関係グラフ
class DependencyGraph {
  private graph: Map<string, Set<string>>;
  
  constructor() {
    this.graph = new Map();
  }
  
  addNode(node: string, dependencies: string[]): void {
    this.graph.set(node, new Set(dependencies));
  }
  
  // トポロジカルソート
  topologicalSort(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    
    const visit = (node: string) => {
      if (visited.has(node)) return;
      visited.add(node);
      
      const deps = this.graph.get(node) || new Set();
      for (const dep of deps) {
        visit(dep);
      }
      
      result.push(node);
    };
    
    for (const node of this.graph.keys()) {
      visit(node);
    }
    
    return result;
  }
  
  // 循環依存の検出
  hasCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const hasCycleDFS = (node: string): boolean => {
      visited.add(node);
      recursionStack.add(node);
      
      const deps = this.graph.get(node) || new Set();
      for (const dep of deps) {
        if (!visited.has(dep)) {
          if (hasCycleDFS(dep)) return true;
        } else if (recursionStack.has(dep)) {
          return true;
        }
      }
      
      recursionStack.delete(node);
      return false;
    };
    
    for (const node of this.graph.keys()) {
      if (!visited.has(node)) {
        if (hasCycleDFS(node)) return true;
      }
    }
    
    return false;
  }
}
```

### 5. メモリ管理（Serena統合）

```typescript
// メモリマネージャー
class MemoryManager {
  private shortTermMemory: ShortTermMemory;
  private longTermMemory: LongTermMemory;
  private workingMemory: WorkingMemory;
  private serena: SerenaMCPTool;
  
  constructor(serena: SerenaMCPTool) {
    this.serena = serena;
    this.shortTermMemory = new ShortTermMemory();
    this.longTermMemory = new LongTermMemory(serena);
    this.workingMemory = new WorkingMemory();
  }
  
  // コンテキストの取得
  async getRelevantContext(task: Task): Promise<Context> {
    // Serenaからプロジェクト情報を取得
    const projectContext = await this.serena.methods.readMemory('project_context');
    
    // タスクに関連するシンボルを検索
    const relevantSymbols = await this.serena.methods.findSymbol({
      name: this.extractKeywords(task.description),
      includeBody: false
    });
    
    // 参照関係の取得
    const references = await Promise.all(
      relevantSymbols.map(s => 
        this.serena.methods.findReferencingSymbols(s.name)
      )
    );
    
    // ワーキングメモリの更新
    this.workingMemory.update({
      task: task.description,
      symbols: relevantSymbols,
      references: references.flat(),
      projectContext
    });
    
    return this.workingMemory.getContext();
  }
  
  // 学習内容の保存
  async saveLearnedKnowledge(step: ReActStep): Promise<void> {
    // 短期記憶に保存
    this.shortTermMemory.add(step);
    
    // 重要な学習は長期記憶へ
    if (this.isImportantLearning(step)) {
      await this.longTermMemory.store(step);
      
      // Serenaのプロジェクトメモリにも保存
      await this.serena.methods.writeMemory(
        `learning_${step.iteration}`,
        {
          thought: step.thought,
          reflection: step.reflection,
          timestamp: step.timestamp
        }
      );
    }
  }
  
  // エピソード記憶の形成
  async formEpisodicMemory(task: Task, steps: ReActStep[]): Promise<void> {
    const episode = {
      task: task.description,
      steps: steps.map(s => ({
        thought: s.thought.reasoning,
        action: s.action.type,
        result: s.observation.success,
        learning: s.reflection.learnings
      })),
      outcome: task.state === TaskState.COMPLETED ? 'success' : 'failure',
      timestamp: new Date()
    };
    
    await this.serena.methods.writeMemory(`episode_${task.id}`, episode);
  }
}

// 短期記憶
class ShortTermMemory {
  private buffer: CircularBuffer<ReActStep>;
  private capacity = 100;
  
  constructor() {
    this.buffer = new CircularBuffer(this.capacity);
  }
  
  add(step: ReActStep): void {
    this.buffer.push(step);
  }
  
  getRecent(n: number): ReActStep[] {
    return this.buffer.toArray().slice(-n);
  }
}

// 長期記憶
class LongTermMemory {
  constructor(private serena: SerenaMCPTool) {}
  
  async store(step: ReActStep): Promise<void> {
    // パターンの抽出
    const pattern = this.extractPattern(step);
    
    // 既存パターンとの照合
    const existingPatterns = await this.serena.methods.readMemory('patterns') || [];
    
    // 新規パターンの場合は保存
    if (!this.patternExists(pattern, existingPatterns)) {
      existingPatterns.push(pattern);
      await this.serena.methods.writeMemory('patterns', existingPatterns);
    }
  }
  
  async retrieve(query: string): Promise<any[]> {
    const patterns = await this.serena.methods.readMemory('patterns') || [];
    return this.findSimilarPatterns(query, patterns);
  }
}
```

### 6. エラーハンドリングと回復

```typescript
// エラー分類
enum ErrorType {
  RECOVERABLE = 'RECOVERABLE',      // 回復可能
  PARTIAL = 'PARTIAL',              // 部分的に回復可能
  FATAL = 'FATAL'                   // 致命的
}

// エラーハンドラー
class ErrorHandler {
  private strategies: Map<string, RecoveryStrategy>;
  
  constructor() {
    this.strategies = new Map([
      ['TOOL_NOT_FOUND', new ToolNotFoundStrategy()],
      ['EXECUTION_FAILED', new ExecutionFailedStrategy()],
      ['TIMEOUT', new TimeoutStrategy()],
      ['DEPENDENCY_FAILED', new DependencyFailedStrategy()],
      ['SYNTAX_ERROR', new SyntaxErrorStrategy()],
      ['SEMANTIC_ERROR', new SemanticErrorStrategy()]
    ]);
  }
  
  // エラーの処理
  async handle(error: AgentError, context: ExecutionContext): Promise<RecoveryResult> {
    // エラーの分類
    const errorType = this.classifyError(error);
    
    // 回復戦略の選択
    const strategy = this.strategies.get(error.code) || new DefaultStrategy();
    
    // 回復の試行
    const result = await strategy.recover(error, context);
    
    // ログ記録
    context.logger.error('Error occurred', {
      error: error.message,
      type: errorType,
      recovered: result.success
    });
    
    return result;
  }
  
  // エラーの分類
  private classifyError(error: AgentError): ErrorType {
    if (this.isRecoverable(error)) {
      return ErrorType.RECOVERABLE;
    } else if (this.isPartiallyRecoverable(error)) {
      return ErrorType.PARTIAL;
    } else {
      return ErrorType.FATAL;
    }
  }
}

// 回復戦略インターフェース
interface RecoveryStrategy {
  recover(error: AgentError, context: ExecutionContext): Promise<RecoveryResult>;
}

// 実行失敗の回復戦略
class ExecutionFailedStrategy implements RecoveryStrategy {
  async recover(error: AgentError, context: ExecutionContext): Promise<RecoveryResult> {
    // エラーの詳細分析
    const analysis = await this.analyzeError(error, context);
    
    // 代替アプローチの生成
    if (analysis.hasAlternative) {
      const alternativeAction = await this.generateAlternative(analysis, context);
      
      // 代替アプローチの実行
      try {
        const result = await context.mcp.executeTool(
          alternativeAction.tool,
          alternativeAction.params
        );
        
        return {
          success: true,
          action: alternativeAction,
          result
        };
      } catch (retryError) {
        // 代替も失敗
        return {
          success: false,
          error: retryError
        };
      }
    }
    
    // 部分的な成功を試みる
    return this.attemptPartialRecovery(error, context);
  }
  
  private async analyzeError(
    error: AgentError,
    context: ExecutionContext
  ): Promise<ErrorAnalysis> {
    // LLMによるエラー分析
    const prompt = `
      エラーが発生しました: ${error.message}
      詳細: ${JSON.stringify(error.details)}
      
      このエラーの原因と代替アプローチを分析してください。
    `;
    
    const response = await context.llm.complete(prompt);
    return this.parseAnalysis(response);
  }
}
```

## プロンプトエンジニアリング

### 1. システムプロンプト

```typescript
const SYSTEM_PROMPT = `
あなたは高度な自律型コーディングエージェントです。
ReAct（Reasoning and Acting）パターンに従って、与えられたタスクを完遂してください。

## 基本原則
1. 各ステップで明確な推論を行う
2. 実行前に計画を立てる
3. 結果を観察し、必要に応じて計画を調整する
4. エラーから学習し、回復する
5. 並列実行可能なタスクは同時に実行する

## 利用可能なツール
{available_tools}

## 現在のコンテキスト
{context}

## タスク
{task_description}

## 出力形式
思考と行動を構造化された形式で出力してください：

THOUGHT:
- 現在の状況の理解
- 次に取るべき行動の推論
- 代替案の検討

ACTION:
- ツール: [使用するツール名]
- パラメータ: [パラメータのJSON]
- 並列実行: [同時実行可能なアクションのリスト]

期待される結果:
- 成功時の状態
- 失敗時の対処法
`;
```

### 2. 推論プロンプト

```typescript
const REASONING_PROMPT = `
現在のタスク: {task}

これまでの実行履歴:
{history}

現在の状態:
{current_state}

次のステップを推論してください：
1. 現在の進捗状況は？
2. 目標達成に必要な残りの作業は？
3. 次に実行すべきアクションは？
4. そのアクションを選ぶ理由は？
5. 予想される結果と成功確率は？
`;
```

### 3. 振り返りプロンプト

```typescript
const REFLECTION_PROMPT = `
実行したアクション: {action}
結果: {observation}

以下の観点で振り返りを行ってください：

1. 進捗評価
- タスク全体の何％が完了したか？
- 期待通りの結果が得られたか？

2. 学習事項
- このステップから学んだことは？
- 次回同様のタスクで活用できる知見は？

3. 計画の調整
- 当初の計画を修正する必要があるか？
- より効率的なアプローチはあるか？

4. 次のステップ
- 次に実行すべきアクションは？
- 並列実行できるタスクはあるか？
`;
```

## パフォーマンス最適化

### 1. コンテキスト最適化

```typescript
class ContextOptimizer {
  private cache: LRUCache<string, Context>;
  private compressionRatio = 0.3;
  
  // コンテキストの圧縮
  async compress(context: Context): Promise<CompressedContext> {
    // 重要度によるフィルタリング
    const important = this.filterImportant(context);
    
    // 冗長性の除去
    const deduplicated = this.removeDuplication(important);
    
    // 要約
    const summarized = await this.summarize(deduplicated);
    
    return {
      original: context,
      compressed: summarized,
      ratio: this.calculateRatio(context, summarized)
    };
  }
  
  // 動的コンテキスト管理
  async getDynamicContext(task: Task, maxTokens: number): Promise<Context> {
    // タスクに最も関連する情報を優先
    const relevance = await this.calculateRelevance(task);
    
    // トークン制限内でコンテキストを構築
    return this.buildOptimalContext(relevance, maxTokens);
  }
}
```

### 2. 実行最適化

```typescript
class ExecutionOptimizer {
  // バッチ処理の最適化
  optimizeBatch(tasks: Task[]): TaskBatch[] {
    // 依存関係の分析
    const graph = this.buildDependencyGraph(tasks);
    
    // 並列実行可能なグループの識別
    const layers = graph.topologicalLayers();
    
    // 各レイヤーをバッチ化
    return layers.map(layer => new TaskBatch(layer));
  }
  
  // キャッシュ戦略
  async executeWithCache(
    action: Action,
    context: ExecutionContext
  ): Promise<Observation> {
    const cacheKey = this.generateCacheKey(action);
    
    // キャッシュチェック
    const cached = await this.cache.get(cacheKey);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }
    
    // 実行とキャッシュ
    const result = await this.execute(action, context);
    await this.cache.set(cacheKey, result);
    
    return result;
  }
}
```

## モニタリングとデバッグ

### 1. 実行トレース

```typescript
class ExecutionTracer {
  private traces: Trace[] = [];
  
  // トレースの記録
  trace(event: TraceEvent): void {
    this.traces.push({
      timestamp: Date.now(),
      event,
      stack: this.captureStack(),
      context: this.captureContext()
    });
  }
  
  // 実行パスの可視化
  visualize(): string {
    return this.traces.map(t => 
      `[${t.timestamp}] ${t.event.type}: ${t.event.description}`
    ).join('\n');
  }
  
  // パフォーマンス分析
  analyzePerformance(): PerformanceReport {
    return {
      totalDuration: this.calculateTotalDuration(),
      bottlenecks: this.identifyBottlenecks(),
      parallelEfficiency: this.calculateParallelEfficiency()
    };
  }
}
```

### 2. デバッグモード

```typescript
class DebugManager {
  private debugLevel: DebugLevel;
  private breakpoints: Set<string>;
  
  // ブレークポイント設定
  setBreakpoint(location: string): void {
    this.breakpoints.add(location);
  }
  
  // ステップ実行
  async stepThrough(step: ReActStep): Promise<void> {
    if (this.shouldBreak(step)) {
      await this.pause(step);
      await this.waitForContinue();
    }
  }
  
  // 状態のダンプ
  dumpState(context: ExecutionContext): StateSnapshot {
    return {
      memory: context.memory.snapshot(),
      queue: context.queue.snapshot(),
      variables: context.variables.snapshot(),
      timestamp: Date.now()
    };
  }
}
```

## テスト設計

### 1. ユニットテスト

```typescript
describe('AgentCore', () => {
  describe('ReAct Loop', () => {
    it('should complete simple task', async () => {
      const agent = new AgentCore(mockConfig);
      const result = await agent.execute('Create a hello world file');
      
      expect(result.success).toBe(true);
      expect(result.steps.length).toBeGreaterThan(0);
      expect(result.files).toContain('hello.txt');
    });
    
    it('should handle errors gracefully', async () => {
      const agent = new AgentCore(mockConfig);
      mockMCP.executeTool.mockRejectedValue(new Error('Tool failed'));
      
      const result = await agent.execute('Invalid task');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.recovery).toBeDefined();
    });
  });
});
```

### 2. 統合テスト

```typescript
describe('Agent Integration', () => {
  it('should build complete application', async () => {
    const agent = new AgentCore(realConfig);
    
    const result = await agent.execute(`
      Todoアプリケーションを作成してください。
      - React フロントエンド
      - Express バックエンド
      - SQLiteデータベース
    `);
    
    expect(result.success).toBe(true);
    expect(fs.existsSync('frontend/src/App.tsx')).toBe(true);
    expect(fs.existsSync('backend/server.js')).toBe(true);
    expect(fs.existsSync('database.sqlite')).toBe(true);
  });
});
```
# CLI インターフェース設計書

## 概要

本設計書は、@akiojin/agentsのコマンドラインインターフェース（CLI）の設計を定義します。Gemini CLIの使いやすさを参考に、直感的で強力なインターフェースを提供します。

## 設計原則

1. **直感性**: 初心者でも簡単に使い始められる
2. **柔軟性**: 上級者向けの詳細な制御オプション
3. **視認性**: 実行状態とプログレスの明確な表示
4. **拡張性**: カスタムコマンドとプラグインのサポート
5. **互換性**: 標準的なCLI慣習に従う

## アーキテクチャ

### CLIレイヤー構成

```
┌──────────────────────────────────────┐
│          User Input                   │
└─────────────┬────────────────────────┘
              │
┌─────────────▼────────────────────────┐
│       Command Parser                  │
│    (Commander.js / Yargs)            │
└─────────────┬────────────────────────┘
              │
┌─────────────▼────────────────────────┐
│      CLI Controller                   │
├──────────────────────────────────────┤
│  - Mode Manager                       │
│  - Input Handler                      │
│  - Output Formatter                   │
└─────────────┬────────────────────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
┌───▼──┐ ┌───▼──┐ ┌───▼───┐
│ REPL │ │Batch │ │Config │
│ Mode │ │ Mode │ │Manager│
└──────┘ └──────┘ └───────┘
              │
┌─────────────▼────────────────────────┐
│         Agent Core                    │
└──────────────────────────────────────┘
```

## コマンドラインインターフェース

### 1. 基本コマンド構造

```bash
# 基本的な使用方法
@akiojin/agents [options] [command]

# インタラクティブモード（デフォルト）
@akiojin/agents

# バッチモード
@akiojin/agents --task "タスク内容"

# 設定ファイル指定
@akiojin/agents --config ./agents.config.json

# ヘルプ表示
@akiojin/agents --help
```

### 2. グローバルオプション

```typescript
interface GlobalOptions {
  // 基本オプション
  '--help, -h': boolean; // ヘルプ表示
  '--version, -v': boolean; // バージョン表示
  '--config, -c': string; // 設定ファイルパス
  '--verbose': boolean; // 詳細出力
  '--quiet, -q': boolean; // 最小限の出力
  '--debug': boolean; // デバッグモード

  // LLMプロバイダー設定
  '--provider, -p': string; // LLMプロバイダー
  '--model, -m': string; // モデル名
  '--api-key': string; // APIキー（環境変数推奨）

  // 実行制御
  '--parallel': number; // 並列実行タスク数
  '--timeout': number; // タイムアウト（秒）
  '--max-iterations': number; // 最大反復回数

  // 出力設定
  '--output, -o': string; // 出力形式 (json|text|markdown)
  '--log-file': string; // ログファイルパス
  '--no-color': boolean; // カラー出力無効化
}
```

### 3. サブコマンド

```typescript
interface Commands {
  // タスク実行
  'run <task>': {
    description: 'タスクを実行';
    options: {
      '--plan-only': boolean; // 計画のみ表示
      '--confirm': boolean; // 実行前確認
      '--dry-run': boolean; // ドライラン
    };
  };

  // プロジェクト管理
  init: {
    description: 'プロジェクトを初期化';
    options: {
      '--template': string; // テンプレート名
      '--force': boolean; // 既存ファイルを上書き
    };
  };

  // MCP管理
  mcp: {
    subcommands: {
      list: 'MCPツール一覧表示';
      'add <server>': 'MCPサーバー追加';
      'remove <server>': 'MCPサーバー削除';
      'test <tool>': 'ツールのテスト実行';
    };
  };

  // メモリ管理
  memory: {
    subcommands: {
      show: '現在のメモリ内容表示';
      clear: 'メモリクリア';
      'export <file>': 'メモリエクスポート';
      'import <file>': 'メモリインポート';
    };
  };

  // 設定管理
  config: {
    subcommands: {
      'get <key>': '設定値取得';
      'set <key> <value>': '設定値設定';
      list: '全設定表示';
      reset: 'デフォルトに戻す';
    };
  };
}
```

## インタラクティブモード（REPL）

### 1. REPLインターフェース

```typescript
class REPLInterface {
  private readline: ReadLine;
  private history: CommandHistory;
  private context: REPLContext;
  private completer: AutoCompleter;

  async start(): Promise<void> {
    console.log(chalk.cyan('🤖 @akiojin/agents へようこそ！'));
    console.log(chalk.gray('ヘルプは /help、終了は /exit または Ctrl+C'));

    this.readline = createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('> '),
      completer: this.completer.complete.bind(this.completer),
    });

    this.readline.on('line', this.handleInput.bind(this));
    this.readline.on('SIGINT', this.handleInterrupt.bind(this));

    this.readline.prompt();
  }

  private async handleInput(input: string): Promise<void> {
    // 空行の処理
    if (!input.trim()) {
      this.readline.prompt();
      return;
    }

    // コマンドの処理
    if (input.startsWith('/')) {
      await this.handleCommand(input);
    } else {
      await this.handleTask(input);
    }

    this.readline.prompt();
  }
}
```

### 2. スラッシュコマンド

```typescript
interface SlashCommands {
  '/help': 'ヘルプ表示';
  '/exit': '終了';
  '/clear': '画面クリア';
  '/history': 'コマンド履歴表示';
  '/save <file>': 'セッション保存';
  '/load <file>': 'セッション読み込み';

  // エージェント制御
  '/plan': '現在の計画を表示';
  '/stop': '実行中のタスクを停止';
  '/pause': '実行を一時停止';
  '/resume': '実行を再開';
  '/retry': '最後のタスクをリトライ';

  // MCP制御
  '/tools': '利用可能なツール表示';
  '/mcp <command>': 'MCPコマンド実行';

  // メモリ制御
  '/memory': 'メモリ状態表示';
  '/forget': '短期記憶クリア';
  '/remember <key>': '特定の記憶を参照';

  // デバッグ
  '/debug': 'デバッグモード切り替え';
  '/trace': '実行トレース表示';
  '/stats': '統計情報表示';
}
```

### 3. 自動補完

```typescript
class AutoCompleter {
  private commands: string[];
  private tools: string[];
  private files: string[];

  complete(line: string): [string[], string] {
    const completions: string[] = [];

    // スラッシュコマンドの補完
    if (line.startsWith('/')) {
      completions.push(...this.completeCommand(line));
    }
    // ファイルパスの補完
    else if (this.isFilePath(line)) {
      completions.push(...this.completeFilePath(line));
    }
    // ツール名の補完
    else if (this.isToolReference(line)) {
      completions.push(...this.completeToolName(line));
    }
    // 一般的なタスクの補完
    else {
      completions.push(...this.suggestTasks(line));
    }

    return [completions, line];
  }

  private suggestTasks(partial: string): string[] {
    const suggestions = [
      'Todoアプリを作成',
      'RESTful APIを実装',
      'テストを作成',
      'リファクタリング',
      'ドキュメントを生成',
      'バグを修正',
      'パフォーマンスを最適化',
    ];

    return suggestions.filter((s) => s.toLowerCase().includes(partial.toLowerCase()));
  }
}
```

## 出力フォーマット

### 1. プログレス表示

```typescript
class ProgressDisplay {
  private spinner: Ora;
  private progressBar: ProgressBar;

  // タスク実行中の表示
  showTaskProgress(task: Task): void {
    console.log(chalk.bold.blue(`\n📋 タスク: ${task.description}\n`));

    this.progressBar = new ProgressBar('  進捗 [:bar] :percent :etas', {
      complete: '█',
      incomplete: '░',
      width: 40,
      total: 100,
    });
  }

  // ステップ表示
  showStep(step: ReActStep): void {
    // 思考の表示
    console.log(chalk.yellow('\n💭 思考:'));
    console.log(chalk.gray(`  ${step.thought.reasoning}`));

    // アクションの表示
    console.log(chalk.cyan('\n🎯 アクション:'));
    console.log(chalk.gray(`  ツール: ${step.action.tool}`));
    console.log(chalk.gray(`  パラメータ: ${JSON.stringify(step.action.params, null, 2)}`));

    // 結果の表示
    if (step.observation.success) {
      console.log(chalk.green('\n✅ 成功'));
    } else {
      console.log(chalk.red('\n❌ 失敗'));
      console.log(chalk.red(`  エラー: ${step.observation.error?.message}`));
    }
  }

  // 並列実行の表示
  showParallelExecution(tasks: Task[]): void {
    console.log(chalk.magenta('\n⚡ 並列実行:'));
    tasks.forEach((task, i) => {
      this.spinner = ora({
        text: `  [${i + 1}] ${task.description}`,
        prefixText: '  ',
      }).start();
    });
  }
}
```

### 2. 結果フォーマット

```typescript
class OutputFormatter {
  format(result: ExecutionResult, format: OutputFormat): string {
    switch (format) {
      case 'json':
        return this.formatJSON(result);
      case 'markdown':
        return this.formatMarkdown(result);
      case 'text':
      default:
        return this.formatText(result);
    }
  }

  private formatText(result: ExecutionResult): string {
    const output: string[] = [];

    output.push(chalk.bold('\n📊 実行結果\n'));
    output.push('─'.repeat(50));

    // サマリー
    output.push(chalk.bold('\n概要:'));
    output.push(`  状態: ${result.success ? chalk.green('成功') : chalk.red('失敗')}`);
    output.push(`  実行時間: ${result.duration}ms`);
    output.push(`  ステップ数: ${result.steps.length}`);

    // ファイル操作
    if (result.files.created.length > 0) {
      output.push(chalk.bold('\n作成されたファイル:'));
      result.files.created.forEach((f) => output.push(chalk.green(`  ✨ ${f}`)));
    }

    if (result.files.modified.length > 0) {
      output.push(chalk.bold('\n変更されたファイル:'));
      result.files.modified.forEach((f) => output.push(chalk.yellow(`  ✏️  ${f}`)));
    }

    // エラー
    if (result.errors.length > 0) {
      output.push(chalk.bold.red('\nエラー:'));
      result.errors.forEach((e) => output.push(chalk.red(`  ⚠️  ${e.message}`)));
    }

    // 学習内容
    if (result.learnings.length > 0) {
      output.push(chalk.bold('\n学習内容:'));
      result.learnings.forEach((l) => output.push(chalk.cyan(`  💡 ${l}`)));
    }

    output.push('\n' + '─'.repeat(50));

    return output.join('\n');
  }

  private formatMarkdown(result: ExecutionResult): string {
    return `
# 実行結果

## 概要
- **状態**: ${result.success ? '✅ 成功' : '❌ 失敗'}
- **実行時間**: ${result.duration}ms
- **ステップ数**: ${result.steps.length}

## 実行ステップ
${result.steps
  .map(
    (step, i) => `
### ステップ ${i + 1}
**思考**: ${step.thought.reasoning}
**アクション**: \`${step.action.tool}\`
**結果**: ${step.observation.success ? '成功' : '失敗'}
`,
  )
  .join('\n')}

## ファイル操作
### 作成されたファイル
${result.files.created.map((f) => `- ${f}`).join('\n')}

### 変更されたファイル
${result.files.modified.map((f) => `- ${f}`).join('\n')}

## エラー
${result.errors.map((e) => `- ${e.message}`).join('\n')}
`;
  }
}
```

## 設定管理

### 1. 設定ファイル形式

```yaml
# agents.config.yaml
# グローバル設定
global:
  provider: openai
  model: gpt-4
  parallel: 10
  timeout: 300
  debug: false

# LLMプロバイダー設定
providers:
  openai:
    apiKey: ${OPENAI_API_KEY}
    model: gpt-4
    temperature: 0.7
    maxTokens: 4000

  anthropic:
    apiKey: ${ANTHROPIC_API_KEY}
    model: claude-3-opus

  local:
    baseUrl: http://localhost:8080
    model: gpt-oss-20b

# MCPサーバー設定
mcp:
  servers:
    - name: serena
      transport: stdio
      command: serena-mcp

    - name: filesystem
      transport: stdio
      command: mcp-filesystem
      args: ['--root', '${PWD}']

# 出力設定
output:
  format: text
  color: true
  verbose: false
  logFile: ./agents.log

# カスタムコマンド
aliases:
  todo: 'Todoアプリを作成'
  api: 'RESTful APIを実装'
  test: 'テストを作成して実行'
```

### 2. 環境変数

```typescript
interface EnvironmentVariables {
  // API Keys
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;

  // 設定
  AGENTS_CONFIG?: string; // 設定ファイルパス
  AGENTS_PROVIDER?: string; // デフォルトプロバイダー
  AGENTS_MODEL?: string; // デフォルトモデル

  // 実行環境
  AGENTS_DEBUG?: string; // デバッグモード
  AGENTS_PARALLEL?: string; // 並列実行数
  AGENTS_TIMEOUT?: string; // タイムアウト

  // 出力
  AGENTS_NO_COLOR?: string; // カラー無効化
  AGENTS_LOG_LEVEL?: string; // ログレベル
}
```

### 3. 設定優先順位

```typescript
class ConfigManager {
  private config: Config;

  async load(): Promise<Config> {
    // 1. デフォルト設定
    let config = this.getDefaults();

    // 2. グローバル設定ファイル (~/.agents/config.yaml)
    const globalConfig = await this.loadGlobalConfig();
    config = merge(config, globalConfig);

    // 3. プロジェクト設定ファイル (./agents.config.yaml)
    const projectConfig = await this.loadProjectConfig();
    config = merge(config, projectConfig);

    // 4. 環境変数
    const envConfig = this.loadEnvConfig();
    config = merge(config, envConfig);

    // 5. コマンドライン引数
    const cliConfig = this.loadCliConfig();
    config = merge(config, cliConfig);

    return config;
  }

  private getDefaults(): Config {
    return {
      provider: 'openai',
      model: 'gpt-4',
      parallel: 5,
      timeout: 300,
      debug: false,
      output: {
        format: 'text',
        color: true,
        verbose: false,
      },
    };
  }
}
```

## エラーハンドリングとユーザーフィードバック

### 1. エラー表示

```typescript
class ErrorDisplay {
  showError(error: AgentError): void {
    console.error(chalk.red.bold('\n⚠️  エラーが発生しました\n'));
    console.error(chalk.red('─'.repeat(50)));

    // エラーメッセージ
    console.error(chalk.white(`\nエラー: ${error.message}\n`));

    // 詳細情報
    if (error.details) {
      console.error(chalk.gray('詳細:'));
      console.error(chalk.gray(JSON.stringify(error.details, null, 2)));
    }

    // スタックトレース（デバッグモード時）
    if (this.config.debug && error.stack) {
      console.error(chalk.gray('\nスタックトレース:'));
      console.error(chalk.gray(error.stack));
    }

    // 対処法の提案
    const suggestion = this.getSuggestion(error);
    if (suggestion) {
      console.error(chalk.yellow('\n💡 対処法:'));
      console.error(chalk.yellow(`  ${suggestion}`));
    }

    console.error(chalk.red('─'.repeat(50) + '\n'));
  }

  private getSuggestion(error: AgentError): string | null {
    const suggestions: Record<string, string> = {
      TOOL_NOT_FOUND:
        'MCPツールが見つかりません。`agents mcp list`で利用可能なツールを確認してください。',
      API_KEY_MISSING:
        'APIキーが設定されていません。環境変数またはconfigファイルで設定してください。',
      TIMEOUT: 'タイムアウトしました。--timeoutオプションで制限時間を延長できます。',
      RATE_LIMIT: 'APIレート制限に達しました。しばらく待ってから再試行してください。',
      CONNECTION_FAILED: 'ネットワーク接続に失敗しました。インターネット接続を確認してください。',
    };

    return suggestions[error.code] || null;
  }
}
```

### 2. インタラクティブな確認

```typescript
class InteractivePrompt {
  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const prompt = inquirer.createPromptModule();

    const { confirmed } = await prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        default: defaultValue,
      },
    ]);

    return confirmed;
  }

  async select(message: string, choices: string[]): Promise<string> {
    const prompt = inquirer.createPromptModule();

    const { selected } = await prompt([
      {
        type: 'list',
        name: 'selected',
        message,
        choices,
      },
    ]);

    return selected;
  }

  async input(message: string, defaultValue?: string): Promise<string> {
    const prompt = inquirer.createPromptModule();

    const { value } = await prompt([
      {
        type: 'input',
        name: 'value',
        message,
        default: defaultValue,
      },
    ]);

    return value;
  }
}
```

## ログとデバッグ

### 1. ログシステム

```typescript
class Logger {
  private winston: Winston.Logger;

  constructor(config: LogConfig) {
    this.winston = winston.createLogger({
      level: config.level || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      transports: [
        // ファイル出力
        new winston.transports.File({
          filename: config.logFile || 'agents.log',
          maxsize: 10485760, // 10MB
          maxFiles: 5,
        }),
        // コンソール出力（デバッグモード時）
        ...(config.debug
          ? [
              new winston.transports.Console({
                format: winston.format.combine(winston.format.colorize(), winston.format.simple()),
              }),
            ]
          : []),
      ],
    });
  }

  // 構造化ログ
  log(level: string, message: string, meta?: any): void {
    this.winston.log(level, message, {
      ...meta,
      timestamp: new Date().toISOString(),
      pid: process.pid,
    });
  }
}
```

### 2. デバッグツール

```typescript
class DebugTools {
  // メモリダンプ
  dumpMemory(): void {
    console.log(chalk.yellow('\n📊 メモリ使用状況:'));
    const usage = process.memoryUsage();

    console.table({
      RSS: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      'Heap Total': `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      'Heap Used': `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      External: `${Math.round(usage.external / 1024 / 1024)}MB`,
    });
  }

  // 実行統計
  showStats(stats: ExecutionStats): void {
    console.log(chalk.yellow('\n📈 実行統計:'));

    console.table({
      総タスク数: stats.totalTasks,
      成功: stats.successful,
      失敗: stats.failed,
      平均実行時間: `${stats.avgDuration}ms`,
      ツール呼び出し回数: stats.toolCalls,
      LLM呼び出し回数: stats.llmCalls,
      使用トークン数: stats.tokensUsed,
    });
  }

  // トレース表示
  showTrace(trace: ExecutionTrace): void {
    console.log(chalk.yellow('\n🔍 実行トレース:'));

    trace.steps.forEach((step, i) => {
      const duration = step.endTime - step.startTime;
      const indent = '  '.repeat(step.depth);

      console.log(
        chalk.gray(`${indent}[${i}]`),
        chalk.cyan(step.action),
        chalk.gray(`(${duration}ms)`),
        step.success ? chalk.green('✓') : chalk.red('✗'),
      );
    });
  }
}
```

## 国際化（i18n）

### 1. メッセージカタログ

```typescript
// locales/ja.json
{
  "welcome": "🤖 @akiojin/agents へようこそ！",
  "help": "ヘルプは /help、終了は /exit または Ctrl+C",
  "prompt": "> ",
  "task": "タスク",
  "thinking": "思考",
  "action": "アクション",
  "success": "成功",
  "failed": "失敗",
  "error": "エラーが発生しました",
  "completed": "完了しました",
  "cancelled": "キャンセルされました"
}

// locales/en.json
{
  "welcome": "🤖 Welcome to @akiojin/agents!",
  "help": "Type /help for help, /exit or Ctrl+C to quit",
  "prompt": "> ",
  "task": "Task",
  "thinking": "Thinking",
  "action": "Action",
  "success": "Success",
  "failed": "Failed",
  "error": "An error occurred",
  "completed": "Completed",
  "cancelled": "Cancelled"
}
```

### 2. 国際化実装

```typescript
class I18n {
  private locale: string;
  private messages: Record<string, string>;

  constructor(locale = 'ja') {
    this.locale = locale;
    this.messages = this.loadMessages(locale);
  }

  t(key: string, params?: Record<string, any>): string {
    let message = this.messages[key] || key;

    // パラメータ置換
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        message = message.replace(`{${key}}`, String(value));
      });
    }

    return message;
  }

  setLocale(locale: string): void {
    this.locale = locale;
    this.messages = this.loadMessages(locale);
  }
}
```

## パフォーマンス最適化

### 1. 起動時間の最適化

```typescript
class FastStartup {
  // 遅延読み込み
  private lazyLoad<T>(loader: () => Promise<T>): () => Promise<T> {
    let cached: T | null = null;

    return async () => {
      if (!cached) {
        cached = await loader();
      }
      return cached;
    };
  }

  // 必要最小限の初期化
  async minimalInit(): Promise<void> {
    // 必須コンポーネントのみ初期化
    await this.initCore();

    // その他は遅延読み込み
    this.mcpManager = this.lazyLoad(() => this.initMCP());
    this.llmProvider = this.lazyLoad(() => this.initLLM());
  }
}
```

### 2. レスポンス最適化

```typescript
class ResponseOptimizer {
  // ストリーミング出力
  async streamOutput(generator: AsyncGenerator<string>): Promise<void> {
    for await (const chunk of generator) {
      process.stdout.write(chunk);
    }
  }

  // バッファリング
  private buffer: string[] = [];
  private flushInterval: NodeJS.Timeout;

  bufferOutput(text: string): void {
    this.buffer.push(text);

    if (!this.flushInterval) {
      this.flushInterval = setTimeout(() => this.flush(), 100);
    }
  }

  private flush(): void {
    if (this.buffer.length > 0) {
      process.stdout.write(this.buffer.join(''));
      this.buffer = [];
    }
    clearTimeout(this.flushInterval);
  }
}
```

## テスト設計

### 1. ユニットテスト

```typescript
describe('CLI Interface', () => {
  describe('Command Parser', () => {
    it('should parse task command', () => {
      const args = ['--task', 'Create todo app', '--provider', 'local'];
      const options = parseArgs(args);

      expect(options.task).toBe('Create todo app');
      expect(options.provider).toBe('local');
    });

    it('should handle config file', async () => {
      const config = await loadConfig('./test-config.yaml');

      expect(config.provider).toBe('openai');
      expect(config.model).toBe('gpt-4');
    });
  });

  describe('REPL', () => {
    it('should handle slash commands', async () => {
      const repl = new REPLInterface();
      const result = await repl.handleCommand('/help');

      expect(result).toContain('Available commands');
    });
  });
});
```

### 2. E2Eテスト

```typescript
describe('CLI E2E', () => {
  it('should execute task from command line', async () => {
    const result = await exec('agents --task "Create hello.txt" --dry-run');

    expect(result.stdout).toContain('Would create: hello.txt');
    expect(result.exitCode).toBe(0);
  });

  it('should handle interactive mode', async () => {
    const proc = spawn('agents');

    proc.stdin.write('Create hello world file\n');
    proc.stdin.write('/exit\n');

    const output = await collectOutput(proc);

    expect(output).toContain('Task completed');
  });
});
```

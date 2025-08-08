# Claude Code vs Agents App システムプロンプトの違い

## Claude Code v1.0.68 の主要な特徴

### 1. 簡潔性への強い指示
- 4行以内での回答を厳守
- 不要な説明や前置きを排除
- ワンワード回答を推奨
- 出力トークンの最小化

### 2. タスク管理（TodoWrite）
- 複雑なタスクでTodoWriteツールの頻繁な使用を指示
- タスクの進捗管理を重視
- in_progressは1つのみに制限

### 3. ファイル操作のポリシー
- 新規ファイル作成より既存ファイル編集を優先
- ドキュメントファイル（*.md）の自動作成を禁止
- コメント追加を原則禁止（明示的な要求がある場合のみ）

### 4. ツール使用ポリシー
- Taskツールでのコンテキスト削減
- 複数ツールの並列実行を推奨
- WebFetchのリダイレクト処理

### 5. Git操作の詳細な指示
- コミットメッセージにClaude Codeの署名を追加
- PRの作成手順を詳細に規定
- git configの更新を禁止

## Agents App での調整内容

### 追加した要素
1. **Serena MCP優先**
   - serena_search_for_pattern
   - serena_find_symbol
   - プロジェクト内検索を最優先

2. **プロジェクト固有情報**
   - src/functions/bash.ts (InternalBash)
   - src/core/agent.ts
   - src/providers/
   - src/mcp/

3. **レスポンス形式制御**
   - マークダウン禁止
   - 表形式禁止
   - 番号付きリストのみ許可

### 削除した要素
1. Claude Code固有のツール説明
2. GitHub Actions関連
3. Claude Code特有のドキュメントパス
4. /helpコマンドへの言及
5. 環境変数の詳細（<env>タグ）

## 実装状況
- LocalProvider.chat()メソッドに統合
- responseFormatConfig.enabledがtrueの場合に適用
- システムプロンプトは英語で記述（LLMの理解度向上のため）
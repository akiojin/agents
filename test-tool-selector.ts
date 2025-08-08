#!/usr/bin/env bun
import { DynamicToolSelector, ToolCategory } from './src/mcp/tool-selector.js';
import { ToolLimitDetector } from './src/mcp/tool-limit-detector.js';

// テスト用のツール定義（30個で制限値テスト）
const testTools = [
  // 内部ファイルシステム関数
  { name: 'read_text_file', description: 'ファイルを読み取る', parameters: {} },
  { name: 'write_file', description: 'ファイルに書き込む', parameters: {} },
  { name: 'list_directory', description: 'ディレクトリ一覧', parameters: {} },
  { name: 'create_directory', description: 'ディレクトリ作成', parameters: {} },
  { name: 'delete_file', description: 'ファイル削除', parameters: {} },
  { name: 'delete_directory', description: 'ディレクトリ削除', parameters: {} },
  { name: 'get_file_info', description: 'ファイル情報取得', parameters: {} },
  { name: 'change_directory', description: 'ディレクトリ変更', parameters: {} },
  { name: 'get_current_directory', description: '現在のディレクトリ取得', parameters: {} },
  { name: 'get_security_info', description: 'セキュリティ情報取得', parameters: {} },
  
  // 内部Bash関数
  { name: 'execute_command', description: 'コマンドを実行する', parameters: {} },
  { name: 'execute_command_interactive', description: '対話式コマンド実行', parameters: {} },
  { name: 'get_bash_security_info', description: 'Bashセキュリティ情報取得', parameters: {} },
  
  // Serena MCP（コード分析・編集）
  { name: 'mcp__serena__get_symbols_overview', description: 'コードのシンボル一覧を取得', parameters: {} },
  { name: 'mcp__serena__find_symbol', description: 'シンボルを検索', parameters: {} },
  { name: 'mcp__serena__find_referencing_symbols', description: '参照シンボルを検索', parameters: {} },
  { name: 'mcp__serena__replace_symbol_body', description: 'シンボルを置換', parameters: {} },
  { name: 'mcp__serena__insert_after_symbol', description: 'シンボル後に挿入', parameters: {} },
  { name: 'mcp__serena__insert_before_symbol', description: 'シンボル前に挿入', parameters: {} },
  { name: 'mcp__serena__search_for_pattern', description: 'パターン検索', parameters: {} },
  
  // 検索・ドキュメント
  { name: 'mcp__google-search__google_search', description: 'Google検索を実行', parameters: {} },
  { name: 'mcp__microsoft_docs_mcp__microsoft_docs_search', description: 'Microsoft ドキュメント検索', parameters: {} },
  { name: 'mcp__microsoft_docs_mcp__microsoft_docs_fetch', description: 'Microsoft ドキュメント取得', parameters: {} },
  
  // テキスト処理
  { name: 'mcp__textlint__lintFile', description: 'テキスト校正', parameters: {} },
  { name: 'mcp__textlint__getLintFixedFileContent', description: 'テキスト自動修正', parameters: {} },
  { name: 'mcp__markitdown__convert_to_markdown', description: 'マークダウン変換', parameters: {} },
  
  // Context7（ライブラリドキュメント）
  { name: 'mcp__context7__resolve-library-id', description: 'ライブラリID解決', parameters: {} },
  { name: 'mcp__context7__get-library-docs', description: 'ライブラリドキュメント取得', parameters: {} },
  
  // 追加のユーティリティ
  { name: 'mcp__filesystem__read_multiple_files', description: '複数ファイル読み取り', parameters: {} },
  { name: 'mcp__filesystem__directory_tree', description: 'ディレクトリツリー表示', parameters: {} },
];

async function testToolSelector() {
  console.log('=== DynamicToolSelector テスト ===');
  
  const selector = new DynamicToolSelector();
  
  // 各プロバイダーでのテスト
  const providers = ['openai', 'anthropic', 'local-gptoss', 'local-lmstudio'];
  const testInputs = [
    'ファイルを読んで内容を確認したい',
    'コードの構造を分析してください',
    'Azureの使い方を教えて',
    'ウェブで最新情報を検索'
  ];
  
  for (const provider of providers) {
    console.log(`\n--- プロバイダー: ${provider} ---`);
    selector.setProvider(provider);
    
    for (const input of testInputs) {
      console.log(`\n入力: "${input}"`);
      const selected = selector.selectOptimalTools(input, testTools);
      console.log(`選択されたツール数: ${selected.length}`);
      console.log('ツール:', selected.map(t => t.name).join(', '));
    }
  }
}

async function testToolLimitDetector() {
  console.log('\n\n=== ToolLimitDetector テスト ===');
  
  const detector = new ToolLimitDetector();
  
  // 各プロバイダーの既知制限をテスト
  const providers = ['openai', 'anthropic', 'local-gptoss', 'local-lmstudio'];
  
  for (const provider of providers) {
    const limit = detector.getKnownLimit(provider);
    console.log(`${provider}: 既知制限 = ${limit}ツール`);
    
    const safeTools = detector.selectSafeToolCount(testTools, provider);
    console.log(`  安全選択: ${safeTools.length}/${testTools.length}ツール`);
  }
  
  // ツール制限エラー判定テスト
  console.log('\nエラー判定テスト:');
  const testErrors = [
    new Error('Too many tools provided'),
    new Error('Tool limit exceeded: maximum 10 allowed'),
    new Error('Network error'),
    new Error('Invalid tool count: 15 > 10')
  ];
  
  testErrors.forEach((error, i) => {
    const isToolError = detector.isToolLimitError(error);
    console.log(`  エラー${i + 1}: ${isToolError ? '✓ ツール制限' : '✗ その他'} - "${error.message}"`);
  });
}

// テスト実行
console.log('動的ツール管理システム テスト開始\n');
await testToolSelector();
await testToolLimitDetector();
console.log('\n✅ テスト完了');
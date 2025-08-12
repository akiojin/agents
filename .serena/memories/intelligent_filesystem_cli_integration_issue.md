# IntelligentFileSystem CLI統合の問題

## 問題
- CLIツール（ReadFileTool、EditTool等）がIntelligentFileSystemを使用していない
- 内部関数（read_text_file、write_file）は置き換えたが、CLIツールは別実装
- 実行ログで`ReadFile`、`ReadFolder`が通常のファイル読み取りを使用

## 原因
1. **二重実装の存在**
   - 内部関数: src/functions/registry.ts の read_text_file, write_file
   - CLIツール: packages/core/src/tools/ の ReadFileTool, EditTool
   
2. **CLIツールの実装**
   - packages/core/src/tools/read-file.ts: ReadFileTool
   - processSingleFileContent() を使用（IntelligentFileSystemではない）
   
## 修正方法
1. ReadFileToolのexecuteメソッドを修正
   - IntelligentFileSystemのチェックと使用を追加
   - フォールバック処理を維持（互換性のため）
   
2. EditToolも同様に修正が必要
   
3. 完全な統合のためには：
   - packages/core全体でIntelligentFileSystemを標準化
   - ツールレベルでの置き換えが必要
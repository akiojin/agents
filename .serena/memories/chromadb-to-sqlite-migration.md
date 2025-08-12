# ChromaDBからSQLiteへの完全移行

## 移行完了事項

### コード変更
1. **SqliteMemoryClient実装**: packages/memory/src/sqlite/SqliteMemoryClient.ts (421行)
   - ChromaMemoryClient完全互換API
   - better-sqlite3 + 手動コサイン類似度計算
   - データスキーマ: memories(id, content, embedding BLOB, metadata JSON)

2. **全ChromaDB参照削除**:
   - packages/memory/src/index.ts: ChromaMemoryClient → SqliteMemoryClient
   - packages/memory/src/synaptic/: コメント更新
   - 全テストファイル更新 (memoryApi.test.ts, synapticNetwork.*.test.ts)

3. **ファイル削除**:
   - packages/memory/src/chroma/ (全ディレクトリ)
   - scripts/start-chromadb.js (176行)

4. **設定ファイル更新**:
   - docker-compose.yml: ChromaDBサービス&依存関係削除
   - package.json: chromadb@3.0.11削除
   - scripts/start.js: ensureChromaDB()削除
   - .env.example: CHROMA_URL → SQLite設定
   - .gitignore: chromadb_env/, .chroma/ 削除

5. **ドキュメント更新**:
   - README.md, README.ja.md: ChromaDB → SQLite記述
   - docs/architecture/sqlite-migration-summary.md 新規作成

## 技術的利点

### パフォーマンス
- データ規模: 推定1000件未満、3MB以下
- コサイン類似度: 768次元×1000件 = 1ms未満
- ブルートフォース検索で十分な性能

### シンプルさ
- コード行数: 588行 → 421行 (167行削減)
- ChromaDB特有処理: 400行削除
- 依存関係: chromadb + バイナリ削除

### 運用性
- 外部サーバー不要
- Docker不要 (オプション)
- 自動初期化
- ローカルファイルベース (.agents/cache/memory.db)

## API互換性
- initialize(), add(), query(), getAll(), update(), delete()
- 既存シナプスネットワーク実装は無変更
- テスト実装も同一パターンで更新

## 今後の拡張
- sqlite-vec: より大規模データ対応時
- インデックス最適化: 必要時
- バイナリ量子化: メモリ削減時
- 段階的移行可能な設計
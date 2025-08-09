# Synaptic Memory システム テストスイート

Synaptic Memory システムの包括的なテストスイートのドキュメントです。

## 概要

このテストスイートは、Synaptic Memory システムの信頼性、パフォーマンス、ユーザビリティを保証するために設計されています。テストピラミッドアプローチを採用し、多層的なテスト戦略を実装しています。

## テスト戦略

### 1. テストピラミッド

```
     E2E Tests
   ----------------
  Integration Tests  
 --------------------
     Unit Tests
```

- **Unit Tests (70%)**: 個々のコンポーネントの動作検証
- **Integration Tests (20%)**: コンポーネント間の連携検証  
- **E2E Tests (10%)**: エンドユーザーシナリオの検証

### 2. テスト分類

#### Backend API Tests
- **場所**: `/packages/memory/src/api/memoryApi.test.ts`
- **対象**: MemoryAPI クラスの全メソッド
- **カバレッジ**: CRUD操作、エラーハンドリング、イベント処理

#### Frontend Component Tests
- **場所**: 
  - `/packages/cli/src/ui/components/SynapticMemoryDashboard.test.tsx`
  - `/packages/cli/src/ui/hooks/useSynapticMemory.test.ts`
  - `/packages/cli/src/ui/commands/synapticCommand.test.ts`
- **対象**: UI コンポーネント、カスタムフック、コマンドハンドラ
- **カバレッジ**: レンダリング、状態管理、ユーザーインタラクション

#### Core System Integration Tests
- **場所**: `/packages/memory/src/synaptic/synapticNetwork.integration.test.ts`
- **対象**: SynapticNetwork とChromaDBの統合
- **カバレッジ**: データフロー、接続管理、診断機能

#### Performance Tests
- **場所**: `/test/performance/synaptic-memory.performance.test.ts`
- **対象**: システム全体のパフォーマンス
- **カバレッジ**: 応答時間、スループット、メモリ使用量

#### Error Handling Tests
- **場所**: `/test/error-handling/synaptic-memory.error.test.ts`
- **対象**: エラー条件での動作
- **カバレッジ**: 接続障害、データ破損、リソース枯渇

#### E2E Tests
- **場所**: `/test/e2e/synaptic-memory.e2e.test.ts`
- **対象**: エンドツーエンドのユーザーワークフロー
- **カバレッジ**: 記憶作成→活性化→検索のフルフロー

## テスト実行方法

### 個別テスト実行

```bash
# 単体テスト
npm run test:synaptic:unit

# 統合テスト
npm run test:synaptic:integration

# パフォーマンステスト
npm run test:synaptic:performance

# エラーハンドリングテスト
npm run test:synaptic:error

# E2Eテスト
npm run test:synaptic:e2e

# 全テスト実行
npm run test:synaptic:all
```

### CI/CD パイプライン

GitHub Actions ワークフローが自動的に以下を実行します：

1. **基本テスト**: プルリクエスト・プッシュ時
2. **統合テスト**: ChromaDB サービスと連携
3. **パフォーマンステスト**: プルリクエスト時のみ
4. **E2Eテスト**: main/develop ブランチのみ
5. **カバレッジ計測**: Codecov への自動アップロード

## テスト環境セットアップ

### 前提条件

1. **ChromaDB**: 統合・E2Eテスト用
   ```bash
   docker run -p 8000:8000 chromadb/chroma:latest
   ```

2. **環境変数**:
   ```bash
   export NODE_ENV=test
   export CHROMA_URL=http://localhost:8000
   ```

### テストデータベース

- **コレクション名**: `test-synaptic-memories`
- **自動クリーンアップ**: テスト前後で自動実行
- **分離**: 本番データへの影響なし

## パフォーマンス要件

### レスポンス時間
- **検索**: 2秒以内
- **単一保存**: 0.5秒以内  
- **バッチ保存**: 30秒以内
- **活性化**: 3秒以内

### リソース使用量
- **メモリ**: 512MB以内
- **CPU**: 継続的な高負荷なし
- **メモリリーク**: なし

## テストデータ管理

### ファクトリーパターン

`/test/utils/testFactories.ts` でテストデータを統一管理：

```typescript
// メモリ作成
const memory = MemoryFactory.create({
  content: 'カスタムコンテンツ'
});

// 関連メモリセット
const relatedMemories = MemoryFactory.createRelatedSet('TypeScript', 3);

// ネットワーク健康状態
const health = NetworkHealthFactory.createHealthy();
```

### データ一貫性

- **ID管理**: ユニークなテストID自動生成
- **タイムスタンプ**: 制御可能な時系列データ
- **埋め込みベクトル**: 類似度制御可能な生成

## モック戦略

### 外部依存関係

- **ChromaDB**: 統合テスト以外はモック使用
- **ネットワーク**: エラーシミュレータで障害テスト
- **ファイルシステム**: メモリベースの仮想FS

### モック管理

```typescript
import { mockManager } from '/test/utils/testFactories';

// モック登録
mockManager.register('chromaClient', mockChromaClient);

// モック取得
const client = mockManager.get<MockChromaClient>('chromaClient');
```

## エラーテストシナリオ

### ネットワーク障害
- 接続タイムアウト
- 間欠的接続エラー
- サーバー応答なし

### データ整合性
- 不正な埋め込みベクトル
- 欠損メタデータ
- 型不整合

### リソース制約
- メモリ不足
- 接続プール枯渇
- ディスク容量不足

## 継続的品質管理

### コードカバレッジ目標
- **Unit Tests**: 90%以上
- **Integration Tests**: 70%以上
- **Overall**: 85%以上

### 品質メトリクス
- テスト実行時間: 10分以内
- テスト成功率: 99%以上
- フラッキーテスト: 1%以下

### 定期実行
- **PR時**: 全テスト実行
- **マージ時**: フルスイート + パフォーマンス
- **夜間**: 拡張パフォーマンステスト

## トラブルシューティング

### 一般的な問題

1. **ChromaDB接続エラー**:
   ```bash
   docker ps | grep chroma
   curl http://localhost:8000/api/v1/heartbeat
   ```

2. **テストタイムアウト**:
   ```bash
   # タイムアウト値を増加
   vitest run --timeout=60000
   ```

3. **メモリリーク**:
   ```bash
   # ガベージコレクション強制実行
   node --expose-gc ./node_modules/.bin/vitest
   ```

### デバッグ方法

```bash
# 詳細ログ出力
DEBUG=1 npm run test:synaptic:unit

# 単一テストファイル実行
npx vitest run packages/memory/src/api/memoryApi.test.ts --reporter=verbose

# カバレッジ詳細
npm run test:synaptic:unit -- --coverage --reporter=verbose
```

## 今後の拡張計画

### テストスコープ拡張
- マルチテナント対応テスト
- 大規模データセット対応
- リアルタイム同期テスト

### パフォーマンス改善
- 並列テスト実行最適化
- テストデータ生成高速化
- キャッシュ機能活用

### 品質向上
- ミューテーションテスト導入
- プロパティベーステスト追加
- ビジュアルリグレッションテスト

## 参考資料

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [ChromaDB API](https://docs.trychroma.com/)
- [GitHub Actions](https://docs.github.com/en/actions)

---

このドキュメントは、Synaptic Memory システムのテスト戦略と実装の詳細を説明しています。質問や改善提案があれば、開発チームまでお知らせください。
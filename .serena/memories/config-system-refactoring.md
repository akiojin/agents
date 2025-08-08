# Configuration System Refactoring

## 設計思想
フォールバック処理による複雑性を排除し、必ずsettings.jsonから設定を取得する単純明快な仕組みに変更。

## 実装方針

### 1. 設定ファイル自動生成
- settings.jsonが存在しない場合、デフォルト値で自動作成
- ユーザーは常にファイルベースで設定を管理

### 2. ハードコードされたデフォルト値の排除
- ProviderFactory: localEndpointのハードコードを削除、設定必須に
- LocalProvider: constructorのデフォルト値を削除、endpoint必須パラメータ化

### 3. 統一された設定読み込み
```typescript
// 設定ファイルが存在しない → デフォルト値で作成
if (!existsSync(this.configPath)) {
  await this.createDefaultConfigFile();
}

// 必ず設定ファイルから読み込み（フォールバックなし）
const fileConfig = await this.loadFromFile();
```

### 4. エラーハンドリングの改善
- 設定読み込み失敗時は例外をthrow（従来のデフォルト値返却を廃止）
- エンドポイント未設定時は明確なエラーメッセージ

## 修正箇所
- src/config/index.ts: ConfigManager.load()とcreateDefaultConfigFile()追加
- src/config/types.ts: DEFAULT_CONFIG.localEndpointを追加
- src/providers/factory.ts: ハードコードされたデフォルト値を削除
- src/providers/local.ts: constructorからデフォルト値を削除

## 利点
1. 設定管理の一元化
2. フォールバック処理による混乱の解消
3. 設定ファイルベースの透明性
4. デバッグとトラブルシューティングの簡略化
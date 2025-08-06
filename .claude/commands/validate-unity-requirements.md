# Unity実装要件検証コマンド

このコマンドは、専門的なサブエージェントを並列実行してUnityコードが `/docs/Unity実装要件.md` に記載されている実装要件を遵守しているかを包括的に検証します。

## 使用方法

```
/validate-unity-requirements
```

## 実行内容

**重要: 各サブエージェントには以下のコンテキスト情報を自動収集して提供**

- プロジェクト名: 147-Xyla（MOBA系アクションゲーム）
- 技術スタック: Unity 6.1 / VContainer / UniTask / GrimoireEngine
- アーキテクチャ制約: シングルトンパターン禁止
- 検証対象ディレクトリ: `Xyla/Assets/@Xyla/Scripts/`

以下の10個の専門サブエージェントを並列実行して、各要件を詳細に検証します：

1. **singleton-pattern-validator** - シングルトンパターンの利用禁止検証
2. **dependency-injection-validator** - VContainer依存注入の適切な実装検証
3. **async-pattern-validator** - UniTask利用の適切性検証
4. **var-usage-validator** - ローカル変数の型推論（var）利用検証
5. **namespace-structure-validator** - using宣言のnamespace内配置検証
6. **copyright-header-validator** - ファイル先頭のコピーライト表記検証
7. **null-handling-validator** - null判定の設計思想遵守検証
8. **component-dependency-validator** - GetComponentの直接設定禁止検証
9. **private-keyword-validator** - privateキーワード省略ルール検証
10. **namespace-unification-validator** - 名前空間統一ルール（Xyla/Xyla.Editor）検証

## 検証対象

`Xyla/Assets/@Xyla/Scripts/` 配下の全C#ファイルを対象とし、以下の項目を包括的に検証：

- 必須要件（シングルトンパターン禁止、VContainer、UniTask）
- コーディング規約（型推論、using配置、コピーライト、null判定、privateキーワード省略、名前空間統一等）
- Unity実装要件ドキュメントの全19項目のチェックリスト

## このアプローチのメリット

- **専門性**: 各要件に特化したサブエージェントによる高品質で詳細な分析
- **効率性**: 並列実行により処理時間を大幅に短縮
- **包括性**: 複数の観点から同じコードを分析し、見落としを防止
- **実践性**: 各バリデーターが具体的な修正提案とベストプラクティスを提供
- **一貫性**: 統一された基準でプロジェクト全体の品質を確保

## 注意事項

- 各サブエージェントは独立して動作し、最終的に統合レポートを提供します
- 専門バリデーターによる分析のため、従来の静的解析より高精度な検出が可能です
- 生成されたコードの最終的な確認は開発者が行ってください

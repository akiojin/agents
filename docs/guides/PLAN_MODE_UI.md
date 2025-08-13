# プランモードUI実装ガイド

## 概要

このドキュメントは、AGENTSプロジェクトにおけるプランモード/実行モードシステムと承認UIの実装について説明します。

## システム設計

### アーキテクチャ

プランモードシステムは以下の2つの主要モードで構成されています：

1. **プランニングモード**: 要件定義 → 設計 → 承認UI表示
2. **実行モード**: 実装 → 進捗表示 → 完了

### 状態管理

各モードは段階的な状態（Phase）と実行状態（StepState）を持ちます：

#### Phase（フェーズ）
- `REQUIREMENTS`: 要件定義段階
- `DESIGN`: 設計段階
- `IMPLEMENTATION`: 実装段階

#### StepState（実行状態）
- `LISTENING`: 入力待ち状態
- `THINKING`: 処理中状態
- `PRESENTING`: 結果提示状態

## 実装コンポーネント

### 1. 型定義 (`packages/cli/src/ui/types/agent-state.ts`)

```typescript
export enum AgentMode {
  PLANNING = 'planning',
  EXECUTION = 'execution',
  IDLE = 'idle'
}

export enum Phase {
  REQUIREMENTS = 'requirements',
  DESIGN = 'design',
  IMPLEMENTATION = 'implementation'
}

export enum StepState {
  LISTENING = 'listening',
  THINKING = 'thinking',
  PRESENTING = 'presenting'
}
```

### 2. 状態管理Hook (`packages/cli/src/ui/hooks/useAgentState.ts`)

エージェントの状態遷移を管理するカスタムHook。

**主な機能:**
- 現在のモード/フェーズ/状態の管理
- 状態遷移の制御
- セッションコンテキストの保持

### 3. 承認機能Hook (`packages/cli/src/ui/hooks/usePlanApproval.ts`)

プラン承認フローを管理するHook。

**主な機能:**
- プラン完了の自動検出
- 承認UIの表示制御
- 承認/拒否/編集の処理

### 4. UIコンポーネント

#### PlanApprovalSelect (`packages/cli/src/ui/components/PlanApprovalSelect.tsx`)
- 承認/拒否/編集の選択UI
- 既存の`ink-select-input`パターンに準拠
- 矢印キーで選択、Enterで決定

#### PlanModeDisplay (`packages/cli/src/ui/components/PlanModeDisplay.tsx`)
- プランニングモードの進捗表示
- フェーズ別の状態表示

#### ExecutionModeDisplay (`packages/cli/src/ui/components/ExecutionModeDisplay.tsx`)
- 実行モードの進捗バー
- ファイル変更履歴
- テスト・デプロイ状況

### 5. 統合コンポーネント (`packages/cli/src/ui/components/PlanModeIntegration.tsx`)

既存のApp.tsxに最小限の影響で統合するためのラッパーコンポーネント。

**統合のポイント:**
- 承認UI表示時は他のUIをブロック
- 各モードに応じた適切な表示の切り替え
- 既存のコンポーネント階層への非侵入的統合

## 使用方法

### 1. 基本的なフロー

```
ユーザー入力 → プランモード開始 → 要件定義 → 設計 → プラン提示 → 承認UI → 実行モード
```

### 2. プラン完了の検出

以下のキーワードでプラン完了を自動検出：
- "## Plan Complete"
- "設計完了"
- "Ready for approval"
- "プラン提示"
- "承認をお願いします"
- "Plan ready for review"

### 3. 承認アクション

- **承認**: 実行モードに移行
- **拒否**: アイドル状態に戻る
- **編集**: 設計段階に戻る（編集モード）

## 既存システムとの統合

### App.tsxでの統合

```tsx
import { PlanModeIntegration } from './components/PlanModeIntegration.js';

// コンポーネント内で使用
<PlanModeIntegration
  onPlanApproved={(result) => { /* 承認時の処理 */ }}
  onPlanRejected={(result) => { /* 拒否時の処理 */ }}
  onPlanEditRequested={(result) => { /* 編集時の処理 */ }}
/>
```

### useGeminiStreamとの連携

- プランモード検出のためのコンテンツ解析
- 状態に応じたストリーミング制御
- 承認待ち状態の管理

## 技術詳細

### 状態遷移の例

```
IDLE → PLANNING (REQUIREMENTS, LISTENING)
↓
PLANNING (REQUIREMENTS, THINKING)
↓
PLANNING (REQUIREMENTS, PRESENTING)
↓
PLANNING (DESIGN, LISTENING)
↓
PLANNING (DESIGN, THINKING)
↓
PLANNING (DESIGN, PRESENTING) ← 承認UI表示
↓
EXECUTION (IMPLEMENTATION, THINKING)
↓
EXECUTION (IMPLEMENTATION, PRESENTING) ← 完了
```

### プラン完了検出ロジック

1. コンテンツストリーミング中にキーワードを監視
2. プランニングモード中のみ反応
3. 要件定義と設計の両方が完了している場合のみ承認UI表示
4. 時間予想とリスク評価も自動抽出

### 承認UI表示条件

- `showApprovalUI = true`
- `pendingPlanData`が存在
- プランニングモードの設計フェーズ、プレゼンテーション状態

## 拡張可能性

### 将来的な改善点

1. **ユーザーコメント機能**: 承認時にコメントを追加
2. **プラン履歴**: 過去のプランの保存・参照
3. **テンプレート機能**: よく使うプランパターンのテンプレート化
4. **進捗通知**: 実装進捗の詳細な通知

### カスタマイズ可能な要素

- プラン完了検出キーワード
- 承認UI のスタイル
- 状態遷移のタイミング
- 進捗表示のフォーマット

## トラブルシューティング

### よくある問題

1. **承認UIが表示されない**
   - プラン完了キーワードが含まれているか確認
   - プランニングモードに正しく移行しているか確認
   - 要件定義と設計の両方が完了しているか確認

2. **状態遷移が正しく動作しない**
   - `useAgentState`の状態を確認
   - ブラウザの開発者ツールでコンソールログを確認

3. **UIの表示が重複する**
   - `showApprovalUI`の状態管理を確認
   - 他のUI表示条件との競合がないか確認

## 関連ファイル

- `packages/cli/src/ui/types/agent-state.ts`
- `packages/cli/src/ui/hooks/useAgentState.ts`
- `packages/cli/src/ui/hooks/usePlanApproval.ts`
- `packages/cli/src/ui/components/PlanApprovalSelect.tsx`
- `packages/cli/src/ui/components/PlanModeDisplay.tsx`
- `packages/cli/src/ui/components/ExecutionModeDisplay.tsx`
- `packages/cli/src/ui/components/PlanModeIntegration.tsx`
- `packages/cli/src/ui/App.tsx` (統合部分)

## 更新履歴

- 2024-01-XX: 初期実装完了
- システム統合とテスト完了
- ドキュメント作成完了
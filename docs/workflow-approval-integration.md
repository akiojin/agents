# ワークフロー承認システム - 統合ガイド

## 概要

AGENTSプロジェクトのワークフロー承認システムは、既存のツール承認メカニズムと統合して実装されています。これにより、MCPツールなどと同じUIでワークフローの承認が可能になります。

## アーキテクチャ

### 1. 既存の承認UI活用

既存のシステムには、以下の承認UIコンポーネントが実装されています：

- **ToolConfirmationMessage**: ツール実行の承認UI
- **RadioButtonSelect**: 選択肢を表示するラジオボタン
- **承認フロー**: shouldConfirmExecute → 承認UI表示 → execute

### 2. ワークフロー承認の統合方法

#### 方法1: WorkflowToolクラス（推奨）

```typescript
// workflow-tool.ts
export class WorkflowTool extends BaseTool<WorkflowToolParams> {
  async shouldConfirmExecute(params, signal) {
    // 実行計画を作成
    const plan = await this.createPlan(params);
    
    // 承認が必要な場合
    if (plan.approvalRequired) {
      return {
        type: 'info',
        title: 'ワークフロー実行の承認',
        prompt: this.formatPlanSummary(plan),
        onConfirm: async (outcome) => {
          // 承認結果の処理
        }
      };
    }
    
    return false; // 承認不要
  }
}
```

#### 方法2: WorkflowConfirmationMessageコンポーネント

```tsx
// workflow-confirmation-ui.tsx
export const WorkflowConfirmationMessage: React.FC = ({
  confirmationDetails,
  isFocused,
  terminalWidth,
}) => {
  // 既存のToolConfirmationMessageと同様のUIを実装
  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>📋 実行計画の承認が必要です</Text>
      {/* 計画の概要 */}
      <RadioButtonSelect
        items={options}
        onSelect={handleSelect}
        isFocused={isFocused}
      />
    </Box>
  );
};
```

## 統合手順

### 1. ツールレジストリへの登録

```typescript
// packages/core/src/tools/tool-registry.ts
import { WorkflowTool } from '@agents/workflow-tool';

toolRegistry.register(new WorkflowTool(config));
```

### 2. CLIでの表示

既存のツール承認フローを通じて、自動的に承認UIが表示されます：

1. ユーザーがワークフロー実行をリクエスト
2. WorkflowTool.shouldConfirmExecute()が呼ばれる
3. 承認が必要な場合、ToolConfirmationMessageが表示される
4. ユーザーが選択（承認/拒否/詳細表示）
5. WorkflowTool.execute()で実行

## 承認UIの表示例

```
📋 実行計画の承認が必要です
━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 計画概要:
  • タスク数: 5
  • 実行グループ数: 3
  • 推定実行時間: 30分
  • 複雑度: medium

📝 主要タスク:
  1. ユーザー認証機能の実装
  2. データベーススキーマの作成
  3. APIエンドポイントの実装
  4. フロントエンド画面の作成
  5. テストの作成と実行

実行計画を承認しますか？

○ 承認して実行
○ 拒否して中止
○ 詳細を表示
○ キャンセル (esc)
```

## 利点

1. **一貫性のあるUI**: 既存のツール承認と同じUIを使用
2. **再利用性**: 既存のコンポーネントとフローを活用
3. **ユーザー体験**: ユーザーは慣れ親しんだUIで操作可能
4. **保守性**: 既存のシステムと統合されているため保守が容易

## 今後の改善点

1. **詳細表示機能**: 計画の詳細をインラインで展開表示
2. **修正機能**: 計画を対話的に修正する機能
3. **履歴管理**: 承認/拒否の履歴を記録
4. **条件付き承認**: 特定の条件下で自動承認

## まとめ

ワークフロー承認システムは、既存のツール承認メカニズムを活用することで、統一されたユーザー体験を提供します。WorkflowToolクラスを通じて、既存のツールシステムにシームレスに統合され、MCPツールなどと同じ承認UIで操作できます。
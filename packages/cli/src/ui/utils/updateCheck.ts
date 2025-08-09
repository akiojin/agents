/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// 不要なimportを削除（バージョンチェック機能は無効化）

export async function checkForUpdates(): Promise<string | null> {
  // バージョンチェック機能を無効化
  // このプロジェクトはローカル専用のため、npmレジストリのチェックは不要
  return null;
}

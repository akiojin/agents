/**
 * Analyze Command - 簡易化版
 */

import { SlashCommand } from './types.js';

export const analyzeCommand: SlashCommand = {
  name: 'analyze',
  description: '分析コマンド（現在無効化中）',
  subCommands: [
    {
      name: 'read',
      description: 'ファイル読み取り（無効化中）',
      action: async () => {
        console.log('Analyze read command is temporarily disabled');
      }
    },
    {
      name: 'quality',
      description: 'コード品質分析（無効化中）',
      action: async () => {
        console.log('Analyze quality command is temporarily disabled');
      }
    },
    {
      name: 'symbol',
      description: 'シンボル分析（無効化中）',
      action: async () => {
        console.log('Analyze symbol command is temporarily disabled');
      }
    }
  ]
};
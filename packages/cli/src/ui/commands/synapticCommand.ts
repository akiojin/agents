/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SynapticMemoryDashboard } from '../components/SynapticMemoryDashboard.js';
import { CommandContext } from './types.js';

export interface SynapticCommandResult {
  type: 'synaptic_dashboard';
  component: React.ReactElement;
}

export function synapticCommand(
  args: string[],
  context: CommandContext,
): SynapticCommandResult {
  const { terminalSize } = context;
  
  const component = React.createElement(SynapticMemoryDashboard, {
    terminalWidth: terminalSize.columns,
    terminalHeight: terminalSize.rows,
  });

  return {
    type: 'synaptic_dashboard',
    component,
  };
}

export const synapticCommandConfig = {
  name: 'synaptic',
  description: 'シナプス記憶システムのダッシュボードを表示',
  usage: '/synaptic',
  examples: [
    '/synaptic - ダッシュボードを開く',
  ],
};
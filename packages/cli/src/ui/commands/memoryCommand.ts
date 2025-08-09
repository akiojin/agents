/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { getErrorMessage } from '@indenscale/open-gemini-cli-core';
import { MessageType } from '../types.js';
import { SlashCommand, SlashCommandActionReturn } from './types.js';

export const memoryCommand: SlashCommand = {
  name: 'memory',
  description: 'Commands for interacting with memory.',
  subCommands: [
    {
      name: 'show',
      description: 'Show the current memory contents.',
      action: async (context) => {
        const memoryContent = context.services.config?.getUserMemory() || '';
        const fileCount = context.services.config?.getGeminiMdFileCount() || 0;

        const messageContent =
          memoryContent.length > 0
            ? `Current memory content from ${fileCount} file(s):\n\n---\n${memoryContent}\n---`
            : 'Memory is currently empty.';

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: messageContent,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'add',
      description: 'Add content to the memory.',
      action: (context, args): SlashCommandActionReturn | void => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /memory add <text to remember>',
          };
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Attempting to save to memory: "${args.trim()}"`,
          },
          Date.now(),
        );

        return {
          type: 'tool',
          toolName: 'save_memory',
          toolArgs: { fact: args.trim() },
        };
      },
    },
    {
      name: 'refresh',
      description: 'Refresh the memory from the source.',
      action: async (context) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Refreshing memory from source files...',
          },
          Date.now(),
        );

        try {
          const result = await context.services.config?.refreshMemory();

          if (result) {
            const { memoryContent, fileCount } = result;
            const successMessage =
              memoryContent.length > 0
                ? `Memory refreshed successfully. Loaded ${memoryContent.length} characters from ${fileCount} file(s).`
                : 'Memory refreshed successfully. No memory content found.';

            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: successMessage,
              },
              Date.now(),
            );
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error refreshing memory: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
    // シナプス記憶システム統合
    {
      name: 'synaptic',
      description: 'Access synaptic memory system.',
      action: async (context) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Launching synaptic memory management interface...',
          },
          Date.now(),
        );

        // シナプス記憶システムは実装中
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'シナプス記憶管理機能は実装中です。',
          },
          Date.now(),
        );
      },
    },
    {
      name: 'network',
      description: 'Show memory network visualization.',
      action: async (context) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Displaying memory network visualization...',
          },
          Date.now(),
        );

        return {
          type: 'ui',
          component: 'SynapticVisualization',
          props: { mode: 'network' },
        };
      },
    },
    {
      name: 'search',
      description: 'Search memories using synaptic network.',
      action: (context, args): SlashCommandActionReturn | void => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /memory search <query>',
          };
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Searching synaptic memory network for: "${args.trim()}"`,
          },
          Date.now(),
        );

        return {
          type: 'tool',
          toolName: 'synaptic_search',
          toolArgs: { query: args.trim() },
        };
      },
    },
    {
      name: 'activate',
      description: 'Activate a specific memory in the network.',
      action: (context, args): SlashCommandActionReturn | void => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /memory activate <memory-id>',
          };
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Activating memory: ${args.trim()}`,
          },
          Date.now(),
        );

        return {
          type: 'tool',
          toolName: 'synaptic_activate',
          toolArgs: { memory_id: args.trim() },
        };
      },
    },
  ],
};

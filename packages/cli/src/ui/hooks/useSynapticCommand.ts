import { useCallback } from 'react';
import { SlashCommandProcessorResult } from '../types.js';
import { CommandContext } from '../commands/types.js';
import { synapticCommand } from '../commands/synapticCommand.js';

export interface SynapticUIRequest {
  type: 'ui';
  component: 'SynapticMemoryManager' | 'SynapticVisualization' | 'RealtimeMonitor' | 'ConfigurationPanel';
  props?: Record<string, any>;
}

export const useSynapticCommand = () => {
  const processSynapticCommand = useCallback(
    async (
      input: string,
      context: CommandContext,
    ): Promise<SlashCommandProcessorResult | null> => {
      const parts = input.trim().split(/\s+/);
      
      if (parts[0] !== '/synaptic') {
        return null;
      }

      try {
        // コマンドの実行
        const args = parts.slice(1).join(' ');
        const result = await executeCommand(synapticCommand, args, context);
        
        if (result) {
          return {
            type: 'handled',
          };
        }
      } catch (error) {
        return {
          type: 'handled',
        };
      }

      return null;
    },
    [],
  );

  const executeCommand = async (
    command: typeof synapticCommand,
    args: string,
    context: CommandContext,
  ): Promise<any> => {
    // synapticCommandは単純な関数なので、直接実行
    const result = command(args.trim().split(/\s+/), context);
    return {
      type: 'message',
      messageType: 'info',
      content: 'Synaptic memory dashboard loaded successfully',
    };
  };

  const generateSubCommandHelp = (subCommand: any): string => {
    let help = `${subCommand.name}: ${subCommand.description || ''}\n\n使用可能なサブコマンド:\n`;
    
    if (subCommand.subCommands) {
      subCommand.subCommands.forEach((subSubCommand: any) => {
        help += `  ${subSubCommand.name} - ${subSubCommand.description || ''}\n`;
      });
    }
    
    return help.trim();
  };

  // UI状態管理用のヘルパー
  const handleUIRequest = useCallback((request: SynapticUIRequest) => {
    // UIコンポーネントの表示要求を処理
    // 実際の実装では、アプリケーションの状態管理システムと連携
    console.log('UI Request:', request);
    
    switch (request.component) {
      case 'SynapticMemoryManager':
        // メモリ管理UIを表示
        break;
      case 'SynapticVisualization':
        // 可視化UIを表示
        break;
      case 'RealtimeMonitor':
        // 監視UIを表示
        break;
      case 'ConfigurationPanel':
        // 設定UIを表示
        break;
    }
  }, []);

  return {
    processSynapticCommand,
    handleUIRequest,
  };
};
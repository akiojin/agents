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
    const argParts = args.trim().split(/\s+/);
    
    if (argParts.length === 0 || argParts[0] === '') {
      // メインコマンドヘルプを表示
      const helpText = generateCommandHelp(command);
      return {
        type: 'message',
        messageType: 'info',
        content: helpText,
      };
    }

    const subCommandName = argParts[0];
    const subCommand = command.subCommands?.find(sc => sc.name === subCommandName);
    
    if (!subCommand) {
      return {
        type: 'message',
        messageType: 'error',
        content: `不明なサブコマンド: ${subCommandName}\n使用可能なサブコマンド: ${command.subCommands?.map(sc => sc.name).join(', ') || 'なし'}`,
      };
    }

    const subArgs = argParts.slice(1).join(' ');
    
    // サブサブコマンドの処理
    if (subCommand.subCommands && subArgs) {
      const subArgParts = subArgs.trim().split(/\s+/);
      const subSubCommandName = subArgParts[0];
      const subSubCommand = subCommand.subCommands.find(ssc => ssc.name === subSubCommandName);
      
      if (subSubCommand && subSubCommand.action) {
        const subSubArgs = subArgParts.slice(1).join(' ');
        return await subSubCommand.action(context, subSubArgs);
      } else if (subCommand.subCommands) {
        // サブサブコマンドヘルプを表示
        const helpText = generateSubCommandHelp(subCommand);
        return {
          type: 'message',
          messageType: 'info',
          content: helpText,
        };
      }
    }

    // サブコマンドの実行
    if (subCommand.action) {
      return await subCommand.action(context, subArgs);
    }

    return {
      type: 'message',
      messageType: 'error',
      content: `コマンド '${subCommandName}' にアクションが定義されていません`,
    };
  };

  const generateCommandHelp = (command: typeof synapticCommand): string => {
    let help = `${command.name}: ${command.description || ''}\n\n使用可能なサブコマンド:\n`;
    
    if (command.subCommands) {
      command.subCommands.forEach(subCommand => {
        help += `  ${subCommand.name} - ${subCommand.description || ''}\n`;
      });
    }
    
    return help.trim();
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
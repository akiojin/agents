/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandContext } from './types.js';
import { MessageType } from '../types.js';
import { getSessionManager } from '@indenscale/open-gemini-cli-core';
import { formatDistanceToNow } from 'date-fns';

/**
 * セッション管理コマンド
 */
export const sessionCommand: SlashCommand = {
  name: 'session',
  altName: 's',
  description: 'Manage conversation sessions (list, view, restore)',
  action: async (context: CommandContext, args: string) => {
    const { ui } = context;
    const sessionManager = getSessionManager();
    
    // コマンドの引数を解析
    const [subCommand, ...restArgs] = args.trim().split(/\s+/);
    
    switch (subCommand) {
      case 'list':
      case 'ls':
        await listSessions(ui, sessionManager);
        break;
        
      case 'view':
      case 'show':
        await viewSession(ui, sessionManager, restArgs[0]);
        break;
        
      case 'restore':
      case 'load':
        await restoreSession(ui, sessionManager, restArgs[0]);
        break;
        
      case 'current':
        await showCurrentSession(ui, sessionManager);
        break;
        
      default:
        ui.addItem({
          type: MessageType.ERROR,
          text: `Unknown session command: ${subCommand || '(empty)'}
Available commands:
  /session list - List all saved sessions
  /session view <id> - View session details
  /session restore <id> - Restore a session
  /session current - Show current session info`,
        }, Date.now());
    }
  },
};

/**
 * セッション一覧を表示
 */
async function listSessions(ui: any, sessionManager: any): Promise<void> {
  try {
    const sessions = await sessionManager.listSessions();
    
    if (sessions.length === 0) {
      ui.addItem({
        type: MessageType.INFO,
        text: 'No saved sessions found.',
      }, Date.now());
      return;
    }
    
    let output = `Found ${sessions.length} session(s):\n\n`;
    
    for (const session of sessions) {
      const timeAgo = formatDistanceToNow(new Date(session.startTime), { addSuffix: true });
      const duration = session.endTime 
        ? formatDistanceToNow(new Date(session.endTime), { includeSeconds: true })
        : 'ongoing';
      
      output += `📁 ${session.id}\n`;
      output += `   Started: ${timeAgo}\n`;
      output += `   Duration: ${duration}\n`;
      output += `   Messages: ${session.messageCount}\n`;
      output += `   Tokens: ${session.tokenCount}\n`;
      output += `   Compressed: ${session.compressed ? '✅' : '❌'}\n`;
      
      if (session.parentSessionId) {
        output += `   Parent: ${session.parentSessionId}\n`;
      }
      
      output += '\n';
    }
    
    ui.addItem({
      type: MessageType.INFO,
      text: output,
    }, Date.now());
  } catch (error) {
    ui.addItem({
      type: MessageType.ERROR,
      text: `Failed to list sessions: ${error}`,
    }, Date.now());
  }
}

/**
 * セッションの詳細を表示
 */
async function viewSession(ui: any, sessionManager: any, sessionId: string): Promise<void> {
  if (!sessionId) {
    ui.addItem({
      type: MessageType.ERROR,
      text: 'Please provide a session ID to view.',
    }, Date.now());
    return;
  }
  
  try {
    const sessionData = await sessionManager.loadSession(sessionId);
    
    if (!sessionData) {
      ui.addItem({
        type: MessageType.ERROR,
        text: `Session not found: ${sessionId}`,
      }, Date.now());
      return;
    }
    
    const { metadata, history } = sessionData;
    
    let output = `Session Details: ${sessionId}\n`;
    output += `${'='.repeat(50)}\n\n`;
    
    output += `Started: ${new Date(metadata.startTime).toLocaleString()}\n`;
    if (metadata.endTime) {
      output += `Ended: ${new Date(metadata.endTime).toLocaleString()}\n`;
    }
    output += `Messages: ${metadata.messageCount}\n`;
    output += `Tokens: ${metadata.tokenCount}\n`;
    output += `Compressed: ${metadata.compressed ? 'Yes' : 'No'}\n`;
    
    if (metadata.parentSessionId) {
      output += `Parent Session: ${metadata.parentSessionId}\n`;
    }
    
    if (metadata.summary) {
      output += `\nCompression Summary:\n${'-'.repeat(30)}\n`;
      output += metadata.summary.substring(0, 500);
      if (metadata.summary.length > 500) {
        output += '... (truncated)';
      }
      output += '\n';
    }
    
    output += `\nRecent Messages:\n${'-'.repeat(30)}\n`;
    
    // 最後の5メッセージを表示
    const recentMessages = history.slice(-5);
    for (const msg of recentMessages) {
      const role = msg.role === 'user' ? '👤 User' : '🤖 Model';
      const text = msg.parts?.[0]?.text || '(no text)';
      const preview = text.substring(0, 100);
      output += `${role}: ${preview}${text.length > 100 ? '...' : ''}\n`;
    }
    
    ui.addItem({
      type: MessageType.INFO,
      text: output,
    }, Date.now());
  } catch (error) {
    ui.addItem({
      type: MessageType.ERROR,
      text: `Failed to view session: ${error}`,
    }, Date.now());
  }
}

/**
 * セッションを復元
 */
async function restoreSession(ui: any, sessionManager: any, sessionId: string): Promise<void> {
  if (!sessionId) {
    ui.addItem({
      type: MessageType.ERROR,
      text: 'Please provide a session ID to restore.',
    }, Date.now());
    return;
  }
  
  try {
    const success = await sessionManager.restoreSession(sessionId);
    
    if (!success) {
      ui.addItem({
        type: MessageType.ERROR,
        text: `Failed to restore session: ${sessionId}`,
      }, Date.now());
      return;
    }
    
    ui.addItem({
      type: MessageType.INFO,
      text: `Session restored successfully: ${sessionId}\nThe conversation history has been loaded.`,
    }, Date.now());
    
    // 復元した履歴をChatに反映させる必要があるかもしれない
    // これは別途実装が必要
  } catch (error) {
    ui.addItem({
      type: MessageType.ERROR,
      text: `Failed to restore session: ${error}`,
    }, Date.now());
  }
}

/**
 * 現在のセッション情報を表示
 */
async function showCurrentSession(ui: any, sessionManager: any): Promise<void> {
  try {
    const session = sessionManager.getCurrentSession();
    
    let output = `Current Session: ${session.id}\n`;
    output += `${'='.repeat(50)}\n\n`;
    
    const timeAgo = formatDistanceToNow(new Date(session.startTime), { addSuffix: true });
    
    output += `Started: ${timeAgo}\n`;
    output += `Messages: ${session.messageCount}\n`;
    output += `Tokens: ${session.tokenCount}\n`;
    
    if (session.parentSessionId) {
      output += `Parent Session: ${session.parentSessionId}\n`;
      output += `(This session was created after compression)\n`;
    }
    
    ui.addItem({
      type: MessageType.INFO,
      text: output,
    }, Date.now());
  } catch (error) {
    ui.addItem({
      type: MessageType.ERROR,
      text: `Failed to get current session info: ${error}`,
    }, Date.now());
  }
}
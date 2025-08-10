#!/usr/bin/env node

/**
 * システムプロンプトを一時的に無効化するパッチ
 */

import fs from 'fs';
import path from 'path';

const filePath = path.join(process.cwd(), 'src/providers/gemini-adapter.ts');

// バックアップ作成
const backupPath = filePath + '.backup';
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(filePath, backupPath);
  console.log('✅ Backup created:', backupPath);
}

// ファイル読み込み
let content = fs.readFileSync(filePath, 'utf8');

// getSystemPrompt メソッドを修正してnullを返すように
const original = `private async getSystemPrompt(): Promise<string | null> {
    // Use the parent class system prompt if set
    if (this.systemPrompt) {
      return this.systemPrompt;
    }
    
    // Get system prompt from environment or configuration
    const envPrompt = process.env.AGENTS_SYSTEM_PROMPT;
    if (envPrompt) {
      return envPrompt;
    }

    // Use DeepAgents system prompt
    const { DEEP_AGENT_SYSTEM_PROMPT } = await import('../../packages/prompts/deep-agent-system.js');
    return DEEP_AGENT_SYSTEM_PROMPT;
  }`;

const patched = `private async getSystemPrompt(): Promise<string | null> {
    // Temporarily disabled to avoid context length issues
    return null;
    
    // Original code commented out:
    /*
    // Use the parent class system prompt if set
    if (this.systemPrompt) {
      return this.systemPrompt;
    }
    
    // Get system prompt from environment or configuration
    const envPrompt = process.env.AGENTS_SYSTEM_PROMPT;
    if (envPrompt) {
      return envPrompt;
    }

    // Use DeepAgents system prompt
    const { DEEP_AGENT_SYSTEM_PROMPT } = await import('../../packages/prompts/deep-agent-system.js');
    return DEEP_AGENT_SYSTEM_PROMPT;
    */
  }`;

if (content.includes(original)) {
  content = content.replace(original, patched);
  fs.writeFileSync(filePath, content);
  console.log('✅ System prompt disabled successfully');
  console.log('');
  console.log('To restore original:');
  console.log('  mv src/providers/gemini-adapter.ts.backup src/providers/gemini-adapter.ts');
} else {
  console.log('⚠️ Could not find the original getSystemPrompt method');
  console.log('The file may have been already modified or the format is different');
}
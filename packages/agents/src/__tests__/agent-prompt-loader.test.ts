/**
 * AgentPromptLoader のユニットテスト
 */

import { AgentPromptLoader, AgentPreset } from '../agent-prompt-loader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// モックの設定
jest.mock('fs');
jest.mock('os');

describe('AgentPromptLoader', () => {
  let loader: AgentPromptLoader;
  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockOs = os as jest.Mocked<typeof os>;

  beforeEach(() => {
    // シングルトンをリセット
    (AgentPromptLoader as any).instance = undefined;
    loader = AgentPromptLoader.getInstance();
    
    // モックのリセット
    jest.clearAllMocks();
    mockOs.homedir.mockReturnValue('/home/user');
  });

  describe('getInstance', () => {
    it('シングルトンインスタンスを返す', () => {
      const instance1 = AgentPromptLoader.getInstance();
      const instance2 = AgentPromptLoader.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('loadAllPresets', () => {
    const mockPresetContent = `---
name: test-agent
description: Test agent for unit tests
model: claude-3-haiku-20241022
tools: tool1, tool2
---

You are a test agent for unit testing purposes.`;

    const mockPresetContentNoModel = `---
name: simple-agent
description: Simple test agent
---

You are a simple test agent.`;

    beforeEach(() => {
      // ディレクトリの存在チェックをモック
      mockFs.existsSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('.git')) return true;
        if (pathStr.includes('.agents/agents')) return true;
        if (pathStr.includes('presets')) return true;
        return false;
      });

      // ディレクトリ読み込みをモック
      mockFs.readdirSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('/home/user/.agents/agents')) {
          return ['user-custom.md'];
        }
        if (pathStr.includes('.agents/agents')) {
          return ['project-custom.md'];
        }
        if (pathStr.includes('presets')) {
          return ['builtin-agent.md', 'another-agent.md'];
        }
        return [];
      });

      // ファイル読み込みをモック
      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        if (pathStr.includes('user-custom.md')) {
          return mockPresetContent.replace('test-agent', 'user-custom');
        }
        if (pathStr.includes('project-custom.md')) {
          return mockPresetContent.replace('test-agent', 'project-custom');
        }
        if (pathStr.includes('builtin-agent.md')) {
          return mockPresetContent.replace('test-agent', 'builtin-agent');
        }
        if (pathStr.includes('another-agent.md')) {
          return mockPresetContentNoModel;
        }
        return '';
      });
    });

    it('3つの場所からプリセットを読み込む', () => {
      loader.loadAllPresets();
      
      const presets = loader.getAllPresets();
      expect(presets.size).toBeGreaterThan(0);
      
      // 各場所から読み込みが試行されたことを確認
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('/home/user/.agents/agents')
      );
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('.agents/agents')
      );
      expect(mockFs.existsSync).toHaveBeenCalledWith(
        expect.stringContaining('presets')
      );
    });

    it('優先順位に従ってプリセットを上書きする', () => {
      // 同じ名前のプリセットがある場合のモック
      mockFs.readFileSync.mockImplementation((path: any) => {
        const pathStr = path.toString();
        // すべて同じ名前 'same-agent' で異なる説明
        if (pathStr.includes('user-custom.md')) {
          return `---
name: same-agent
description: User custom version
---
User custom prompt`;
        }
        if (pathStr.includes('project-custom.md')) {
          return `---
name: same-agent
description: Project custom version
---
Project custom prompt`;
        }
        if (pathStr.includes('builtin-agent.md')) {
          return `---
name: same-agent
description: Builtin version
---
Builtin prompt`;
        }
        return mockPresetContentNoModel;
      });

      loader.loadAllPresets();
      const preset = loader.getPreset('same-agent');
      
      // ユーザーカスタムが最優先
      expect(preset?.description).toBe('User custom version');
      expect(preset?.systemPrompt).toBe('User custom prompt');
    });

    it('モデルとツールの設定を正しく解析する', () => {
      loader.loadAllPresets();
      const preset = loader.getPreset('user-custom');
      
      expect(preset).toBeDefined();
      expect(preset?.model).toBe('claude-3-haiku-20241022');
      expect(preset?.tools).toEqual(['tool1', 'tool2']);
    });

    it('モデルとツールがない場合も正しく処理する', () => {
      loader.loadAllPresets();
      const preset = loader.getPreset('simple-agent');
      
      expect(preset).toBeDefined();
      expect(preset?.model).toBeUndefined();
      expect(preset?.tools).toBeUndefined();
    });
  });

  describe('getPreset', () => {
    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);
    });

    it('存在しないプリセットの場合undefinedを返す', () => {
      const preset = loader.getPreset('non-existent');
      expect(preset).toBeUndefined();
    });

    it('遅延読み込みを行う', () => {
      // 最初の呼び出しで読み込みが発生
      loader.getPreset('any-agent');
      expect(mockFs.existsSync).toHaveBeenCalled();
      
      // 2回目の呼び出しでは読み込みが発生しない
      const callCount = mockFs.existsSync.mock.calls.length;
      loader.getPreset('another-agent');
      expect(mockFs.existsSync).toHaveBeenCalledTimes(callCount);
    });
  });

  describe('recommendAgent', () => {
    beforeEach(() => {
      // テスト用のプリセットを設定
      const presets = new Map<string, AgentPreset>();
      presets.set('frontend-developer', {
        name: 'frontend-developer',
        description: 'Build React components and responsive layouts',
        systemPrompt: 'Frontend prompt'
      });
      presets.set('backend-architect', {
        name: 'backend-architect',
        description: 'Design RESTful APIs and database schemas',
        systemPrompt: 'Backend prompt'
      });
      presets.set('general-purpose', {
        name: 'general-purpose',
        description: 'General purpose agent for various tasks',
        systemPrompt: 'General prompt'
      });
      
      // プライベートプロパティに直接アクセス（テスト用）
      (loader as any).presets = presets;
      (loader as any).presetsLoaded = true;
    });

    it('タスク説明に基づいて適切なエージェントを推奨する', () => {
      const agent = loader.recommendAgent('Build a React component for user profile');
      expect(agent?.name).toBe('frontend-developer');
    });

    it('エージェント名が直接含まれる場合は優先する', () => {
      const agent = loader.recommendAgent('Use backend architect to design the API');
      expect(agent?.name).toBe('backend-architect');
    });

    it('マッチしない場合は汎用エージェントを返す', () => {
      const agent = loader.recommendAgent('Do something random');
      expect(agent?.name).toBe('general-purpose');
    });

    it('複数のキーワードがマッチする場合も適切に処理する', () => {
      const agent = loader.recommendAgent('Create RESTful APIs with proper database design');
      expect(agent?.name).toBe('backend-architect');
    });
  });

  describe('recommendAgentsForTasks', () => {
    beforeEach(() => {
      // テスト用のプリセットを設定
      const presets = new Map<string, AgentPreset>();
      presets.set('frontend-developer', {
        name: 'frontend-developer',
        description: 'Frontend development',
        systemPrompt: 'Frontend'
      });
      presets.set('backend-architect', {
        name: 'backend-architect',
        description: 'Backend development',
        systemPrompt: 'Backend'
      });
      presets.set('general-purpose', {
        name: 'general-purpose',
        description: 'General tasks',
        systemPrompt: 'General'
      });
      
      (loader as any).presets = presets;
      (loader as any).presetsLoaded = true;
    });

    it('複数のタスクに対して適切なエージェントを推奨する', () => {
      const tasks = [
        'Build React UI components',
        'Design backend API',
        'Write documentation'
      ];
      
      const recommendations = loader.recommendAgentsForTasks(tasks);
      
      expect(recommendations.size).toBe(3);
      expect(recommendations.get(tasks[0])?.name).toBe('frontend-developer');
      expect(recommendations.get(tasks[1])?.name).toBe('backend-architect');
      expect(recommendations.get(tasks[2])?.name).toBe('general-purpose');
    });

    it('同じエージェントが複数のタスクに推奨される場合も処理する', () => {
      const tasks = [
        'Create user interface',
        'Build dashboard components',
        'Implement responsive design'
      ];
      
      const recommendations = loader.recommendAgentsForTasks(tasks);
      
      expect(recommendations.size).toBe(3);
      // すべて frontend-developer が推奨される可能性
      for (const [task, agent] of recommendations.entries()) {
        expect(agent).toBeDefined();
      }
    });
  });

  describe('getPresetList', () => {
    beforeEach(() => {
      const presets = new Map<string, AgentPreset>();
      presets.set('agent1', {
        name: 'agent1',
        description: 'First agent',
        model: 'model1',
        systemPrompt: 'Prompt1'
      });
      presets.set('agent2', {
        name: 'agent2',
        description: 'Second agent',
        systemPrompt: 'Prompt2'
      });
      
      (loader as any).presets = presets;
      (loader as any).presetsLoaded = true;
    });

    it('プリセットのリストを返す', () => {
      const list = loader.getPresetList();
      
      expect(list).toHaveLength(2);
      expect(list).toContainEqual({
        name: 'agent1',
        description: 'First agent',
        model: 'model1'
      });
      expect(list).toContainEqual({
        name: 'agent2',
        description: 'Second agent',
        model: undefined
      });
    });
  });

  describe('reloadPresets', () => {
    it('プリセットをリロードする', () => {
      mockFs.existsSync.mockReturnValue(false);
      mockFs.readdirSync.mockReturnValue([]);
      
      // 初回読み込み
      loader.loadAllPresets();
      const firstCallCount = mockFs.existsSync.mock.calls.length;
      
      // リロード
      loader.reloadPresets();
      
      // 再度読み込みが発生
      expect(mockFs.existsSync.mock.calls.length).toBeGreaterThan(firstCallCount);
    });
  });
});
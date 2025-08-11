/**
 * AgentPromptLoader - 3段階優先順位でエージェントプリセットを読み込む
 * 
 * 読み込み優先順位:
 * 1. ~/.agents/agents/ - ユーザーホームのカスタムプリセット
 * 2. .agents/agents/ - プロジェクトルートのカスタムプリセット
 * 3. packages/agents/presets/ - ビルトインプリセット
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';

// エージェントプリセットの定義
export interface AgentPreset {
  name: string;
  description: string;
  model?: string;
  tools?: string[];
  systemPrompt: string;
}

// プリセットファイルのフロントマター
interface PresetFrontmatter {
  name: string;
  description: string;
  model?: string;
  tools?: string;
}

export class AgentPromptLoader {
  private static instance: AgentPromptLoader;
  private presets: Map<string, AgentPreset> = new Map();
  private projectRoot: string;
  private presetsLoaded: boolean = false;

  private constructor() {
    // プロジェクトルートを探す（.gitファイルまたはpackage.jsonがある場所）
    this.projectRoot = this.findProjectRoot();
  }

  // シングルトンインスタンスを取得
  public static getInstance(): AgentPromptLoader {
    if (!AgentPromptLoader.instance) {
      AgentPromptLoader.instance = new AgentPromptLoader();
    }
    return AgentPromptLoader.instance;
  }

  // プロジェクトルートを探す
  private findProjectRoot(): string {
    let dir = process.cwd();
    while (dir !== path.dirname(dir)) {
      if (fs.existsSync(path.join(dir, '.git')) || 
          fs.existsSync(path.join(dir, 'package.json'))) {
        return dir;
      }
      dir = path.dirname(dir);
    }
    return process.cwd();
  }

  // プリセットファイルを解析
  private parsePresetFile(filePath: string): AgentPreset | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // フロントマターを抽出
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      if (!frontmatterMatch) {
        console.warn(`プリセットファイルのフォーマットが不正: ${filePath}`);
        return null;
      }

      const frontmatter = yaml.load(frontmatterMatch[1]) as PresetFrontmatter;
      const systemPrompt = frontmatterMatch[2].trim();

      if (!frontmatter.name || !frontmatter.description) {
        console.warn(`必須フィールドが不足: ${filePath}`);
        return null;
      }

      return {
        name: frontmatter.name,
        description: frontmatter.description,
        model: frontmatter.model,
        tools: frontmatter.tools ? frontmatter.tools.split(',').map(t => t.trim()) : undefined,
        systemPrompt
      };
    } catch (error) {
      console.error(`プリセットファイルの読み込みエラー: ${filePath}`, error);
      return null;
    }
  }

  // ディレクトリからプリセットを読み込む
  private loadPresetsFromDirectory(dirPath: string, priority: number): void {
    if (!fs.existsSync(dirPath)) {
      console.debug(`プリセットディレクトリが存在しません: ${dirPath}`);
      return;
    }

    try {
      const files = fs.readdirSync(dirPath);
      const mdFiles = files.filter(f => f.endsWith('.md'));

      for (const file of mdFiles) {
        const filePath = path.join(dirPath, file);
        const preset = this.parsePresetFile(filePath);
        
        if (preset) {
          // 優先順位が高いものでのみ上書き
          if (!this.presets.has(preset.name)) {
            this.presets.set(preset.name, preset);
            console.debug(`プリセットロード [優先度${priority}]: ${preset.name} from ${filePath}`);
          } else {
            console.debug(`プリセットスキップ（既に高優先度で存在）: ${preset.name} from ${filePath}`);
          }
        }
      }
    } catch (error) {
      console.error(`ディレクトリ読み込みエラー: ${dirPath}`, error);
    }
  }

  // すべてのプリセットを読み込む
  public loadAllPresets(): void {
    if (this.presetsLoaded) {
      return;
    }

    console.log('エージェントプリセットを読み込み中...');
    
    // 優先順位1: ユーザーホームのカスタムプリセット
    const userHomePresets = path.join(os.homedir(), '.agents', 'agents');
    this.loadPresetsFromDirectory(userHomePresets, 1);

    // 優先順位2: プロジェクトルートのカスタムプリセット
    const projectPresets = path.join(this.projectRoot, '.agents', 'agents');
    this.loadPresetsFromDirectory(projectPresets, 2);

    // 優先順位3: ビルトインプリセット
    const builtinPresets = path.join(__dirname, '..', 'presets');
    this.loadPresetsFromDirectory(builtinPresets, 3);

    this.presetsLoaded = true;
    console.log(`${this.presets.size}個のエージェントプリセットを読み込みました`);
  }

  // 特定のエージェントプリセットを取得
  public getPreset(name: string): AgentPreset | undefined {
    if (!this.presetsLoaded) {
      this.loadAllPresets();
    }
    return this.presets.get(name);
  }

  // すべてのプリセットを取得
  public getAllPresets(): Map<string, AgentPreset> {
    if (!this.presetsLoaded) {
      this.loadAllPresets();
    }
    return new Map(this.presets);
  }

  // プリセット名のリストを取得
  public getPresetNames(): string[] {
    if (!this.presetsLoaded) {
      this.loadAllPresets();
    }
    return Array.from(this.presets.keys());
  }

  // プリセットの説明付きリストを取得
  public getPresetList(): Array<{ name: string; description: string; model?: string }> {
    if (!this.presetsLoaded) {
      this.loadAllPresets();
    }
    return Array.from(this.presets.values()).map(preset => ({
      name: preset.name,
      description: preset.description,
      model: preset.model
    }));
  }

  // プリセットをリロード（開発・デバッグ用）
  public reloadPresets(): void {
    this.presets.clear();
    this.presetsLoaded = false;
    this.loadAllPresets();
  }

  // タスクに最適なエージェントを推奨
  public recommendAgent(taskDescription: string): AgentPreset | undefined {
    if (!this.presetsLoaded) {
      this.loadAllPresets();
    }

    // タスク説明に基づいて最適なエージェントを選択するロジック
    const taskLower = taskDescription.toLowerCase();
    
    // キーワードマッチングによる推奨
    for (const [name, preset] of this.presets.entries()) {
      const descLower = preset.description.toLowerCase();
      
      // タスク説明にエージェント名が含まれる場合
      if (taskLower.includes(name.replace('-', ' '))) {
        return preset;
      }
      
      // エージェントの説明に基づくマッチング
      const keywords = descLower.split(/\s+/);
      const matchCount = keywords.filter(keyword => 
        keyword.length > 3 && taskLower.includes(keyword)
      ).length;
      
      // 一定以上のキーワードマッチがある場合
      if (matchCount >= 3) {
        return preset;
      }
    }

    // デフォルトは汎用エージェント
    return this.presets.get('general-purpose');
  }

  // 複数のタスクに対して並列実行可能なエージェントを推奨
  public recommendAgentsForTasks(tasks: string[]): Map<string, AgentPreset> {
    const recommendations = new Map<string, AgentPreset>();
    
    for (const task of tasks) {
      const agent = this.recommendAgent(task);
      if (agent) {
        // 同じエージェントが複数のタスクに推奨される場合もある
        recommendations.set(task, agent);
      }
    }
    
    return recommendations;
  }
}

// エクスポート用のヘルパー関数
export function loadAgentPresets(): Map<string, AgentPreset> {
  const loader = AgentPromptLoader.getInstance();
  return loader.getAllPresets();
}

export function getAgentPreset(name: string): AgentPreset | undefined {
  const loader = AgentPromptLoader.getInstance();
  return loader.getPreset(name);
}

export function recommendAgentForTask(task: string): AgentPreset | undefined {
  const loader = AgentPromptLoader.getInstance();
  return loader.recommendAgent(task);
}
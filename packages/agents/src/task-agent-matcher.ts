/**
 * TaskAgentMatcher - タスクを分析して最適なエージェントを選択
 * 
 * 機能:
 * - タスクの内容を分析
 * - 最適なエージェントを推奨
 * - 並列実行可能なタスクをグループ化
 * - タスクの依存関係を解析
 */

import { AgentPromptLoader, AgentPreset } from './agent-prompt-loader';

// タスクの定義
export interface Task {
  id: string;
  description: string;
  type?: string;
  dependencies?: string[];  // 他のタスクIDへの依存
  priority?: number;
  metadata?: Record<string, any>;
}

// タスクとエージェントのマッチング結果
export interface TaskAgentMatch {
  taskId: string;
  task: Task;
  agent: AgentPreset;
  confidence: number;  // マッチングの信頼度 (0-1)
  reasoning?: string;
}

// 並列実行グループ
export interface ParallelExecutionGroup {
  groupId: string;
  tasks: TaskAgentMatch[];
  canRunInParallel: boolean;
  dependencies?: string[];  // このグループが依存する他のグループID
}

// エージェントの専門分野定義
const AGENT_SPECIALTIES: Record<string, string[]> = {
  'frontend-developer': ['react', 'ui', 'component', 'css', 'html', 'responsive', 'frontend', 'layout', 'design'],
  'backend-architect': ['api', 'database', 'backend', 'server', 'rest', 'graphql', 'microservice', 'schema'],
  'devops-troubleshooter': ['deploy', 'docker', 'kubernetes', 'ci/cd', 'pipeline', 'production', 'monitoring'],
  'security-auditor': ['security', 'vulnerability', 'auth', 'encryption', 'owasp', 'penetration', 'audit'],
  'performance-engineer': ['performance', 'optimization', 'speed', 'cache', 'profiling', 'bottleneck', 'latency'],
  'test-automator': ['test', 'unit', 'integration', 'e2e', 'coverage', 'jest', 'pytest', 'testing'],
  'data-scientist': ['data', 'analysis', 'sql', 'query', 'bigquery', 'statistics', 'metrics'],
  'ai-engineer': ['llm', 'rag', 'embedding', 'vector', 'prompt', 'ai', 'ml', 'neural'],
  'cloud-architect': ['aws', 'azure', 'gcp', 'cloud', 'infrastructure', 'terraform', 'scaling'],
  'unity-developer': ['unity', 'game', 'c#', 'vcontainer', 'unitask', 'prefab', 'shader'],
  'unreal-developer': ['unreal', 'ue5', 'blueprint', 'c++', 'gameplay', 'animation', 'physics'],
};

export class TaskAgentMatcher {
  private static instance: TaskAgentMatcher;
  private agentLoader: AgentPromptLoader;
  private specialtyCache: Map<string, string[]> = new Map();

  private constructor() {
    this.agentLoader = AgentPromptLoader.getInstance();
    this.initializeSpecialtyCache();
  }

  // シングルトンインスタンスを取得
  public static getInstance(): TaskAgentMatcher {
    if (!TaskAgentMatcher.instance) {
      TaskAgentMatcher.instance = new TaskAgentMatcher();
    }
    return TaskAgentMatcher.instance;
  }

  // 専門分野キャッシュを初期化
  private initializeSpecialtyCache(): void {
    // 静的定義をキャッシュに追加
    for (const [agent, keywords] of Object.entries(AGENT_SPECIALTIES)) {
      this.specialtyCache.set(agent, keywords);
    }

    // 動的にロードされたエージェントの説明からキーワードを抽出
    const presets = this.agentLoader.getAllPresets();
    for (const [name, preset] of presets.entries()) {
      if (!this.specialtyCache.has(name)) {
        const keywords = this.extractKeywords(preset.description + ' ' + preset.systemPrompt);
        this.specialtyCache.set(name, keywords);
      }
    }
  }

  // テキストからキーワードを抽出
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['with', 'from', 'that', 'this', 'have', 'will', 'your', 'when'].includes(word));
    
    // 重複を除去
    return [...new Set(words)];
  }

  // タスクとエージェントのマッチングスコアを計算
  private calculateMatchScore(task: Task, agentName: string): number {
    const taskText = (task.description + ' ' + (task.type || '')).toLowerCase();
    const keywords = this.specialtyCache.get(agentName) || [];
    
    if (keywords.length === 0) return 0;

    // キーワードマッチング
    let matchCount = 0;
    let totalWeight = 0;

    for (const keyword of keywords) {
      if (taskText.includes(keyword)) {
        // より長いキーワードは重み付けを高くする
        const weight = keyword.length / 10;
        matchCount += weight;
        totalWeight += 1;
      }
    }

    // エージェント名が直接含まれる場合はボーナス
    if (taskText.includes(agentName.replace('-', ' '))) {
      matchCount += 2;
      totalWeight += 2;
    }

    // タスクタイプとの一致
    if (task.type && agentName.includes(task.type)) {
      matchCount += 1.5;
      totalWeight += 1.5;
    }

    // スコアを0-1の範囲に正規化
    const score = totalWeight > 0 ? matchCount / (totalWeight * 1.5) : 0;
    return Math.min(1, score);
  }

  // 単一タスクに最適なエージェントを選択
  public matchTask(task: Task): TaskAgentMatch {
    const presets = this.agentLoader.getAllPresets();
    let bestMatch: TaskAgentMatch | null = null;
    let bestScore = 0;

    for (const [name, preset] of presets.entries()) {
      const score = this.calculateMatchScore(task, name);
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          taskId: task.id,
          task,
          agent: preset,
          confidence: score,
          reasoning: `Matched based on keywords and task description. Confidence: ${(score * 100).toFixed(1)}%`
        };
      }
    }

    // マッチが見つからない場合はgeneral-purposeを使用
    if (!bestMatch || bestScore < 0.1) {
      const generalAgent = this.agentLoader.getPreset('general-purpose');
      bestMatch = {
        taskId: task.id,
        task,
        agent: generalAgent || {
          name: 'general-purpose',
          description: 'General purpose agent',
          systemPrompt: 'You are a general purpose assistant.',
        },
        confidence: 0.5,
        reasoning: 'No specific match found, using general-purpose agent'
      };
    }

    return bestMatch;
  }

  // 複数タスクに対してエージェントをマッチング
  public matchTasks(tasks: Task[]): TaskAgentMatch[] {
    return tasks.map(task => this.matchTask(task));
  }

  // タスクの依存関係を解析
  private analyzeDependencies(tasks: Task[]): Map<string, Set<string>> {
    const dependencies = new Map<string, Set<string>>();
    
    for (const task of tasks) {
      if (!dependencies.has(task.id)) {
        dependencies.set(task.id, new Set());
      }
      
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          dependencies.get(task.id)?.add(dep);
        }
      }
    }
    
    return dependencies;
  }

  // 並列実行可能なタスクをグループ化
  public groupTasksForParallelExecution(tasks: Task[]): ParallelExecutionGroup[] {
    const matches = this.matchTasks(tasks);
    const dependencies = this.analyzeDependencies(tasks);
    const groups: ParallelExecutionGroup[] = [];
    const processed = new Set<string>();
    let groupCounter = 0;

    // 依存関係のないタスクを最初のグループに
    const noDependencyTasks = matches.filter(match => 
      !dependencies.get(match.taskId)?.size && !processed.has(match.taskId)
    );
    
    if (noDependencyTasks.length > 0) {
      groups.push({
        groupId: `group-${groupCounter++}`,
        tasks: noDependencyTasks,
        canRunInParallel: true,
        dependencies: []
      });
      
      noDependencyTasks.forEach(match => processed.add(match.taskId));
    }

    // 依存関係を持つタスクを順次グループ化
    while (processed.size < tasks.length) {
      const nextBatch: TaskAgentMatch[] = [];
      
      for (const match of matches) {
        if (processed.has(match.taskId)) continue;
        
        const taskDeps = dependencies.get(match.taskId) || new Set();
        const allDepsProcessed = Array.from(taskDeps).every(dep => processed.has(dep));
        
        if (allDepsProcessed) {
          nextBatch.push(match);
        }
      }
      
      if (nextBatch.length > 0) {
        // 同じエージェントを使うタスクはシーケンシャルに実行
        const agentGroups = new Map<string, TaskAgentMatch[]>();
        
        for (const match of nextBatch) {
          const agentName = match.agent.name;
          if (!agentGroups.has(agentName)) {
            agentGroups.set(agentName, []);
          }
          agentGroups.get(agentName)?.push(match);
        }
        
        // 異なるエージェントのタスクは並列実行可能
        const parallelTasks: TaskAgentMatch[] = [];
        const sequentialGroups: TaskAgentMatch[][] = [];
        
        for (const [agentName, agentTasks] of agentGroups.entries()) {
          if (agentTasks.length === 1) {
            parallelTasks.push(agentTasks[0]);
          } else {
            sequentialGroups.push(agentTasks);
          }
        }
        
        // 並列実行可能なタスクをグループ化
        if (parallelTasks.length > 0) {
          groups.push({
            groupId: `group-${groupCounter++}`,
            tasks: parallelTasks,
            canRunInParallel: true,
            dependencies: groups.slice(-1).map(g => g.groupId)
          });
          
          parallelTasks.forEach(match => processed.add(match.taskId));
        }
        
        // シーケンシャルタスクを個別グループに
        for (const seqTasks of sequentialGroups) {
          for (const task of seqTasks) {
            groups.push({
              groupId: `group-${groupCounter++}`,
              tasks: [task],
              canRunInParallel: false,
              dependencies: groups.slice(-1).map(g => g.groupId)
            });
            
            processed.add(task.taskId);
          }
        }
      } else {
        // 循環依存がある場合は残りのタスクを強制的に処理
        const remaining = matches.filter(m => !processed.has(m.taskId));
        if (remaining.length > 0) {
          groups.push({
            groupId: `group-${groupCounter++}`,
            tasks: remaining,
            canRunInParallel: false,
            dependencies: []
          });
          
          remaining.forEach(match => processed.add(match.taskId));
        }
        break;
      }
    }

    return groups;
  }

  // タスクの優先順位に基づいてソート
  public prioritizeTasks(tasks: Task[]): Task[] {
    return [...tasks].sort((a, b) => {
      // 優先度が明示的に設定されている場合
      if (a.priority !== undefined && b.priority !== undefined) {
        return b.priority - a.priority;
      }
      
      // 依存関係の数が少ないタスクを優先
      const aDeps = (a.dependencies || []).length;
      const bDeps = (b.dependencies || []).length;
      
      return aDeps - bDeps;
    });
  }

  // 推奨実行計画を生成
  public generateExecutionPlan(tasks: Task[]): {
    groups: ParallelExecutionGroup[];
    estimatedTime?: number;
    totalAgents: number;
    agentUtilization: Map<string, number>;
  } {
    const prioritized = this.prioritizeTasks(tasks);
    const groups = this.groupTasksForParallelExecution(prioritized);
    
    // エージェント利用率を計算
    const agentUtilization = new Map<string, number>();
    let totalAgents = new Set<string>();
    
    for (const group of groups) {
      for (const match of group.tasks) {
        const agentName = match.agent.name;
        totalAgents.add(agentName);
        agentUtilization.set(agentName, (agentUtilization.get(agentName) || 0) + 1);
      }
    }
    
    return {
      groups,
      totalAgents: totalAgents.size,
      agentUtilization
    };
  }
}
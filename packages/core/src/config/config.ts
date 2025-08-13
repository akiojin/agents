/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as path from 'node:path';
import process from 'node:process';
import {
  AuthType,
  ContentGeneratorConfig,
  createContentGeneratorConfig,
} from '../core/contentGenerator.js';
import { clearAuthEnvironmentVariables } from '../code_assist/oauth2.js';
import { UserTierId } from '../code_assist/types.js';
import { ToolRegistry } from '../tools/tool-registry.js';
import { LSTool } from '../tools/ls.js';
import { ReadFileTool } from '../tools/read-file.js';
import { GrepTool } from '../tools/grep.js';
import { GlobTool } from '../tools/glob.js';
import { EditTool } from '../tools/edit.js';
import { ShellTool } from '../tools/shell.js';
import { WriteFileTool } from '../tools/write-file.js';
import { WebFetchTool } from '../tools/web-fetch.js';
import { ReadManyFilesTool } from '../tools/read-many-files.js';
import {
  setGeminiMdFilename,
  AGENTS_CONFIG_DIR as GEMINI_DIR,
} from '../tools/memoryTool.js';
import {
  SaveMemoryTool,
  SearchMemoryTool,
  MemoryFeedbackTool,
  MemoryStatsTool,
} from '../tools/memory-tool.js';
import { WebSearchTool } from '../tools/web-search.js';
import { TodoWriteTool } from '../tools/todo-write-tool.js';
import { IntelligentAnalysisTool } from '../tools/intelligent-analysis.js';
import { PlanCompleteTool } from '../tools/plan-complete-tool.js';
import { GeminiClient } from '../core/client.js';
import { FileDiscoveryService } from '../services/fileDiscoveryService.js';
import { GitService } from '../services/gitService.js';
import { FileParserService } from '../services/fileParserService.js';
import { CompositeVLMService } from '../services/vlmService.js';
import { loadServerHierarchicalMemory } from '../utils/memoryDiscovery.js';
import { getProjectTempDir } from '../utils/paths.js';
import {
  initializeTelemetry,
  DEFAULT_TELEMETRY_TARGET,
  DEFAULT_OTLP_ENDPOINT,
  TelemetryTarget,
  StartSessionEvent,
} from '../telemetry/index.js';
import {
  DEFAULT_AGENTS_EMBEDDING_MODEL,
  DEFAULT_AGENTS_FLASH_MODEL,
} from './models.js';
import { ClearcutLogger } from '../telemetry/clearcut-logger/clearcut-logger.js';

export enum ApprovalMode {
  DEFAULT = 'default',
  AUTO_EDIT = 'autoEdit',
  YOLO = 'yolo',
}

export interface AccessibilitySettings {
  disableLoadingPhrases?: boolean;
}

export interface BugCommandSettings {
  urlTemplate: string;
}

export interface SummarizeToolOutputSettings {
  tokenBudget?: number;
}

export interface TelemetrySettings {
  enabled?: boolean;
  target?: TelemetryTarget;
  otlpEndpoint?: string;
  logPrompts?: boolean;
}

export interface ActiveExtension {
  name: string;
  version: string;
}

export class MCPServerConfig {
  constructor(
    // For stdio transport
    readonly command?: string,
    readonly args?: string[],
    readonly env?: Record<string, string>,
    readonly cwd?: string,
    // For sse transport
    readonly url?: string,
    // For streamable http transport
    readonly httpUrl?: string,
    readonly headers?: Record<string, string>,
    // For websocket transport
    readonly tcp?: string,
    // Common
    readonly timeout?: number,
    readonly trust?: boolean,
    // Metadata
    readonly description?: string,
    readonly includeTools?: string[],
    readonly excludeTools?: string[],
  ) {}
}

export interface SandboxConfig {
  command: 'docker' | 'podman' | 'sandbox-exec';
  image: string;
}

export type FlashFallbackHandler = (
  currentModel: string,
  fallbackModel: string,
  error?: unknown,
) => Promise<boolean | string | null>;

export interface ConfigParameters {
  authType?: AuthType;
  sessionId: string;
  embeddingModel?: string;
  sandbox?: SandboxConfig;
  targetDir: string;
  debugMode: boolean;
  question?: string;
  fullContext?: boolean;
  coreTools?: string[];
  excludeTools?: string[];
  toolDiscoveryCommand?: string;
  toolCallCommand?: string;
  mcpServerCommand?: string;
  mcpServers?: Record<string, MCPServerConfig>;
  userMemory?: string;
  geminiMdFileCount?: number;
  approvalMode?: ApprovalMode;
  showMemoryUsage?: boolean;
  contextFileName?: string | string[];
  accessibility?: AccessibilitySettings;
  telemetry?: TelemetrySettings;
  usageStatisticsEnabled?: boolean;
  fileFiltering?: {
    respectGitIgnore?: boolean;
    enableRecursiveFileSearch?: boolean;
  };
  checkpointing?: boolean;
  proxy?: string;
  cwd: string;
  fileDiscoveryService?: FileDiscoveryService;
  bugCommand?: BugCommandSettings;
  model: string;
  extensionContextFilePaths?: string[];
  maxSessionTurns?: number;
  listExtensions?: boolean;
  activeExtensions?: ActiveExtension[];
  noBrowser?: boolean;
  summarizeToolOutput?: Record<string, SummarizeToolOutputSettings>;
  ideMode?: boolean;
}

export class Config {
  private toolRegistry!: ToolRegistry;
  private readonly sessionId: string;
  private contentGeneratorConfig!: ContentGeneratorConfig;
  private readonly embeddingModel: string;
  private readonly sandbox: SandboxConfig | undefined;
  private readonly targetDir: string;
  private readonly debugMode: boolean;
  private readonly question: string | undefined;
  private readonly fullContext: boolean;
  private readonly coreTools: string[] | undefined;
  private readonly excludeTools: string[] | undefined;
  private readonly toolDiscoveryCommand: string | undefined;
  private readonly toolCallCommand: string | undefined;
  private readonly mcpServerCommand: string | undefined;
  private readonly mcpServers: Record<string, MCPServerConfig> | undefined;
  private userMemory: string;
  private geminiMdFileCount: number;
  private approvalMode: ApprovalMode;
  private readonly showMemoryUsage: boolean;
  private readonly accessibility: AccessibilitySettings;
  private readonly telemetrySettings: TelemetrySettings;
  private readonly usageStatisticsEnabled: boolean;
  private geminiClient!: GeminiClient;
  private readonly fileFiltering: {
    respectGitIgnore: boolean;
    enableRecursiveFileSearch: boolean;
  };
  private fileDiscoveryService: FileDiscoveryService | null = null;
  private gitService: GitService | undefined = undefined;
  private fileParserService: FileParserService | null = null;
  private readonly checkpointing: boolean;
  private readonly proxy: string | undefined;
  private readonly cwd: string;
  private readonly bugCommand: BugCommandSettings | undefined;
  private readonly model: string;
  private readonly extensionContextFilePaths: string[];
  private readonly noBrowser: boolean;
  private readonly ideMode: boolean;
  private modelSwitchedDuringSession: boolean = false;
  private readonly maxSessionTurns: number;
  private readonly listExtensions: boolean;
  private readonly _activeExtensions: ActiveExtension[];
  flashFallbackHandler?: FlashFallbackHandler;
  private quotaErrorOccurred: boolean = false;
  private readonly summarizeToolOutput:
    | Record<string, SummarizeToolOutputSettings>
    | undefined;
  
  // プランモード管理用の追加プロパティ
  private agentMode: 'idle' | 'planning' | 'execution' = 'idle';
  private planModeToolRegistry?: ToolRegistry;
  private normalToolRegistry?: ToolRegistry;

  constructor(params: ConfigParameters) {
    this.sessionId = params.sessionId;
    this.embeddingModel =
      params.embeddingModel ?? DEFAULT_AGENTS_EMBEDDING_MODEL;
    this.sandbox = params.sandbox;
    this.targetDir = path.resolve(params.targetDir);
    this.debugMode = params.debugMode;
    this.question = params.question;
    this.fullContext = params.fullContext ?? false;
    this.coreTools = params.coreTools;
    this.excludeTools = params.excludeTools;
    this.toolDiscoveryCommand = params.toolDiscoveryCommand;
    this.toolCallCommand = params.toolCallCommand;
    this.mcpServerCommand = params.mcpServerCommand;
    this.mcpServers = params.mcpServers;
    this.userMemory = params.userMemory ?? '';
    this.geminiMdFileCount = params.geminiMdFileCount ?? 0;
    this.approvalMode = params.approvalMode ?? ApprovalMode.DEFAULT;
    this.showMemoryUsage = params.showMemoryUsage ?? false;
    this.accessibility = params.accessibility ?? {};
    this.telemetrySettings = {
      enabled: params.telemetry?.enabled ?? false,
      target: params.telemetry?.target ?? DEFAULT_TELEMETRY_TARGET,
      otlpEndpoint: params.telemetry?.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT,
      logPrompts: params.telemetry?.logPrompts ?? true,
    };
    this.usageStatisticsEnabled = params.usageStatisticsEnabled ?? true;

    this.fileFiltering = {
      respectGitIgnore: params.fileFiltering?.respectGitIgnore ?? true,
      enableRecursiveFileSearch:
        params.fileFiltering?.enableRecursiveFileSearch ?? true,
    };
    this.checkpointing = params.checkpointing ?? false;
    this.proxy = params.proxy;
    this.cwd = params.cwd ?? process.cwd();
    this.fileDiscoveryService = params.fileDiscoveryService ?? null;
    this.bugCommand = params.bugCommand;
    this.model = params.model;
    this.extensionContextFilePaths = params.extensionContextFilePaths ?? [];
    this.maxSessionTurns = params.maxSessionTurns ?? -1;
    this.listExtensions = params.listExtensions ?? false;
    this._activeExtensions = params.activeExtensions ?? [];
    this.noBrowser = params.noBrowser ?? false;
    this.summarizeToolOutput = params.summarizeToolOutput;
    this.ideMode = params.ideMode ?? false;

    if (params.contextFileName) {
      setGeminiMdFilename(params.contextFileName);
    }

    // Initialize contentGeneratorConfig if authType is provided
    if (params.authType) {
      // Initialize contentGeneratorConfig
      this.contentGeneratorConfig = createContentGeneratorConfig(
        this,
        params.authType,
      );
    } else {
      // No authType provided, skipping createContentGeneratorConfig
    }
    
    // Initialize GeminiClient
    this.geminiClient = new GeminiClient(this);

    if (this.telemetrySettings.enabled) {
      initializeTelemetry(this);
    }

    if (this.getUsageStatisticsEnabled()) {
      ClearcutLogger.getInstance(this)?.logStartSessionEvent(
        new StartSessionEvent(this),
      );
    } else {
      console.log('Data collection is disabled.');
    }
  }

  async initialize(): Promise<void> {
    console.log('[Config] initialize() called - starting config initialization');
    // Initialize centralized services
    // Initialize centralized FileDiscoveryService
    this.getFileService();
    if (this.getCheckpointingEnabled()) {
      await this.getGitService();
    }
    console.log('[Config] Creating tool registry...');
    this.toolRegistry = await this.createToolRegistry();
    console.log('[Config] Tool registry created successfully');
    
    // plan_completeツールの登録確認（バックアップ対応）
    const allTools = this.toolRegistry.getAllTools();
    const planCompleteFound = allTools.find((t: any) => t.name === 'plan_complete');
    console.log('[Config] plan_complete tool registration check: found =', !!planCompleteFound);
    
    if (!planCompleteFound) {
      console.warn('[Config] plan_complete tool not found after registry creation - attempting fallback registration');
      try {
        const planCompleteInstance = new PlanCompleteTool();
        this.toolRegistry.registerTool(planCompleteInstance);
        console.log('[Config] plan_complete tool fallback registration successful');
      } catch (error) {
        console.error('[Config] CRITICAL: Failed to register plan_complete tool via fallback:', error);
      }
    } else {
      console.log('[Config] plan_complete tool successfully registered via normal flow');
    }
    
    // Initialize GeminiClient with contentGeneratorConfig if available
    if (this.contentGeneratorConfig && this.geminiClient) {
      // Initialize GeminiClient with contentGeneratorConfig
      await this.geminiClient.initialize(this.contentGeneratorConfig);
    } else {
      // Skipping GeminiClient initialization
    }
  }

  async refreshAuth(authMethod: AuthType) {
    // Clear any existing content generator to prevent state leakage
    if (this.geminiClient) {
      (this as any).geminiClient = undefined;
    }

    // Reset model to default when switching auth methods
    this.resetModelToDefault();

    this.contentGeneratorConfig = createContentGeneratorConfig(
      this,
      authMethod,
    );

    this.geminiClient = new GeminiClient(this);
    await this.geminiClient.initialize(this.contentGeneratorConfig);

    // Reset the session flag since we're explicitly changing auth and using default model
    this.modelSwitchedDuringSession = false;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getContentGeneratorConfig(): ContentGeneratorConfig {
    return this.contentGeneratorConfig;
  }

  getModel(): string {
    // If contentGeneratorConfig is available, use it
    if (this.contentGeneratorConfig?.model) {
      // Verbose logging disabled for getModel() to reduce noise
      return this.contentGeneratorConfig.model;
    }
    
    // Fallback: check if this is OPENAI_COMPATIBLE auth and use environment variables
    if (this.contentGeneratorConfig?.authType === AuthType.OPENAI_COMPATIBLE) {
      const envModel = process.env.OPENAI_MODEL || process.env.LOCAL_LLM_MODEL;
      if (envModel) {
        // Verbose logging disabled
        return envModel;
      }
    }
    
    // Final fallback to initial model
    // Verbose logging disabled
    return this.model;
  }

  setModel(newModel: string): void {
    if (this.contentGeneratorConfig) {
      this.contentGeneratorConfig.model = newModel;
      this.modelSwitchedDuringSession = true;
    }
  }

  isModelSwitchedDuringSession(): boolean {
    return this.modelSwitchedDuringSession;
  }

  resetModelToDefault(): void {
    if (this.contentGeneratorConfig) {
      this.contentGeneratorConfig.model = this.model; // Reset to the original default model
      this.modelSwitchedDuringSession = false;
    }
  }

  setFlashFallbackHandler(handler: FlashFallbackHandler): void {
    this.flashFallbackHandler = handler;
  }

  cleanup(): void {
    // Clean up resources and reset state to prevent hanging processes
    // Note: Using type assertion to safely clear these properties during cleanup
    // This is safe because cleanup is only called during app termination
    (this as any).geminiClient = undefined;
    (this as any).contentGeneratorConfig = undefined;
    this.modelSwitchedDuringSession = false;
    
    // During cleanup (app termination), we can safely clear all auth env vars
    // since the process is ending anyway
    clearAuthEnvironmentVariables();
  }

  getMaxSessionTurns(): number {
    return this.maxSessionTurns;
  }

  setQuotaErrorOccurred(value: boolean): void {
    this.quotaErrorOccurred = value;
  }

  getQuotaErrorOccurred(): boolean {
    return this.quotaErrorOccurred;
  }

  async getUserTier(): Promise<UserTierId | undefined> {
    if (!this.geminiClient) {
      return undefined;
    }
    const generator = this.geminiClient.getContentGenerator();
    return await generator.getTier?.();
  }

  getEmbeddingModel(): string {
    return this.embeddingModel;
  }

  getSandbox(): SandboxConfig | undefined {
    return this.sandbox;
  }

  getTargetDir(): string {
    return this.targetDir;
  }

  getProjectRoot(): string {
    return this.targetDir;
  }


  getFileParserService(): FileParserService {
    if (!this.fileParserService) {
      // Initialize VLM service with proper fallback
      const vlmService = new CompositeVLMService(this.geminiClient?.getContentGenerator());
      this.fileParserService = new FileParserService(vlmService);
    }
    return this.fileParserService;
  }

  getDebugMode(): boolean {
    return this.debugMode;
  }
  getQuestion(): string | undefined {
    return this.question;
  }

  getFullContext(): boolean {
    return this.fullContext;
  }

  getCoreTools(): string[] | undefined {
    return this.coreTools;
  }

  getExcludeTools(): string[] | undefined {
    return this.excludeTools;
  }

  getToolDiscoveryCommand(): string | undefined {
    return this.toolDiscoveryCommand;
  }

  getToolCallCommand(): string | undefined {
    return this.toolCallCommand;
  }

  getMcpServerCommand(): string | undefined {
    return this.mcpServerCommand;
  }

  getMcpServers(): Record<string, MCPServerConfig> | undefined {
    return this.mcpServers;
  }

  getUserMemory(): string {
    return this.userMemory;
  }

  setUserMemory(newUserMemory: string): void {
    this.userMemory = newUserMemory;
  }

  getGeminiMdFileCount(): number {
    return this.geminiMdFileCount;
  }

  setGeminiMdFileCount(count: number): void {
    this.geminiMdFileCount = count;
  }

  getApprovalMode(): ApprovalMode {
    return this.approvalMode;
  }

  setApprovalMode(mode: ApprovalMode): void {
    this.approvalMode = mode;
  }

  getShowMemoryUsage(): boolean {
    return this.showMemoryUsage;
  }

  getAccessibility(): AccessibilitySettings {
    return this.accessibility;
  }

  getTelemetryEnabled(): boolean {
    return this.telemetrySettings.enabled ?? false;
  }

  getTelemetryLogPromptsEnabled(): boolean {
    return this.telemetrySettings.logPrompts ?? true;
  }

  getTelemetryOtlpEndpoint(): string {
    return this.telemetrySettings.otlpEndpoint ?? DEFAULT_OTLP_ENDPOINT;
  }

  getTelemetryTarget(): TelemetryTarget {
    return this.telemetrySettings.target ?? DEFAULT_TELEMETRY_TARGET;
  }

  getGeminiClient(): GeminiClient {
    return this.geminiClient;
  }

  getGeminiDir(): string {
    return path.join(this.targetDir, GEMINI_DIR);
  }

  getProjectTempDir(): string {
    return getProjectTempDir(this.getProjectRoot());
  }

  getEnableRecursiveFileSearch(): boolean {
    return this.fileFiltering.enableRecursiveFileSearch;
  }

  getFileFilteringRespectGitIgnore(): boolean {
    return this.fileFiltering.respectGitIgnore;
  }

  getCheckpointingEnabled(): boolean {
    return this.checkpointing;
  }

  getProxy(): string | undefined {
    return this.proxy;
  }

  getWorkingDir(): string {
    return this.cwd;
  }

  getBugCommand(): BugCommandSettings | undefined {
    return this.bugCommand;
  }

  getFileService(): FileDiscoveryService {
    if (!this.fileDiscoveryService) {
      this.fileDiscoveryService = new FileDiscoveryService(this.targetDir);
    }
    return this.fileDiscoveryService;
  }

  getUsageStatisticsEnabled(): boolean {
    return this.usageStatisticsEnabled;
  }

  getExtensionContextFilePaths(): string[] {
    return this.extensionContextFilePaths;
  }

  getListExtensions(): boolean {
    return this.listExtensions;
  }

  getActiveExtensions(): ActiveExtension[] {
    return this._activeExtensions;
  }

  getNoBrowser(): boolean {
    return this.noBrowser;
  }

  getSummarizeToolOutputConfig():
    | Record<string, SummarizeToolOutputSettings>
    | undefined {
    return this.summarizeToolOutput;
  }

  getIdeMode(): boolean {
    return this.ideMode;
  }

  // エージェントモード管理用メソッドを public に移動
  public setAgentMode(mode: 'idle' | 'planning' | 'execution'): void {
    // Agent mode changed to ${mode}
    this.agentMode = mode;
  }

  getAgentMode(): 'idle' | 'planning' | 'execution' {
    return this.agentMode;
  }

  async getGitService(): Promise<GitService> {
    if (!this.gitService) {
      this.gitService = new GitService(this.targetDir);
      await this.gitService.initialize();
    }
    return this.gitService;
  }

  async refreshMemory(): Promise<{ memoryContent: string; fileCount: number }> {
    const { memoryContent, fileCount } = await loadServerHierarchicalMemory(
      this.getWorkingDir(),
      this.getDebugMode(),
      this.getFileService(),
      this.getExtensionContextFilePaths(),
    );

    this.setUserMemory(memoryContent);
    this.setGeminiMdFileCount(fileCount);

    return { memoryContent, fileCount };
  }

  async createToolRegistry(): Promise<ToolRegistry> {
    const registry = new ToolRegistry(this);

    // helper to create & register core tools that are enabled
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const registerCoreTool = (ToolClass: any, ...args: unknown[]) => {
      const className = ToolClass.name;
      const toolName = ToolClass.Name || className;
      
      const coreTools = this.getCoreTools();
      const excludeTools = this.getExcludeTools();

      let isEnabled = false;
      if (coreTools === undefined) {
        isEnabled = true;
      } else {
        isEnabled = coreTools.some(
          (tool) =>
            tool === className ||
            tool === toolName ||
            tool.startsWith(`${className}(`) ||
            tool.startsWith(`${toolName}(`),
        );
      }

      if (
        excludeTools?.includes(className) ||
        excludeTools?.includes(toolName)
      ) {
        isEnabled = false;
      }

      if (isEnabled) {
        try {
          const toolInstance = new ToolClass(...args);
          registry.registerTool(toolInstance);
        } catch (error) {
          console.error(`[Tool Registration] Error creating/registering ${className}:`, error);
        }
      }
    };

    registerCoreTool(LSTool, this);
    registerCoreTool(ReadFileTool, this);
    registerCoreTool(GrepTool, this);
    registerCoreTool(GlobTool, this);
    registerCoreTool(EditTool, this);
    registerCoreTool(WriteFileTool, this);
    registerCoreTool(WebFetchTool, this);
    registerCoreTool(ReadManyFilesTool, this);
    registerCoreTool(ShellTool, this);
    // 新しいMemory Toolsを登録
    registerCoreTool(SaveMemoryTool);
    registerCoreTool(SearchMemoryTool);
    registerCoreTool(MemoryFeedbackTool);
    registerCoreTool(MemoryStatsTool);
    registerCoreTool(WebSearchTool, this);
    // TODOツールを登録（重要な機能）
    registerCoreTool(TodoWriteTool);
    // IntelligentAnalysisツールを登録（深層分析用）
    registerCoreTool(IntelligentAnalysisTool, this);
    
    // PlanCompleteToolを他のツールと同じパターンで登録
    registerCoreTool(PlanCompleteTool);

    await registry.discoverTools();
    return registry;
  }

  // プランモード専用のツールレジストリを作成
  async createPlanModeToolRegistry(): Promise<ToolRegistry> {
    const registry = new ToolRegistry(this);

    // プランモードで許可されたツールのみ登録
    const registerPlanModeTool = (ToolClass: any, ...args: unknown[]) => {
      const className = ToolClass.name;
      const toolName = ToolClass.Name || className;
      
      // プランモードで使用可能かチェック
      const isAllowedInPlanMode = PLAN_MODE_ALLOWED_TOOLS.some(allowedTool => 
        toolName === allowedTool || 
        className === allowedTool ||
        toolName.toLowerCase() === allowedTool.toLowerCase() ||
        className.toLowerCase() === allowedTool.toLowerCase()
      );
      
      if (isAllowedInPlanMode) {
        try {
          const toolInstance = new ToolClass(...args);
          registry.registerTool(toolInstance);
        } catch (error) {
          console.error(`[Plan Mode Registry] Error registering ${className}:`, error);
        }
      }
    };

    // プランモードで使用可能なツールのみ登録
    registerPlanModeTool(LSTool, this);
    registerPlanModeTool(ReadFileTool, this);
    registerPlanModeTool(GrepTool, this);
    registerPlanModeTool(GlobTool, this);
    registerPlanModeTool(SearchMemoryTool);
    registerPlanModeTool(MemoryFeedbackTool);
    registerPlanModeTool(MemoryStatsTool);
    registerPlanModeTool(TodoWriteTool);
    registerPlanModeTool(IntelligentAnalysisTool, this);
    registerPlanModeTool(PlanCompleteTool);

    await registry.discoverTools();
    return registry;
  }


  // モードに応じたツールレジストリを取得
  async getToolRegistry(): Promise<ToolRegistry> {
    const currentMode = (this as any).agentMode || this.agentMode || 'idle';
    
    if (currentMode === 'planning') {
      if (!this.planModeToolRegistry) {
        this.planModeToolRegistry = await this.createPlanModeToolRegistry();
      }
      return this.planModeToolRegistry;
    } else {
      if (!this.normalToolRegistry) {
        this.normalToolRegistry = this.toolRegistry;
      }
      return this.normalToolRegistry;
    }
  }
}
// プランモードで使用可能なツールのリスト（読み取り専用・分析ツールのみ）
const PLAN_MODE_ALLOWED_TOOLS = [
  // ファイルシステム読み取り
  'ls',           // ディレクトリ構造の確認
  'read_file',    // ファイル内容の読み取り
  'ReadFile',     // 同上（クラス名）
  
  // コード検索・分析
  'grep',         // パターン検索（影響範囲調査）
  'Grep',         // 同上（クラス名）
  'glob',         // ファイル名パターン検索
  'Glob',         // 同上（クラス名）
  
  // AI分析ツール
  'IntelligentAnalysis',  // 深層コード分析
  
  // タスク管理
  'TodoWrite',    // タスク計画の記録
  
  // メモリ検索（既存知識の活用）
  'SearchMemory',
  'MemoryStats',
  
  // プラン完了通知
  'plan_complete',
  'PlanCompleteTool'
];

// Export model constants for use in CLI
export { DEFAULT_AGENTS_FLASH_MODEL };

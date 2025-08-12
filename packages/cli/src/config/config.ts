/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import {
  Config,
  loadServerHierarchicalMemory,
  setGeminiMdFilename as setServerGeminiMdFilename,
  getCurrentGeminiMdFilename,
  ApprovalMode,
  DEFAULT_AGENTS_MODEL,
  DEFAULT_AGENTS_EMBEDDING_MODEL,
  FileDiscoveryService,
  TelemetryTarget,
  MCPServerConfig,
  IDE_SERVER_NAME,
  AuthType,

} from '@indenscale/open-gemini-cli-core';
import { Settings } from './settings.js';

import { Extension, filterActiveExtensions } from './extension.js';
import { getCliVersion } from '../utils/version.js';

// Simple console logger for now - replace with actual logger if available
const logger = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  debug: (...args: any[]) => console.debug('[DEBUG]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  info: (...args: any[]) => console.info('[INFO]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  warn: (...args: any[]) => console.warn('[WARN]', ...args),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  error: (...args: any[]) => console.error('[ERROR]', ...args),
};

export interface CliArgs {
  model: string | undefined;
  sandbox: boolean | string | undefined;
  sandboxImage: string | undefined;
  debug: boolean | undefined;
  prompt: string | undefined;
  promptInteractive: string | undefined;
  file: string[] | undefined;
  allFiles: boolean | undefined;
  all_files: boolean | undefined;
  showMemoryUsage: boolean | undefined;
  show_memory_usage: boolean | undefined;
  yolo: boolean | undefined;
  telemetry: boolean | undefined;
  checkpointing: boolean | undefined;
  telemetryTarget: string | undefined;
  telemetryOtlpEndpoint: string | undefined;
  telemetryLogPrompts: boolean | undefined;
  allowedMcpServerNames: string[] | undefined;
  extensions: string[] | undefined;
  listExtensions: boolean | undefined;
  ideMode: boolean | undefined;
}

export async function parseArguments(): Promise<CliArgs> {
  const yargsInstance = yargs(hideBin(process.argv))
    .scriptName('agents')
    .usage(
      '$0 [options]',
      'AGENTS - Launch an interactive CLI, use -p/--prompt for non-interactive mode',
    )
    .option('model', {
      alias: 'm',
      type: 'string',
      description: `Model`,
      default: process.env.AGENTS_MODEL || DEFAULT_AGENTS_MODEL,
    })
    .option('prompt', {
      alias: 'p',
      type: 'string',
      description: 'Prompt. Appended to input on stdin (if any).',
    })
    .option('file', {
      type: 'string',
      array: true,
      description: 'Path to a file to include in the prompt context. Can be used multiple times.',
    })
    .option('prompt-interactive', {
      alias: 'i',
      type: 'string',
      description:
        'Execute the provided prompt and continue in interactive mode',
    })
    .option('sandbox', {
      alias: 's',
      type: 'boolean',
      description: 'Run in sandbox?',
    })
    .option('sandbox-image', {
      type: 'string',
      description: 'Sandbox image URI.',
    })
    .option('debug', {
      alias: 'd',
      type: 'boolean',
      description: 'Run in debug mode?',
      default: false,
    })
    .option('all-files', {
      alias: ['a'],
      type: 'boolean',
      description: 'Include ALL files in context?',
      default: false,
    })
    .option('all_files', {
      type: 'boolean',
      description: 'Include ALL files in context?',
      default: false,
    })
    .deprecateOption(
      'all_files',
      'Use --all-files instead. We will be removing --all_files in the coming weeks.',
    )
    .option('show-memory-usage', {
      type: 'boolean',
      description: 'Show memory usage in status bar',
      default: false,
    })
    .option('show_memory_usage', {
      type: 'boolean',
      description: 'Show memory usage in status bar',
      default: false,
    })
    .deprecateOption(
      'show_memory_usage',
      'Use --show-memory-usage instead. We will be removing --show_memory_usage in the coming weeks.',
    )
    .option('yolo', {
      alias: 'y',
      type: 'boolean',
      description:
        'Automatically accept all actions (aka YOLO mode, see https://www.youtube.com/watch?v=xvFZjo5PgG0 for more details)?',
      default: false,
    })
    .option('telemetry', {
      type: 'boolean',
      description:
        'Enable telemetry? This flag specifically controls if telemetry is sent. Other --telemetry-* flags set specific values but do not enable telemetry on their own.',
    })
    .option('telemetry-target', {
      type: 'string',
      choices: ['local', 'gcp'],
      description:
        'Set the telemetry target (local or gcp). Overrides settings files.',
    })
    .option('telemetry-otlp-endpoint', {
      type: 'string',
      description:
        'Set the OTLP endpoint for telemetry. Overrides environment variables and settings files.',
    })
    .option('telemetry-log-prompts', {
      type: 'boolean',
      description:
        'Enable or disable logging of user prompts for telemetry. Overrides settings files.',
    })
    .option('checkpointing', {
      alias: 'c',
      type: 'boolean',
      description: 'Enables checkpointing of file edits',
      default: false,
    })
    .option('allowed-mcp-server-names', {
      type: 'array',
      string: true,
      description: 'Allowed MCP server names',
    })
    .option('extensions', {
      alias: 'e',
      type: 'array',
      string: true,
      description:
        'A list of extensions to use. If not provided, all extensions are used.',
    })
    .option('list-extensions', {
      alias: 'l',
      type: 'boolean',
      description: 'List all available extensions and exit.',
    })
    .option('ide-mode', {
      type: 'boolean',
      description: 'Run in IDE mode?',
    })

    .version(await getCliVersion()) // This will enable the --version flag based on package.json
    .alias('v', 'version')
    .help()
    .alias('h', 'help')
    .strict()
    .check((argv) => {
      if (argv.prompt && argv.promptInteractive) {
        throw new Error(
          'Cannot use both --prompt (-p) and --prompt-interactive (-i) together',
        );
      }
      return true;
    });

  yargsInstance.wrap(yargsInstance.terminalWidth());
  return yargsInstance.argv;
}

// This function is now a thin wrapper around the server's implementation.
// It's kept in the CLI for now as App.tsx directly calls it for memory refresh.
// TODO: Consider if App.tsx should get memory via a server call or if Config should refresh itself.
export async function loadHierarchicalGeminiMemory(
  currentWorkingDirectory: string,
  debugMode: boolean,
  fileService: FileDiscoveryService,
  extensionContextFilePaths: string[] = [],
): Promise<{ memoryContent: string; fileCount: number }> {
  if (debugMode) {
    logger.debug(
      `CLI: Delegating hierarchical memory load to server for CWD: ${currentWorkingDirectory}`,
    );
  }
  // Directly call the server function.
  // The server function will use its own homedir() for the global path.
  return loadServerHierarchicalMemory(
    currentWorkingDirectory,
    debugMode,
    fileService,
    extensionContextFilePaths,
  );
}

export async function loadCliConfig(
  settings: Settings,
  extensions: Extension[],
  sessionId: string,
  argv: CliArgs,
): Promise<Config> {
  const debugMode =
    argv.debug ||
    [process.env.DEBUG, process.env.DEBUG_MODE].some(
      (v) => v === 'true' || v === '1',
    );

  const ideMode =
    (argv.ideMode ?? settings.ideMode ?? false) &&
    process.env.TERM_PROGRAM === 'vscode' &&
    !process.env.SANDBOX;

  const activeExtensions = filterActiveExtensions(
    extensions,
    argv.extensions || [],
  );

  // Set the context filename in the server's memoryTool module BEFORE loading memory
  // TODO(b/343434939): This is a bit of a hack. The contextFileName should ideally be passed
  // directly to the Config constructor in core, and have core handle setGeminiMdFilename.
  // However, loadHierarchicalGeminiMemory is called *before* createServerConfig.
  if (settings.contextFileName) {
    setServerGeminiMdFilename(settings.contextFileName);
  } else {
    // Reset to default if not provided in settings.
    setServerGeminiMdFilename(getCurrentGeminiMdFilename());
  }

  const extensionContextFilePaths = activeExtensions.flatMap(
    (e) => e.contextFiles,
  );

  const fileService = new FileDiscoveryService(process.cwd());
  // Call the (now wrapper) loadHierarchicalGeminiMemory which calls the server's version
  const { memoryContent, fileCount } = await loadHierarchicalGeminiMemory(
    process.cwd(),
    debugMode,
    fileService,
    extensionContextFilePaths,
  );

  // .agents/settings.jsonファイルを読み込む
  let authType: AuthType | undefined;
  let localEndpoint: string | undefined;
  let localModel: string | undefined;
  let agentsMcpServers: Record<string, MCPServerConfig> | undefined;
  const agentsSettingsPath = path.join(process.cwd(), '.agents', 'settings.json');
  if (fs.existsSync(agentsSettingsPath)) {
    try {
      const agentsSettings = JSON.parse(fs.readFileSync(agentsSettingsPath, 'utf-8'));
      // providerをAuthTypeにマッピング
      if (agentsSettings.llm?.provider === 'local-lmstudio') {
        authType = AuthType.OPENAI_COMPATIBLE;
        localEndpoint = agentsSettings.localEndpoint || agentsSettings.llm?.localEndpoint;
        localModel = agentsSettings.llm?.model;
        
        // 環境変数を設定（OpenAI互換APIで使用）
        if (localEndpoint && !process.env.LOCAL_LLM_BASE_URL) {
          process.env.LOCAL_LLM_BASE_URL = localEndpoint;
        }
        if (localModel && !process.env.LOCAL_LLM_MODEL) {
          process.env.LOCAL_LLM_MODEL = localModel;
        }
      }
      
      // .agents/settings.jsonからmcpServers設定を読み込む
      if (agentsSettings.mcpServers && typeof agentsSettings.mcpServers === 'object') {
        agentsMcpServers = {};
        Object.entries(agentsSettings.mcpServers).forEach(([key, server]: [string, any]) => {
          agentsMcpServers![key] = server as MCPServerConfig;
        });
        if (debugMode) {
          logger.info(`Loaded ${Object.keys(agentsMcpServers).length} MCP servers from .agents/settings.json`);
        }
      }
    } catch (error) {
      logger.debug(`Failed to load .agents/settings.json: ${error}`);
    }
  }

  // モデル名を決定（OpenAI互換APIの場合は別のデフォルト値を使用）
  if (debugMode) {
    console.debug(`[Config] authType: ${authType}, AuthType.OPENAI_COMPATIBLE: ${AuthType.OPENAI_COMPATIBLE}`);
    console.debug(`[Config] LOCAL_LLM_MODEL: ${process.env.LOCAL_LLM_MODEL}, localModel: ${localModel}`);
    console.debug(`[Config] AGENTS_MODEL: ${process.env.AGENTS_MODEL}, DEFAULT_AGENTS_MODEL: ${DEFAULT_AGENTS_MODEL}`);
  }
  
  const modelName = argv.model || (
    authType === AuthType.OPENAI_COMPATIBLE
      ? (process.env.LOCAL_LLM_MODEL || localModel || 'llama-3.2-3b-instruct')
      : (process.env.AGENTS_MODEL || DEFAULT_AGENTS_MODEL)
  );
  
  if (debugMode) {
    console.debug(`[Config] Final modelName: ${modelName}`);
  }

  // .agents/settings.jsonのmcpServersを優先的に使用
  let mcpServers = agentsMcpServers || mergeMcpServers(settings, activeExtensions);
  const excludeTools = mergeExcludeTools(settings, activeExtensions);

  if (!argv.allowedMcpServerNames) {
    if (settings.allowMCPServers) {
      const allowedNames = new Set(settings.allowMCPServers.filter(Boolean));
      if (allowedNames.size > 0) {
        mcpServers = Object.fromEntries(
          Object.entries(mcpServers).filter(([key]) => allowedNames.has(key)),
        );
      }
    }

    if (settings.excludeMCPServers) {
      const excludedNames = new Set(settings.excludeMCPServers.filter(Boolean));
      if (excludedNames.size > 0) {
        mcpServers = Object.fromEntries(
          Object.entries(mcpServers).filter(([key]) => !excludedNames.has(key)),
        );
      }
    }
  }

  if (argv.allowedMcpServerNames) {
    const allowedNames = new Set(argv.allowedMcpServerNames.filter(Boolean));
    if (allowedNames.size > 0) {
      mcpServers = Object.fromEntries(
        Object.entries(mcpServers).filter(([key]) => allowedNames.has(key)),
      );
    } else {
      mcpServers = {};
    }
  }

  if (ideMode) {
    if (mcpServers[IDE_SERVER_NAME]) {
      logger.warn(
        `Ignoring user-defined MCP server config for "${IDE_SERVER_NAME}" as it is a reserved name.`,
      );
    }
    const companionPort = process.env.AGENTS_CLI_IDE_SERVER_PORT;
    if (!companionPort) {
      throw new Error(
        'Could not connect to IDE. Make sure you have the companion VS Code extension installed from the marketplace or via /ide install.',
      );
    }
    const httpUrl = `http://localhost:${companionPort}/mcp`;
    mcpServers[IDE_SERVER_NAME] = new MCPServerConfig(
      undefined, // command
      undefined, // args
      undefined, // env
      undefined, // cwd
      undefined, // url
      httpUrl, // httpUrl
      undefined, // headers
      undefined, // tcp
      undefined, // timeout
      false, // trust
      'IDE connection', // description
      undefined, // includeTools
      undefined, // excludeTools
    );
  }

  // Sandbox機能は削除されました
  const sandboxConfig = undefined;

  return new Config({
    sessionId,
    embeddingModel: DEFAULT_AGENTS_EMBEDDING_MODEL,
    sandbox: sandboxConfig,
    targetDir: process.cwd(),
    debugMode,
    question: argv.promptInteractive || argv.prompt || '',
    fullContext: argv.allFiles || argv.all_files || false,
    coreTools: settings.coreTools || undefined,
    excludeTools,
    toolDiscoveryCommand: settings.toolDiscoveryCommand,
    toolCallCommand: settings.toolCallCommand,
    mcpServerCommand: settings.mcpServerCommand,
    mcpServers,
    userMemory: memoryContent,
    geminiMdFileCount: fileCount,
    approvalMode: argv.yolo || false ? ApprovalMode.YOLO : ApprovalMode.DEFAULT,
    showMemoryUsage:
      argv.showMemoryUsage ||
      argv.show_memory_usage ||
      settings.showMemoryUsage ||
      false,
    accessibility: settings.accessibility,
    telemetry: {
      enabled: argv.telemetry ?? settings.telemetry?.enabled,
      target: (argv.telemetryTarget ??
        settings.telemetry?.target) as TelemetryTarget,
      otlpEndpoint:
        argv.telemetryOtlpEndpoint ??
        process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
        settings.telemetry?.otlpEndpoint,
      logPrompts: argv.telemetryLogPrompts ?? settings.telemetry?.logPrompts,
    },
    usageStatisticsEnabled: settings.usageStatisticsEnabled ?? true,
    // Git-aware file filtering settings
    fileFiltering: {
      respectGitIgnore: settings.fileFiltering?.respectGitIgnore,
      enableRecursiveFileSearch:
        settings.fileFiltering?.enableRecursiveFileSearch,
    },
    checkpointing: argv.checkpointing || settings.checkpointing?.enabled,
    proxy:
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy,
    cwd: process.cwd(),
    fileDiscoveryService: fileService,
    bugCommand: settings.bugCommand,
    model: modelName,
    extensionContextFilePaths,
    maxSessionTurns: settings.maxSessionTurns ?? -1,
    listExtensions: argv.listExtensions || false,
    activeExtensions: activeExtensions.map((e) => ({
      name: e.config.name,
      version: e.config.version,
    })),
    noBrowser: !!process.env.NO_BROWSER,
    summarizeToolOutput: settings.summarizeToolOutput,
    ideMode,
  });
}

function mergeMcpServers(settings: Settings, extensions: Extension[]) {
  const mcpServers = { ...(settings.mcpServers || {}) };
  
  // .mcp.jsonは読み込まない（.agents/settings.jsonのmcpServersのみを使用）
  // .agents/settings.jsonのmcpServers設定がsettingsパラメータ経由で既に渡されている
  
  for (const extension of extensions) {
    Object.entries(extension.config.mcpServers || {}).forEach(
      ([key, server]) => {
        if (mcpServers[key]) {
          logger.warn(
            `Skipping extension MCP config for server with key "${key}" as it already exists.`,
          );
          return;
        }
        mcpServers[key] = server;
      },
    );
  }
  return mcpServers;
}

function mergeExcludeTools(
  settings: Settings,
  extensions: Extension[],
): string[] {
  const allExcludeTools = new Set(settings.excludeTools || []);
  for (const extension of extensions) {
    for (const tool of extension.config.excludeTools || []) {
      allExcludeTools.add(tool);
    }
  }
  return [...allExcludeTools];
}

/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from 'ink';
import { AppWrapper } from './ui/App.js';
import { loadCliConfig, parseArguments, CliArgs } from './config/config.js';
import { readStdin } from './utils/readStdin.js';
import { basename } from 'node:path';
import v8 from 'node:v8';
import os from 'node:os';
import { spawn } from 'node:child_process';
import {
  LoadedSettings,
  loadSettings,
  USER_SETTINGS_PATH,
  SettingScope,
} from './config/settings.js';
import { themeManager } from './ui/themes/theme-manager.js';
import { getStartupWarnings } from './utils/startupWarnings.js';
import { getUserStartupWarnings } from './utils/userStartupWarnings.js';
import { runNonInteractive } from './nonInteractiveCli.js';
import { loadExtensions, Extension } from './config/extension.js';
import { cleanupCheckpoints, registerCleanup } from './utils/cleanup.js';
import { getCliVersion } from './utils/version.js';
import {
  ApprovalMode,
  Config,
  EditTool,
  ShellTool,
  WriteFileTool,
  sessionId,
  logUserPrompt,
  AuthType,
  getOauthClient,
} from '@indenscale/open-gemini-cli-core';
import { validateAuthMethod, getDefaultAuthMethod } from './config/auth.js';
import { setMaxSizedBoxDebugging } from './ui/components/shared/MaxSizedBox.js';
import { getMemoryManager } from './memory/memoryManager.js';

function getNodeMemoryArgs(config: Config): string[] {
  const totalMemoryMB = os.totalmem() / (1024 * 1024);
  const heapStats = v8.getHeapStatistics();
  const currentMaxOldSpaceSizeMb = Math.floor(
    heapStats.heap_size_limit / 1024 / 1024,
  );

  // Set target to 50% of total memory
  const targetMaxOldSpaceSizeInMB = Math.floor(totalMemoryMB * 0.5);
  if (config.getDebugMode()) {
    console.debug(
      `Current heap size ${currentMaxOldSpaceSizeMb.toFixed(2)} MB`,
    );
  }

  if (process.env.AGENTS_CLI_NO_RELAUNCH) {
    return [];
  }

  if (targetMaxOldSpaceSizeInMB > currentMaxOldSpaceSizeMb) {
    if (config.getDebugMode()) {
      console.debug(
        `Need to relaunch with more memory: ${targetMaxOldSpaceSizeInMB.toFixed(2)} MB`,
      );
    }
    return [`--max-old-space-size=${targetMaxOldSpaceSizeInMB}`];
  }

  return [];
}

async function relaunchWithAdditionalArgs(additionalArgs: string[]) {
  const nodeArgs = [...additionalArgs, ...process.argv.slice(1)];
  const newEnv = { ...process.env, AGENTS_CLI_NO_RELAUNCH: 'true' };

  const child = spawn(process.execPath, nodeArgs, {
    stdio: 'inherit',
    env: newEnv,
  });

  await new Promise((resolve) => child.on('close', resolve));
  process.exit(0);
}

export async function main() {
  const workspaceRoot = process.cwd();
  const settings = loadSettings(workspaceRoot);

  await cleanupCheckpoints();
  if (settings.errors.length > 0) {
    for (const error of settings.errors) {
      let errorMessage = `Error in ${error.path}: ${error.message}`;
      if (!process.env.NO_COLOR) {
        errorMessage = `\x1b[31m${errorMessage}\x1b[0m`;
      }
      console.error(errorMessage);
      console.error(`Please fix ${error.path} and try again.`);
    }
    process.exit(1);
  }

  const argv = await parseArguments();
  const extensions = loadExtensions(workspaceRoot);
  const config = await loadCliConfig(
    settings.merged,
    extensions,
    sessionId,
    argv,
  );

  if (argv.promptInteractive && !process.stdin.isTTY) {
    console.error(
      'Error: The --prompt-interactive flag is not supported when piping input from stdin.',
    );
    process.exit(1);
  }

  if (config.getListExtensions()) {
    console.log('Installed extensions:');
    for (const extension of extensions) {
      console.log(`- ${extension.config.name}`);
    }
    process.exit(0);
  }

  // Set a default auth type if one isn't set.
  if (!settings.merged.selectedAuthType) {
    if (process.env.CLOUD_SHELL === 'true') {
      settings.setValue(
        SettingScope.User,
        'selectedAuthType',
        AuthType.CLOUD_SHELL,
      );
    }
  }

  setMaxSizedBoxDebugging(config.getDebugMode());

  // Sandbox機能は削除されました
  if (!process.env.SANDBOX) {
    const memoryArgs = settings.merged.autoConfigureMaxOldSpaceSize
      ? getNodeMemoryArgs(config)
      : [];
    
    // 根本的解決: 認証タイプが未設定の場合、設定に基づいてデフォルトを選択
    const defaultAuth = getDefaultAuthMethod(settings.merged);
    const authType = settings.merged.selectedAuthType || defaultAuth as AuthType;
    
    // ローカルLLMの場合、事前にダミーAPIキーを設定（OpenAIContentGeneratorの要求を満たすため）
    if (authType === AuthType.OPENAI_COMPATIBLE && !process.env.OPENAI_API_KEY) {
      const baseUrl = process.env.LOCAL_LLM_BASE_URL || process.env.OPENAI_BASE_URL || (settings.merged as any).localEndpoint;
      if (baseUrl && (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || 
          baseUrl.includes('0.0.0.0') || baseUrl.includes('host.docker.internal'))) {
        process.env.OPENAI_API_KEY = 'dummy-key-for-local-llm';
      }
    }
    
    // メモリ設定のみ処理
    if (memoryArgs.length > 0) {
      await relaunchWithAdditionalArgs(memoryArgs);
      process.exit(0);
    }
  }

  // 認証タイプを先に設定（MCP接続エラーを抑制）
  if (!process.env.SANDBOX) {
    const defaultAuth = getDefaultAuthMethod(settings.merged);
    const authType = settings.merged.selectedAuthType || defaultAuth as AuthType;
    if (authType) {
      try {
        const err = validateAuthMethod(authType);
        if (err) {
          throw new Error(err);
        }
        // 認証タイプをconfigに設定（refreshAuthの前にセット）
        (config as any).selectedAuthType = authType;
      } catch (err) {
        console.error('Error authenticating:', err);
        process.exit(1);
      }
    }
  }

  // config初期化（ツールレジストリの初期化）
  await config.initialize();

  // 初期化後に認証を完了
  if (!process.env.SANDBOX) {
    const defaultAuth = getDefaultAuthMethod(settings.merged);
    const authType = settings.merged.selectedAuthType || defaultAuth as AuthType;
    if (authType) {
      try {
        await config.refreshAuth(authType);
      } catch (err) {
        console.error('Error authenticating:', err);
        process.exit(1);
      }
    }
  }

  if (settings.merged.theme) {
    if (!themeManager.setActiveTheme(settings.merged.theme)) {
      // If the theme is not found during initial load, log a warning and continue.
      // The useThemeCommand hook in App.tsx will handle opening the dialog.
      console.warn(`Warning: Theme "${settings.merged.theme}" not found.`);
    }
  }

  if (
    settings.merged.selectedAuthType === AuthType.LOGIN_WITH_GOOGLE &&
    config.getNoBrowser()
  ) {
    // Do oauth before app renders to make copying the link possible.
    await getOauthClient(settings.merged.selectedAuthType, config);
  }

  let input = config.getQuestion();
  const startupWarnings = [
    ...(await getStartupWarnings()),
    ...(await getUserStartupWarnings(workspaceRoot)),
  ];

  const shouldBeInteractive =
    !!argv.promptInteractive || (process.stdin.isTTY && input?.length === 0);


  // Render UI, passing necessary config values. Check that there is no command line question.
  if (shouldBeInteractive) {
    const version = await getCliVersion();
    setWindowTitle(basename(workspaceRoot), settings);
    
    // Initialize memory system
    const memoryManager = getMemoryManager({
      projectRoot: workspaceRoot
      // sqlitePathは省略 - MemoryManager内で自動設定される
    });
    await memoryManager.initialize();
    
    const instance = render(
      <React.StrictMode>
        <AppWrapper
          config={config}
          settings={settings}
          startupWarnings={startupWarnings}
          version={version}
        />
      </React.StrictMode>,
      { exitOnCtrlC: false },
    );

    registerCleanup(() => {
      instance.unmount();
      memoryManager.cleanup();
    });
    return;
  }
  // If not a TTY, read from stdin
  // This is for cases where the user pipes input directly into the command
  if (!process.stdin.isTTY && !input) {
    input += await readStdin();
  }
  if (!input) {
    console.error('No input provided via stdin.');
    process.exit(1);
  }

  const prompt_id = Math.random().toString(16).slice(2);
  logUserPrompt(config, {
    'event.name': 'user_prompt',
    'event.timestamp': new Date().toISOString(),
    prompt: input,
    prompt_id,
    auth_type: config.getContentGeneratorConfig()?.authType,
    prompt_length: input.length,
  });

  // Non-interactive mode handled by runNonInteractive
  const nonInteractiveConfig = await loadNonInteractiveConfig(
    config,
    extensions,
    settings,
    argv,
  );

  await runNonInteractive(nonInteractiveConfig, input, prompt_id, argv);
  process.exit(0);
}

function setWindowTitle(title: string, settings: LoadedSettings) {
  if (!settings.merged.hideWindowTitle) {
    const windowTitle = (process.env.CLI_TITLE || `AGENTS - ${title}`).replace(
      // eslint-disable-next-line no-control-regex
      /[\x00-\x1F\x7F]/g,
      '',
    );
    process.stdout.write(`\x1b]2;${windowTitle}\x07`);

    process.on('exit', () => {
      process.stdout.write(`\x1b]2;\x07`);
    });
  }
}

// --- Global Unhandled Rejection Handler ---
process.on('unhandledRejection', (reason, _promise) => {
  // Log other unexpected unhandled rejections as critical errors
  console.error('=========================================');
  console.error('CRITICAL: Unhandled Promise Rejection!');
  console.error('=========================================');
  console.error('Reason:', reason);
  console.error('Stack trace may follow:');
  if (!(reason instanceof Error)) {
    console.error(reason);
  }
  // Exit for genuinely unhandled errors
  process.exit(1);
});

async function loadNonInteractiveConfig(
  config: Config,
  extensions: Extension[],
  settings: LoadedSettings,
  argv: CliArgs,
) {
  console.log('[NonInteractive] loadNonInteractiveConfig called');
  console.log('[NonInteractive] Current approvalMode:', config.getApprovalMode());
  console.log('[NonInteractive] ApprovalMode.YOLO:', ApprovalMode.YOLO);
  
  let finalConfig = config;
  if (config.getApprovalMode() !== ApprovalMode.YOLO) {
    console.log('[NonInteractive] Creating new config with excluded tools...');
    // Everything is not allowed, ensure that only read-only tools are configured.
    const existingExcludeTools = settings.merged.excludeTools || [];
    const interactiveTools = [
      ShellTool.Name,
      EditTool.Name,
      WriteFileTool.Name,
    ];

    const newExcludeTools = [
      ...new Set([...existingExcludeTools, ...interactiveTools]),
    ];
    
    // plan_completeツールは除外リストから除外（プランモードで必要）
    const planCompleteIndex = newExcludeTools.indexOf('plan_complete');
    if (planCompleteIndex !== -1) {
      newExcludeTools.splice(planCompleteIndex, 1);
      console.log('[NonInteractive] plan_complete tool removed from excludeTools');
    }
    const planCompleteClassIndex = newExcludeTools.indexOf('PlanCompleteTool');
    if (planCompleteClassIndex !== -1) {
      newExcludeTools.splice(planCompleteClassIndex, 1);
      console.log('[NonInteractive] PlanCompleteTool removed from excludeTools');
    }
    
    console.log('[NonInteractive] excludeTools:', newExcludeTools);
    console.log('[NonInteractive] Checking if plan_complete is excluded...');
    const isPlanCompleteExcluded = newExcludeTools.includes('plan_complete') || 
                                  newExcludeTools.includes('PlanCompleteTool');
    console.log('[NonInteractive] plan_complete excluded:', isPlanCompleteExcluded);

    const nonInteractiveSettings = {
      ...settings.merged,
      excludeTools: newExcludeTools,
    };
    finalConfig = await loadCliConfig(
      nonInteractiveSettings,
      extensions,
      config.getSessionId(),
      argv,
    );
    // 元のconfigからagentModeを継承（プランモード状態を保持）
    const originalAgentMode = (config as any).agentMode || config.agentMode || 'idle';
    if (originalAgentMode !== 'idle' && 'setAgentMode' in finalConfig && typeof finalConfig.setAgentMode === 'function') {
      finalConfig.setAgentMode(originalAgentMode);
      console.log(`[NonInteractive] Inherited agent mode: ${originalAgentMode}`);
    }
    
    console.log('[NonInteractive] Calling finalConfig.initialize()...');
    await finalConfig.initialize();
    console.log('[NonInteractive] finalConfig.initialize() completed');
    
    // ツールレジストリの確認
    const toolRegistry = await finalConfig.getToolRegistry();
    const allTools = toolRegistry.getAllTools();
    console.log('[NonInteractive] Tools in finalConfig registry:', allTools.length);
    const planCompleteFound = allTools.find((t: any) => t.name === 'plan_complete');
    console.log('[NonInteractive] plan_complete tool found in finalConfig:', !!planCompleteFound);
    
    // plan_completeツール登録はConfig.initialize()に委ねる
    if (!planCompleteFound) {
      console.warn('[NonInteractive] plan_complete tool not found in registry - should be handled by Config.initialize()');
    }
  } else {
    console.log('[NonInteractive] ApprovalMode is YOLO, skipping initialize()');
  }

  return await validateNonInterActiveAuth(
    settings.merged.selectedAuthType,
    finalConfig,
  );
}

async function validateNonInterActiveAuth(
  selectedAuthType: AuthType | undefined,
  nonInteractiveConfig: Config,
) {
  // making a special case for the cli. many headless environments might not have a settings.json set
  // so if AGENTS_API_KEY is set, we'll use that. However since the oauth things are interactive anyway, we'll
  // still expect that exists
  if (!selectedAuthType && !process.env.AGENTS_API_KEY) {
    console.error(
      `Please set an Auth method in your ${USER_SETTINGS_PATH} OR specify AGENTS_API_KEY env variable file before running`,
    );
    process.exit(1);
  }

  selectedAuthType = selectedAuthType || AuthType.USE_GEMINI;
  const err = validateAuthMethod(selectedAuthType);
  if (err != null) {
    console.error(err);
    process.exit(1);
  }

  await nonInteractiveConfig.refreshAuth(selectedAuthType);
  return nonInteractiveConfig;
}

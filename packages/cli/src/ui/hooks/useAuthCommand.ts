/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useCallback, useEffect } from 'react';
import { LoadedSettings, SettingScope } from '../../config/settings.js';
import {
  AuthType,
  Config,
  clearCachedCredentialFile,
  clearAuthEnvironmentVariables,
  getErrorMessage,
} from '@indenscale/open-gemini-cli-core';
import { runExitCleanup } from '../../utils/cleanup.js';

export const useAuthCommand = (
  settings: LoadedSettings,
  setAuthError: (error: string | null) => void,
  config: Config,
) => {
  // LOCAL_LLM_BASE_URLが設定されている場合は自動的にOPENAI_COMPATIBLEを選択
  const shouldAutoSelectLocalLLM = !!process.env.LOCAL_LLM_BASE_URL;
  
  const [isAuthDialogOpen, setIsAuthDialogOpen] = useState(
    settings.merged.selectedAuthType === undefined && !shouldAutoSelectLocalLLM,
  );

  const openAuthDialog = useCallback(() => {
    setIsAuthDialogOpen(true);
  }, []);

  const [isAuthenticating, setIsAuthenticating] = useState(false);

  useEffect(() => {
    const authFlow = async () => {
      // LOCAL_LLM_BASE_URLが設定されていて、まだ認証タイプが選択されていない場合
      let authType = settings.merged.selectedAuthType;
      
      if (shouldAutoSelectLocalLLM && !authType) {
        // 自動的にOPENAI_COMPATIBLEを選択
        authType = AuthType.OPENAI_COMPATIBLE;
        settings.setValue(SettingScope.User, 'selectedAuthType', authType);
      }
      
      if (isAuthDialogOpen || !authType) {
        return;
      }

      try {
        // ローカルLLMの場合は認証をスキップ
        if (authType === AuthType.OPENAI_COMPATIBLE) {
          // OpenAI互換APIの場合は認証プロセスをスキップ
          await config.refreshAuth(authType);
          console.log(`Using local LLM via "${authType}".`);
        } else {
          setIsAuthenticating(true);
          await config.refreshAuth(authType);
          console.log(`Authenticated via "${authType}".`);
        }
      } catch (e) {
        setAuthError(`Failed to login. Message: ${getErrorMessage(e)}`);
        openAuthDialog();
      } finally {
        // ローカルLLM以外の場合のみisAuthenticatingをfalseに
        if (authType !== AuthType.OPENAI_COMPATIBLE) {
          setIsAuthenticating(false);
        }
      }
    };

    void authFlow();
  }, [isAuthDialogOpen, settings, config, setAuthError, openAuthDialog, shouldAutoSelectLocalLLM]);

  const handleAuthSelect = useCallback(
    async (authType: AuthType | undefined, scope: SettingScope) => {
      if (authType) {
        // Clear cached credentials and conflicting environment variables
        await clearCachedCredentialFile();
        // Only clear environment variables that would conflict with the target auth type
        clearAuthEnvironmentVariables(authType);
        
        settings.setValue(scope, 'selectedAuthType', authType);
        if (authType === AuthType.LOGIN_WITH_GOOGLE && config.getNoBrowser()) {
          runExitCleanup();
          console.log(
            `
----------------------------------------------------------------
Logging in with Google... Please restart Gemini CLI to continue.
----------------------------------------------------------------
            `,
          );
          process.exit(0);
        }
      }
      setIsAuthDialogOpen(false);
      setAuthError(null);
    },
    [settings, setAuthError, config],
  );

  const cancelAuthentication = useCallback(() => {
    setIsAuthenticating(false);
  }, []);

  return {
    isAuthDialogOpen,
    openAuthDialog,
    handleAuthSelect,
    isAuthenticating,
    cancelAuthentication,
  };
};

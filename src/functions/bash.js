import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { logger } from '../utils/logger.js';
const execAsync = promisify(exec);
/**
 * 内部Bash実行クラス
 */
export class InternalBash {
    security;
    config;
    constructor(fileSystemSecurity, config) {
        this.security = fileSystemSecurity;
        this.config = config;
        logger.debug('InternalBash initialized', {
            enabled: config.enabled,
            allowedCommands: config.allowedCommands.length,
            blockedCommands: config.blockedCommands.length,
            timeout: config.timeout
        });
    }
    /**
     * コマンドが実行許可されているかチェック
     */
    validateCommand(command) {
        if (!this.config.enabled) {
            return {
                allowed: false,
                reason: 'Bash execution is disabled by security configuration'
            };
        }
        // コマンドをパースしてベースコマンドを取得
        const baseCommand = this.extractBaseCommand(command);
        // 禁止コマンドチェック
        for (const blocked of this.config.blockedCommands) {
            if (baseCommand.includes(blocked) || command.includes(blocked)) {
                return {
                    allowed: false,
                    reason: `Command contains blocked keyword: ${blocked}`
                };
            }
        }
        // 許可コマンドリストが設定されている場合のチェック
        if (this.config.allowedCommands.length > 0) {
            const isAllowed = this.config.allowedCommands.some(allowed => baseCommand.startsWith(allowed) || command.startsWith(allowed));
            if (!isAllowed) {
                return {
                    allowed: false,
                    reason: `Command not in allowed list. Base command: ${baseCommand}`
                };
            }
        }
        // 危険なパターンをチェック
        const dangerousPatterns = [
            /rm\s+-rf\s+\//, // rm -rf /
            /:\(\)\{.*\}\s*;/, // Fork bomb pattern
            />\s*\/dev\/sd[a-z]/, // Direct disk write
            /dd\s+.*of=\/dev/, // Direct disk write with dd
            /mkfs/, // Format filesystem
            /fdisk/, // Disk partitioning
            /shutdown/, // System shutdown
            /reboot/, // System reboot
            /halt/, // System halt
            /poweroff/, // Power off
        ];
        for (const pattern of dangerousPatterns) {
            if (pattern.test(command)) {
                return {
                    allowed: false,
                    reason: `Command contains dangerous pattern: ${pattern.toString()}`
                };
            }
        }
        return { allowed: true };
    }
    /**
     * コマンド文字列からベースコマンドを抽出
     */
    extractBaseCommand(command) {
        // パイプやリダイレクトを除去してベースコマンドを取得
        const cleaned = command.split(/[|&><;]/)[0].trim();
        const parts = cleaned.split(/\s+/);
        return parts[0] || '';
    }
    /**
     * 作業ディレクトリを検証
     */
    validateWorkingDirectory(cwd) {
        if (!cwd) {
            return {
                allowed: true,
                validatedPath: this.security.getCurrentDirectory()
            };
        }
        if (!this.config.restrictWorkingDirectory) {
            return {
                allowed: true,
                validatedPath: cwd
            };
        }
        const validation = this.security.validatePath(cwd);
        if (!validation.allowed) {
            return {
                allowed: false,
                reason: `Working directory not allowed: ${validation.reason}`
            };
        }
        return {
            allowed: true,
            validatedPath: validation.normalizedPath
        };
    }
    /**
     * 環境変数をフィルタリング
     */
    filterEnvironmentVariables(env) {
        if (!env) {
            return process.env;
        }
        if (this.config.allowedEnvVars.length === 0) {
            return { ...process.env, ...env };
        }
        const filteredEnv = { ...process.env };
        // 許可された環境変数のみを設定
        for (const [key, value] of Object.entries(env)) {
            if (this.config.allowedEnvVars.includes(key)) {
                filteredEnv[key] = value;
            }
        }
        return filteredEnv;
    }
    /**
     * コマンドを実行（非同期、出力をストリーミング）
     */
    async executeCommand(command, options) {
        const startTime = Date.now();
        try {
            logger.debug(`Executing command: ${command}`, options);
            // コマンドの検証
            const commandValidation = this.validateCommand(command);
            if (!commandValidation.allowed) {
                return {
                    success: false,
                    error: commandValidation.reason,
                    duration: Date.now() - startTime
                };
            }
            // 作業ディレクトリの検証
            const cwdValidation = this.validateWorkingDirectory(options?.cwd);
            if (!cwdValidation.allowed) {
                return {
                    success: false,
                    error: cwdValidation.reason,
                    duration: Date.now() - startTime
                };
            }
            // シェルの検証
            const shell = options?.shell || '/bin/bash';
            if (this.config.allowedShells.length > 0 && !this.config.allowedShells.includes(shell)) {
                return {
                    success: false,
                    error: `Shell not allowed: ${shell}`,
                    duration: Date.now() - startTime
                };
            }
            // 環境変数のフィルタリング
            const env = this.filterEnvironmentVariables(options?.env);
            // タイムアウトの設定
            const timeout = Math.min(options?.timeout || this.config.timeout, this.config.timeout);
            // コマンド実行
            const execOptions = {
                cwd: cwdValidation.validatedPath,
                env,
                shell,
                timeout,
                maxBuffer: 10 * 1024 * 1024, // 10MB
                encoding: 'utf8'
            };
            const result = await execAsync(command, execOptions);
            const duration = Date.now() - startTime;
            logger.debug(`Command executed successfully in ${duration}ms: ${command}`);
            return {
                success: true,
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: 0,
                duration
            };
        }
        catch (error) {
            const duration = Date.now() - startTime;
            logger.error(`Command execution failed: ${command}`, error);
            // エラーの種類を判定
            let errorMessage = 'Unknown error occurred';
            let exitCode;
            if (error.code === 'ETIMEDOUT') {
                errorMessage = `Command timed out after ${this.config.timeout}ms`;
            }
            else if (error.code === 'ENOENT') {
                errorMessage = 'Command not found';
            }
            else if (error.code === 'EACCES') {
                errorMessage = 'Permission denied';
            }
            else if (error.killed) {
                errorMessage = 'Command was killed';
            }
            else if (error.stdout !== undefined && error.stderr !== undefined) {
                // execによるエラー（ゼロ以外の終了コード）
                exitCode = error.code || 1;
                return {
                    success: false,
                    stdout: error.stdout,
                    stderr: error.stderr,
                    exitCode,
                    error: `Command exited with code ${exitCode}`,
                    duration
                };
            }
            else {
                errorMessage = error.message || String(error);
            }
            return {
                success: false,
                error: errorMessage,
                exitCode,
                duration
            };
        }
    }
    /**
     * コマンドを実行（同期的、対話式）
     */
    async executeCommandInteractive(command, options) {
        const startTime = Date.now();
        return new Promise((resolve) => {
            try {
                // コマンドの検証
                const commandValidation = this.validateCommand(command);
                if (!commandValidation.allowed) {
                    resolve({
                        success: false,
                        error: commandValidation.reason,
                        duration: Date.now() - startTime
                    });
                    return;
                }
                // 作業ディレクトリの検証
                const cwdValidation = this.validateWorkingDirectory(options?.cwd);
                if (!cwdValidation.allowed) {
                    resolve({
                        success: false,
                        error: cwdValidation.reason,
                        duration: Date.now() - startTime
                    });
                    return;
                }
                const env = this.filterEnvironmentVariables(options?.env);
                const timeout = Math.min(options?.timeout || this.config.timeout, this.config.timeout);
                // spawnを使用して対話式実行
                const child = spawn('bash', ['-c', command], {
                    cwd: cwdValidation.validatedPath,
                    env,
                    stdio: ['inherit', 'pipe', 'pipe']
                });
                let stdout = '';
                let stderr = '';
                child.stdout?.on('data', (data) => {
                    const output = data.toString();
                    stdout += output;
                    process.stdout.write(output); // リアルタイム出力
                });
                child.stderr?.on('data', (data) => {
                    const output = data.toString();
                    stderr += output;
                    process.stderr.write(output); // リアルタイム出力
                });
                // タイムアウト処理
                const timer = setTimeout(() => {
                    child.kill('SIGTERM');
                    setTimeout(() => child.kill('SIGKILL'), 5000);
                }, timeout);
                child.on('close', (code) => {
                    clearTimeout(timer);
                    const duration = Date.now() - startTime;
                    logger.debug(`Interactive command completed: ${command}, exit code: ${code}, duration: ${duration}ms`);
                    resolve({
                        success: code === 0,
                        stdout,
                        stderr,
                        exitCode: code || 0,
                        error: code !== 0 ? `Command exited with code ${code}` : undefined,
                        duration
                    });
                });
                child.on('error', (error) => {
                    clearTimeout(timer);
                    const duration = Date.now() - startTime;
                    logger.error(`Interactive command error: ${command}`, error);
                    resolve({
                        success: false,
                        error: error.message,
                        duration
                    });
                });
            }
            catch (error) {
                const duration = Date.now() - startTime;
                resolve({
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                    duration
                });
            }
        });
    }
    /**
     * 現在の作業ディレクトリを取得
     */
    getCurrentDirectory() {
        return this.security.getCurrentDirectory();
    }
    /**
     * セキュリティ設定を更新
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.debug('Bash security config updated', this.config);
    }
    /**
     * セキュリティ情報を取得
     */
    getSecurityInfo() {
        return {
            enabled: this.config.enabled,
            allowedCommands: this.config.allowedCommands,
            blockedCommands: this.config.blockedCommands,
            timeout: this.config.timeout,
            restrictWorkingDirectory: this.config.restrictWorkingDirectory,
            allowedShells: this.config.allowedShells,
            currentDirectory: this.getCurrentDirectory()
        };
    }
}
//# sourceMappingURL=bash.js.map
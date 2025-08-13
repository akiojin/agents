import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { AgentState } from '../types/agent-state.js';

interface ExecutionModeDisplayProps {
  agentState: AgentState;
}

/**
 * 実行モード表示コンポーネント
 * 実装進捗とファイル変更状況を表示
 */
export const ExecutionModeDisplay: React.FC<ExecutionModeDisplayProps> = ({ agentState }) => {
  const implementation = agentState.context.implementation;
  const progress = implementation?.progress || 0;
  const filesModified = implementation?.filesModified || [];
  const currentTask = implementation?.currentTask;
  const testsRun = implementation?.testsRun || false;
  const deploymentReady = implementation?.deploymentReady || false;

  const renderProgressBar = () => {
    const filled = Math.floor(progress / 5);
    const empty = 20 - filled;
    
    return (
      <Box flexDirection="row" alignItems="center">
        <Text>[</Text>
        <Text color="green">{'█'.repeat(filled)}</Text>
        <Text color="gray">{'░'.repeat(empty)}</Text>
        <Text>] {progress.toFixed(1)}%</Text>
      </Box>
    );
  };

  const renderCurrentTask = () => {
    if (!currentTask) return null;

    return (
      <Box flexDirection="row" alignItems="center" marginTop={1}>
        <Text color="yellow">🔄 現在の作業: </Text>
        <Text>{currentTask}</Text>
        {progress < 100 && (
          <Box marginLeft={1}>
            <Spinner type="dots" />
          </Box>
        )}
      </Box>
    );
  };

  const renderFileChanges = () => {
    if (filesModified.length === 0) return null;

    const recentFiles = filesModified.slice(-5);
    const hasMore = filesModified.length > 5;

    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold underline>📁 変更ファイル ({filesModified.length}件):</Text>
        <Box flexDirection="column" marginLeft={2}>
          {recentFiles.map(file => (
            <Text key={file} color="yellow">
              ✏️  {file}
            </Text>
          ))}
          {hasMore && (
            <Text dimColor>... 他 {filesModified.length - 5} ファイル</Text>
          )}
        </Box>
      </Box>
    );
  };

  const renderStatusIndicators = () => {
    return (
      <Box flexDirection="row" marginTop={1} gap={2}>
        <Box>
          <Text color={testsRun ? 'green' : 'gray'}>
            {testsRun ? '✅' : '⭕'} テスト
          </Text>
        </Box>
        <Box>
          <Text color={deploymentReady ? 'green' : 'gray'}>
            {deploymentReady ? '✅' : '⭕'} デプロイ準備
          </Text>
        </Box>
        <Box>
          <Text color={progress >= 100 ? 'green' : 'yellow'}>
            {progress >= 100 ? '🎉' : '🚧'} 
            {progress >= 100 ? ' 完了' : ' 実装中'}
          </Text>
        </Box>
      </Box>
    );
  };

  const renderTimeInfo = () => {
    const duration = Date.now() - agentState.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    
    return (
      <Box marginTop={1}>
        <Text dimColor>
          実行時間: {minutes}分{seconds}秒 | 
          セッション: {agentState.sessionId.slice(-4)}
        </Text>
      </Box>
    );
  };

  const renderCompletionMessage = () => {
    if (progress < 100) return null;

    return (
      <Box 
        flexDirection="column" 
        marginTop={1} 
        borderStyle="round" 
        borderColor="green" 
        padding={1}
      >
        <Text bold color="green">🎉 実装完了！</Text>
        <Text>
          {filesModified.length}個のファイルが変更されました。
        </Text>
        {testsRun && (
          <Text color="green">✅ テストも正常に完了しています。</Text>
        )}
        {deploymentReady && (
          <Text color="green">🚀 デプロイ準備が完了しています。</Text>
        )}
      </Box>
    );
  };

  return (
    <Box flexDirection="column" borderStyle="single" borderColor="green" padding={1}>
      {/* ヘッダー */}
      <Box marginBottom={1} flexDirection="row" alignItems="center">
        <Text bold color="green">🚀 実行モード</Text>
        {progress < 100 && (
          <Box marginLeft={1}>
            <Spinner type="dots" />
          </Box>
        )}
      </Box>
      
      {/* 進捗バー */}
      <Box marginBottom={1}>
        <Text>進捗: </Text>
        {renderProgressBar()}
      </Box>
      
      {/* 現在の作業 */}
      {renderCurrentTask()}
      
      {/* ステータスインジケーター */}
      {renderStatusIndicators()}
      
      {/* ファイル変更情報 */}
      {renderFileChanges()}
      
      {/* 完了メッセージ */}
      {renderCompletionMessage()}
      
      {/* 時間情報 */}
      {renderTimeInfo()}
    </Box>
  );
};
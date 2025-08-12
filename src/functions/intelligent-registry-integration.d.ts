/**
 * IntelligentFileSystemとレジストリの統合
 * 既存のRead/Editツールを段階的に置換
 */
import { InternalFunctionRegistry } from './registry.js';
import { AIOptimizationEngine } from '../../packages/core/src/intelligent-fs/ai-optimization.js';
import { IntelligentFileSystem } from '../../packages/core/src/intelligent-fs/intelligent-filesystem.js';
import { MemoryIntegrationManager } from '../../packages/core/src/intelligent-fs/memory-integration.js';
/**
 * インテリジェント機能の統合状態
 */
interface IntegrationState {
    initialized: boolean;
    intelligentFS?: IntelligentFileSystem;
    aiEngine?: AIOptimizationEngine;
    memoryManager?: MemoryIntegrationManager;
    registeredFunctions: Set<string>;
}
/**
 * インテリジェント機能を既存レジストリに統合
 */
export declare function integrateIntelligentFunctions(registry: InternalFunctionRegistry): Promise<void>;
/**
 * 統合状態を取得
 */
export declare function getIntegrationState(): IntegrationState;
/**
 * クリーンアップ
 */
export declare function cleanupIntelligentIntegration(): Promise<void>;
export {};

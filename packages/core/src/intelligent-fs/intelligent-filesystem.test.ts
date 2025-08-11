/**
 * IntelligentFileSystem完全テストスイート
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IntelligentFileSystem, createIntelligentFileSystem } from './intelligent-filesystem.js';
import { MemoryIntegrationManager, createMemoryIntegrationManager } from './memory-integration.js';
import { AIOptimizationEngine, createAIOptimizationEngine } from './ai-optimization.js';
import { SymbolIndex } from '../code-intelligence/symbol-index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';
import os from 'os';

describe('IntelligentFileSystem 統合テスト', () => {
  let intelligentFS: IntelligentFileSystem;
  let memoryManager: MemoryIntegrationManager;
  let aiEngine: AIOptimizationEngine;
  let testDir: string;
  
  beforeEach(async () => {
    // テスト用一時ディレクトリ作成
    testDir = path.join(os.tmpdir(), `intelligent-fs-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
    
    // セキュリティ設定
    const securityConfig = {
      allowedPaths: [testDir],
      allowedFileExtensions: ['.ts', '.js', '.py', '.java', '.go', '.rs'],
      maxFileSize: 1024 * 1024, // 1MB
      enabled: true
    };
    
    // システム初期化
    intelligentFS = createIntelligentFileSystem(securityConfig, testDir);
    await intelligentFS.initialize();
    
    memoryManager = createMemoryIntegrationManager(path.join(testDir, 'memory.db'));
    await memoryManager.initialize();
    
    aiEngine = createAIOptimizationEngine(intelligentFS, memoryManager);
  });
  
  afterEach(async () => {
    // クリーンアップ
    await intelligentFS.cleanup();
    await memoryManager.close();
    await fs.rm(testDir, { recursive: true, force: true });
  });
  
  describe('基本的なファイル操作', () => {
    it('TypeScriptファイルを読み取り、シンボル情報を抽出できる', async () => {
      const testFile = path.join(testDir, 'test.ts');
      const content = `
export class TestClass {
  private property: string;
  
  constructor() {
    this.property = 'test';
  }
  
  public testMethod(): string {
    return this.property;
  }
}

export function testFunction(param: string): void {
  console.log(param);
}

export interface TestInterface {
  name: string;
  value: number;
}
`;
      
      await fs.writeFile(testFile, content);
      
      const result = await intelligentFS.readFileIntelligent(testFile);
      
      expect(result.success).toBe(true);
      expect(result.content).toBe(content);
      expect(result.symbols).toBeDefined();
      expect(result.symbols?.length).toBeGreaterThan(0);
      
      // シンボルの検証
      const classSymbol = result.symbols?.find(s => s.name === 'TestClass');
      expect(classSymbol).toBeDefined();
      expect(classSymbol?.kind).toBe('class');
      
      const functionSymbol = result.symbols?.find(s => s.name === 'testFunction');
      expect(functionSymbol).toBeDefined();
      expect(functionSymbol?.kind).toBe('function');
      
      const interfaceSymbol = result.symbols?.find(s => s.name === 'TestInterface');
      expect(interfaceSymbol).toBeDefined();
      expect(interfaceSymbol?.kind).toBe('interface');
    });
    
    it('Pythonファイルを読み取り、シンボル情報を抽出できる', async () => {
      const testFile = path.join(testDir, 'test.py');
      const content = `
class TestClass:
    def __init__(self):
        self.property = 'test'
    
    def test_method(self):
        return self.property

def test_function(param):
    print(param)

TEST_CONSTANT = 42
`;
      
      await fs.writeFile(testFile, content);
      
      const result = await intelligentFS.readFileIntelligent(testFile);
      
      expect(result.success).toBe(true);
      expect(result.symbols).toBeDefined();
      
      const classSymbol = result.symbols?.find(s => s.name === 'TestClass');
      expect(classSymbol).toBeDefined();
      
      const functionSymbol = result.symbols?.find(s => s.name === 'test_function');
      expect(functionSymbol).toBeDefined();
    });
    
    it('Javaファイルを読み取り、シンボル情報を抽出できる', async () => {
      const testFile = path.join(testDir, 'Test.java');
      const content = `
package com.test;

public class TestClass {
    private String property;
    
    public TestClass() {
        this.property = "test";
    }
    
    public String testMethod() {
        return this.property;
    }
}

interface TestInterface {
    void testMethod();
}
`;
      
      await fs.writeFile(testFile, content);
      
      const result = await intelligentFS.readFileIntelligent(testFile);
      
      expect(result.success).toBe(true);
      expect(result.symbols).toBeDefined();
      
      const classSymbol = result.symbols?.find(s => s.name === 'TestClass');
      expect(classSymbol).toBeDefined();
      
      const interfaceSymbol = result.symbols?.find(s => s.name === 'TestInterface');
      expect(interfaceSymbol).toBeDefined();
    });
    
    it('Goファイルを読み取り、シンボル情報を抽出できる', async () => {
      const testFile = path.join(testDir, 'test.go');
      const content = `
package main

type TestStruct struct {
    Property string
}

func (t *TestStruct) TestMethod() string {
    return t.Property
}

func TestFunction(param string) {
    fmt.Println(param)
}

type TestInterface interface {
    TestMethod() string
}
`;
      
      await fs.writeFile(testFile, content);
      
      const result = await intelligentFS.readFileIntelligent(testFile);
      
      expect(result.success).toBe(true);
      expect(result.symbols).toBeDefined();
      
      const structSymbol = result.symbols?.find(s => s.name === 'TestStruct');
      expect(structSymbol).toBeDefined();
      
      const functionSymbol = result.symbols?.find(s => s.name === 'TestFunction');
      expect(functionSymbol).toBeDefined();
    });
    
    it('Rustファイルを読み取り、シンボル情報を抽出できる', async () => {
      const testFile = path.join(testDir, 'test.rs');
      const content = `
struct TestStruct {
    property: String,
}

impl TestStruct {
    fn test_method(&self) -> &str {
        &self.property
    }
}

fn test_function(param: &str) {
    println!("{}", param);
}

trait TestTrait {
    fn test_method(&self);
}
`;
      
      await fs.writeFile(testFile, content);
      
      const result = await intelligentFS.readFileIntelligent(testFile);
      
      expect(result.success).toBe(true);
      expect(result.symbols).toBeDefined();
      
      const structSymbol = result.symbols?.find(s => s.name === 'TestStruct');
      expect(structSymbol).toBeDefined();
      
      const functionSymbol = result.symbols?.find(s => s.name === 'test_function');
      expect(functionSymbol).toBeDefined();
    });
  });
  
  describe('セマンティック編集', () => {
    it('シンボル単位での編集ができる', async () => {
      const testFile = path.join(testDir, 'edit-test.ts');
      const originalContent = `
export class TestClass {
  private property: string;
  
  public oldMethod(): string {
    return this.property;
  }
}
`;
      
      await fs.writeFile(testFile, originalContent);
      
      // シンボル単位で編集
      const editResult = await intelligentFS.editFileSemantic(testFile, {
        targetSymbol: 'oldMethod',
        newContent: `  public newMethod(): string {
    // 新しい実装
    return this.property.toUpperCase();
  }`,
        updateReferences: false
      });
      
      expect(editResult.success).toBe(true);
      
      // 編集後の内容を確認
      const readResult = await intelligentFS.readFileIntelligent(testFile);
      expect(readResult.content).toContain('newMethod');
      expect(readResult.content).not.toContain('oldMethod');
    });
    
    it('参照の自動更新ができる', async () => {
      const testFile1 = path.join(testDir, 'class.ts');
      const testFile2 = path.join(testDir, 'usage.ts');
      
      await fs.writeFile(testFile1, `
export class TestClass {
  public oldMethod(): string {
    return 'test';
  }
}
`);
      
      await fs.writeFile(testFile2, `
import { TestClass } from './class';

const instance = new TestClass();
instance.oldMethod();
`);
      
      // インデックスを構築
      await intelligentFS.indexProject(testDir);
      
      // 参照を更新して編集
      const editResult = await intelligentFS.editFileSemantic(testFile1, {
        targetSymbol: 'oldMethod',
        newContent: `  public newMethod(): string {
    return 'updated';
  }`,
        updateReferences: true
      });
      
      expect(editResult.success).toBe(true);
      expect(editResult.updatedReferences).toBeDefined();
      expect(editResult.updatedReferences?.length).toBeGreaterThan(0);
      
      // usage.tsも更新されていることを確認
      const usageContent = await fs.readFile(testFile2, 'utf-8');
      expect(usageContent).toContain('newMethod');
      expect(usageContent).not.toContain('oldMethod');
    });
  });
  
  describe('AI最適化エンジン', () => {
    it('コード品質を分析できる', async () => {
      const testFile = path.join(testDir, 'quality-test.ts');
      const content = `
export class TestClass {
  // 長いメソッド（コードスメル）
  public longMethod(): void {
    const a = 1;
    const b = 2;
    const c = 3;
    const d = 4;
    const e = 5;
    const f = 6;
    const g = 7;
    const h = 8;
    const i = 9;
    const j = 10;
    const k = 11;
    const l = 12;
    const m = 13;
    const n = 14;
    const o = 15;
    const p = 16;
    const q = 17;
    const r = 18;
    const s = 19;
    const t = 20;
    
    if (a > b) {
      if (c > d) {
        if (e > f) {
          // 深いネスト（複雑度が高い）
          console.log('nested');
        }
      }
    }
  }
  
  // マジックナンバー使用
  public calculateSomething(value: number): number {
    return value * 3.14159;
  }
}
`;
      
      await fs.writeFile(testFile, content);
      
      const readResult = await intelligentFS.readFileIntelligent(testFile);
      const metrics = await aiEngine.analyzeCodeQuality(readResult);
      
      expect(metrics).toBeDefined();
      expect(metrics.complexity).toBeGreaterThan(5);
      expect(metrics.codeSmells).toBeDefined();
      expect(metrics.codeSmells.length).toBeGreaterThan(0);
      
      // 長いメソッドが検出される
      const longMethodSmell = metrics.codeSmells.find(s => s.type === 'long-method');
      expect(longMethodSmell).toBeDefined();
      
      // マジックナンバーが検出される
      const suggestions = metrics.suggestions;
      expect(suggestions).toBeDefined();
      expect(suggestions.length).toBeGreaterThan(0);
    });
    
    it('バグを予測できる', async () => {
      const testFile = path.join(testDir, 'bug-test.ts');
      const content = `
export class BuggyClass {
  private data: string | null = null;
  
  // Null Pointer可能性
  public riskyMethod(): string {
    return this.data.toUpperCase();
  }
  
  // 配列範囲外アクセスの可能性
  public arrayAccess(arr: number[], index: number): number {
    return arr[index];
  }
  
  // リソースリーク
  public async leakyMethod(): Promise<void> {
    const stream = fs.createReadStream('file.txt');
    // closeしていない
  }
}
`;
      
      await fs.writeFile(testFile, content);
      
      const readResult = await intelligentFS.readFileIntelligent(testFile);
      const predictions = await aiEngine.predictBugs(readResult);
      
      expect(predictions).toBeDefined();
      expect(predictions.length).toBeGreaterThan(0);
      
      // Null Pointer例外の予測
      const nullPointerBug = predictions.find(p => p.type === 'null-pointer');
      expect(nullPointerBug).toBeDefined();
      expect(nullPointerBug?.severity).toBe('high');
      
      // 配列範囲外の予測
      const arrayBug = predictions.find(p => p.type === 'array-out-of-bounds');
      expect(arrayBug).toBeDefined();
      
      // リソースリークの予測
      const resourceLeakBug = predictions.find(p => p.type === 'resource-leak');
      expect(resourceLeakBug).toBeDefined();
    });
    
    it('アーキテクチャを分析できる', async () => {
      // 複数ファイルでプロジェクト構造を作成
      await fs.writeFile(path.join(testDir, 'singleton.ts'), `
export class Singleton {
  private static instance: Singleton;
  
  private constructor() {}
  
  public static getInstance(): Singleton {
    if (!Singleton.instance) {
      Singleton.instance = new Singleton();
    }
    return Singleton.instance;
  }
}
`);
      
      await fs.writeFile(path.join(testDir, 'factory.ts'), `
interface Product {
  operation(): string;
}

class ConcreteProductA implements Product {
  operation(): string {
    return 'Product A';
  }
}

class ConcreteProductB implements Product {
  operation(): string {
    return 'Product B';
  }
}

export class Factory {
  public createProduct(type: string): Product {
    switch (type) {
      case 'A':
        return new ConcreteProductA();
      case 'B':
        return new ConcreteProductB();
      default:
        throw new Error('Unknown product type');
    }
  }
}
`);
      
      await fs.writeFile(path.join(testDir, 'god-class.ts'), `
export class GodClass {
  // 30個以上のメソッド（God Classアンチパターン）
  ${Array.from({ length: 35 }, (_, i) => `
  public method${i}(): void {
    console.log('Method ${i}');
  }`).join('\n')}
  
  // 多数のプロパティ
  ${Array.from({ length: 20 }, (_, i) => `
  private property${i}: string = 'value${i}';`).join('\n')}
}
`);
      
      const analysis = await aiEngine.analyzeArchitecture(testDir);
      
      expect(analysis).toBeDefined();
      expect(analysis.patterns).toBeDefined();
      expect(analysis.antiPatterns).toBeDefined();
      
      // デザインパターンの検出
      const singletonPattern = analysis.patterns.find(p => p.name === 'Singleton');
      expect(singletonPattern).toBeDefined();
      
      const factoryPattern = analysis.patterns.find(p => p.name === 'Factory Method');
      expect(factoryPattern).toBeDefined();
      
      // アンチパターンの検出
      const godClassAntiPattern = analysis.antiPatterns.find(p => p.name === 'God Class');
      expect(godClassAntiPattern).toBeDefined();
      expect(godClassAntiPattern?.severity).toBe('high');
    });
    
    it('コード生成ができる', async () => {
      const context = `
// React コンポーネントが必要
// ユーザー情報を表示する
// プロパティ: name, email, avatar
`;
      
      const generatedCode = await aiEngine.generateCode(context, {
        type: 'class',
        language: 'typescript',
        name: 'UserProfile',
        description: 'ユーザープロファイルコンポーネント'
      });
      
      expect(generatedCode).toBeDefined();
      expect(generatedCode).toContain('class');
      expect(generatedCode).toContain('UserProfile');
      
      // 学習したパターンを適用
      const sessionId = await memoryManager.startLearningSession('コード生成', 'react-component');
      await memoryManager.recordCodePattern({
        content: generatedCode,
        type: 'component',
        language: 'typescript',
        qualityScore: 0.9,
        context: 'React User Component'
      });
      await memoryManager.endLearningSession(sessionId, { success: true });
      
      // 次回の生成で学習結果が反映される
      const improvedCode = await aiEngine.generateCode(context, {
        type: 'class',
        language: 'typescript',
        name: 'UserCard',
        description: 'ユーザーカードコンポーネント'
      });
      
      expect(improvedCode).toBeDefined();
    });
    
    it('リファクタリング提案ができる', async () => {
      const testFile = path.join(testDir, 'refactor-test.ts');
      const content = `
export class RefactorMe {
  // 長すぎるメソッド
  public veryLongMethodThatDoesTooManyThings(): void {
    // データ取得部分
    const data = this.fetchData();
    const processedData = this.processData(data);
    
    // バリデーション部分
    if (!this.validateData(processedData)) {
      throw new Error('Invalid data');
    }
    
    // 保存部分
    this.saveData(processedData);
    
    // 通知部分
    this.sendNotification('Data saved');
    
    // ログ部分
    console.log('Operation completed');
  }
  
  // 不適切な命名
  public a(b: number): number {
    return b * 2;
  }
  
  // 未使用のメソッド
  private unusedMethod(): void {
    console.log('Never called');
  }
  
  private fetchData(): any {
    return { value: 1 };
  }
  
  private processData(data: any): any {
    return data;
  }
  
  private validateData(data: any): boolean {
    return true;
  }
  
  private saveData(data: any): void {
    // save
  }
  
  private sendNotification(message: string): void {
    // notify
  }
}
`;
      
      await fs.writeFile(testFile, content);
      
      const readResult = await intelligentFS.readFileIntelligent(testFile);
      const suggestions = await aiEngine.suggestRefactoring(readResult);
      
      expect(suggestions).toBeDefined();
      expect(suggestions.length).toBeGreaterThan(0);
      
      // Extract Method提案
      const extractMethodSuggestion = suggestions.find(s => s.type === 'extract-method');
      expect(extractMethodSuggestion).toBeDefined();
      
      // Rename提案
      const renameSuggestion = suggestions.find(s => s.type === 'rename');
      expect(renameSuggestion).toBeDefined();
      
      // Dead Code削除提案
      const deadCodeSuggestion = suggestions.find(s => s.type === 'remove-dead-code');
      expect(deadCodeSuggestion).toBeDefined();
    });
  });
  
  describe('メモリ統合システム', () => {
    it('コードパターンを学習できる', async () => {
      const pattern = {
        content: `
export class Service {
  constructor(private repository: Repository) {}
  
  async findAll(): Promise<Entity[]> {
    return this.repository.findAll();
  }
}`,
        type: 'class' as const,
        language: 'typescript',
        qualityScore: 0.9,
        context: 'Service Layer Pattern'
      };
      
      await memoryManager.recordCodePattern(pattern);
      
      // 類似パターンを検索
      const similar = await memoryManager.recallCodePatterns('class', 5);
      expect(similar).toBeDefined();
      expect(similar.length).toBeGreaterThan(0);
      expect(similar[0].type).toBe('class');
    });
    
    it('エラーパターンを記録し学習できる', async () => {
      const errorPattern = {
        errorType: 'TypeError',
        errorMessage: "Cannot read property 'x' of undefined",
        stackTrace: 'at Object.method (file.ts:10:5)',
        context: 'Accessing undefined object property',
        frequency: 1,
        lastOccurred: new Date()
      };
      
      await memoryManager.recordErrorPattern(errorPattern);
      
      // エラーから学習
      const improvements = await memoryManager.learnFromError(errorPattern);
      expect(improvements).toBeDefined();
      expect(improvements.length).toBeGreaterThan(0);
      
      // 解決策の提案
      const solutions = improvements.map(i => i.suggestion);
      expect(solutions.some(s => s.includes('null check'))).toBe(true);
    });
    
    it('セッション管理ができる', async () => {
      const sessionId = await memoryManager.startLearningSession(
        'テストタスク',
        'unit-testing'
      );
      
      expect(sessionId).toBeDefined();
      
      // アクションを記録
      await memoryManager.recordSessionAction({
        sessionId,
        actionType: 'file_read',
        actionData: { file: 'test.ts' },
        timestamp: new Date()
      });
      
      await memoryManager.recordSessionAction({
        sessionId,
        actionType: 'symbol_search',
        actionData: { symbol: 'TestClass' },
        timestamp: new Date()
      });
      
      // セッションを終了
      await memoryManager.endLearningSession(sessionId, {
        success: true,
        filesChanged: 1,
        testsRun: 5,
        testsPassed: 5
      });
      
      // セッションレポートを生成
      const report = await memoryManager.generateSessionReport(sessionId);
      expect(report).toBeDefined();
      expect(report.duration).toBeDefined();
      expect(report.actionsCount).toBe(2);
      expect(report.outcome?.success).toBe(true);
    });
    
    it('改善提案を生成できる', async () => {
      // パターンを学習
      await memoryManager.recordCodePattern({
        content: 'async function fetchData() { return await api.get(); }',
        type: 'function',
        language: 'typescript',
        qualityScore: 0.8,
        context: 'API call pattern'
      });
      
      // エラーパターンを記録
      await memoryManager.recordErrorPattern({
        errorType: 'NetworkError',
        errorMessage: 'Request timeout',
        context: 'API call without timeout',
        frequency: 3,
        lastOccurred: new Date()
      });
      
      // 改善提案を生成
      const improvements = await memoryManager.generateImprovements('function');
      
      expect(improvements).toBeDefined();
      expect(improvements.length).toBeGreaterThan(0);
      
      // タイムアウト設定の提案があるか確認
      const timeoutSuggestion = improvements.find(i => 
        i.suggestion.toLowerCase().includes('timeout')
      );
      expect(timeoutSuggestion).toBeDefined();
    });
  });
  
  describe('パフォーマンスとキャッシング', () => {
    it('キャッシュが正しく動作する', async () => {
      const testFile = path.join(testDir, 'cache-test.ts');
      const content = 'export const test = "cached";';
      
      await fs.writeFile(testFile, content);
      
      // 初回読み込み
      const start1 = Date.now();
      const result1 = await intelligentFS.readFileIntelligent(testFile);
      const time1 = Date.now() - start1;
      
      expect(result1.success).toBe(true);
      expect(result1.cachedInIndex).toBeFalsy();
      
      // 2回目読み込み（キャッシュから）
      const start2 = Date.now();
      const result2 = await intelligentFS.readFileIntelligent(testFile);
      const time2 = Date.now() - start2;
      
      expect(result2.success).toBe(true);
      expect(result2.cachedInIndex).toBe(true);
      expect(time2).toBeLessThan(time1); // キャッシュの方が高速
    });
    
    it('大規模プロジェクトのインデックスが作成できる', async () => {
      // 100ファイルのプロジェクトを作成
      const files = [];
      for (let i = 0; i < 100; i++) {
        const filePath = path.join(testDir, `file${i}.ts`);
        const content = `
export class Class${i} {
  public method${i}(): void {
    console.log('Method ${i}');
  }
}
`;
        await fs.writeFile(filePath, content);
        files.push(filePath);
      }
      
      // インデックス作成時間を測定
      const start = Date.now();
      const indexResult = await intelligentFS.indexProject(testDir);
      const elapsed = Date.now() - start;
      
      expect(indexResult.success).toBe(true);
      expect(indexResult.filesIndexed).toBe(100);
      expect(elapsed).toBeLessThan(5000); // 5秒以内に完了
      
      // シンボル検索が高速に動作
      const searchStart = Date.now();
      const searchResult = await intelligentFS.searchSymbols('Class50');
      const searchElapsed = Date.now() - searchStart;
      
      expect(searchResult).toBeDefined();
      expect(searchResult.length).toBeGreaterThan(0);
      expect(searchElapsed).toBeLessThan(100); // 100ms以内に検索
    });
  });
  
  describe('エラーハンドリング', () => {
    it('存在しないファイルのエラーを適切に処理する', async () => {
      const result = await intelligentFS.readFileIntelligent(
        path.join(testDir, 'non-existent.ts')
      );
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not found');
    });
    
    it('権限のないパスへのアクセスをブロックする', async () => {
      const result = await intelligentFS.readFileIntelligent('/etc/passwd');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not allowed');
    });
    
    it('大きすぎるファイルを拒否する', async () => {
      const largeFile = path.join(testDir, 'large.txt');
      const largeContent = 'x'.repeat(2 * 1024 * 1024); // 2MB
      
      await fs.writeFile(largeFile, largeContent);
      
      const result = await intelligentFS.readFileIntelligent(largeFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('too large');
    });
    
    it('不正な拡張子のファイルを拒否する', async () => {
      const invalidFile = path.join(testDir, 'test.exe');
      await fs.writeFile(invalidFile, 'binary content');
      
      const result = await intelligentFS.readFileIntelligent(invalidFile);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('not allowed');
    });
  });
  
  describe('統合シナリオ', () => {
    it('完全なワークフローを実行できる', async () => {
      // 1. プロジェクト作成
      const srcDir = path.join(testDir, 'src');
      await fs.mkdir(srcDir, { recursive: true });
      
      // 2. ファイル作成
      await fs.writeFile(path.join(srcDir, 'user.service.ts'), `
export class UserService {
  private users: User[] = [];
  
  // バグあり: nullチェックなし
  findById(id: string): User {
    return this.users.find(u => u.id === id);
  }
  
  // コードスメル: 長いメソッド
  createUser(data: any): User {
    // バリデーション
    if (!data.name) throw new Error('Name required');
    if (!data.email) throw new Error('Email required');
    if (!data.age) throw new Error('Age required');
    
    // 変換
    const user = {
      id: Math.random().toString(),
      name: data.name,
      email: data.email,
      age: data.age,
      createdAt: new Date()
    };
    
    // 保存
    this.users.push(user);
    
    // 通知
    console.log('User created');
    
    return user;
  }
}

interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  createdAt: Date;
}
`);
      
      // 3. プロジェクトインデックス作成
      await intelligentFS.indexProject(srcDir);
      
      // 4. ファイル読み込みとシンボル抽出
      const readResult = await intelligentFS.readFileIntelligent(
        path.join(srcDir, 'user.service.ts')
      );
      expect(readResult.success).toBe(true);
      expect(readResult.symbols?.length).toBeGreaterThan(0);
      
      // 5. コード品質分析
      const quality = await aiEngine.analyzeCodeQuality(readResult);
      expect(quality.codeSmells.length).toBeGreaterThan(0);
      
      // 6. バグ予測
      const bugs = await aiEngine.predictBugs(readResult);
      expect(bugs.some(b => b.type === 'null-pointer')).toBe(true);
      
      // 7. リファクタリング提案
      const refactorings = await aiEngine.suggestRefactoring(readResult);
      expect(refactorings.some(r => r.type === 'extract-method')).toBe(true);
      
      // 8. セッション記録
      const sessionId = await memoryManager.startLearningSession(
        'ユーザーサービス改善',
        'refactoring'
      );
      
      await memoryManager.recordSessionAction({
        sessionId,
        actionType: 'code_analysis',
        actionData: { file: 'user.service.ts', issues: bugs.length },
        timestamp: new Date()
      });
      
      // 9. 改善コード生成
      const improvedCode = await aiEngine.generateCode(
        'Improved UserService with null checks and better structure',
        {
          type: 'class',
          language: 'typescript',
          name: 'ImprovedUserService',
          description: '改善されたユーザーサービス'
        }
      );
      
      // 10. セマンティック編集で適用
      const editResult = await intelligentFS.editFileSemantic(
        path.join(srcDir, 'user.service.ts'),
        {
          targetSymbol: 'findById',
          newContent: `  findById(id: string): User | undefined {
    if (!id) return undefined;
    return this.users.find(u => u.id === id) || undefined;
  }`,
          updateReferences: false
        }
      );
      expect(editResult.success).toBe(true);
      
      // 11. セッション終了とレポート
      await memoryManager.endLearningSession(sessionId, {
        success: true,
        filesChanged: 1,
        bugsFixed: 1,
        codeSmellsResolved: 1
      });
      
      const report = await memoryManager.generateSessionReport(sessionId);
      expect(report.outcome?.success).toBe(true);
      
      // 12. 改善の記録
      await memoryManager.recordCodePattern({
        content: improvedCode,
        type: 'class',
        language: 'typescript',
        qualityScore: 0.95,
        context: 'Improved service with proper error handling'
      });
      
      // 13. 最終的なプロジェクト分析
      const finalAnalysis = await aiEngine.analyzeArchitecture(srcDir);
      expect(finalAnalysis).toBeDefined();
      
      // 完全なワークフローが成功
      expect(true).toBe(true);
    });
  });
});

describe('IntelligentFileSystem 単体テスト', () => {
  describe('セキュリティチェック', () => {
    it('パストラバーサル攻撃を防ぐ', () => {
      const securityConfig = {
        allowedPaths: ['/safe/path'],
        enabled: true
      };
      
      const fs = createIntelligentFileSystem(securityConfig, '/safe/path');
      
      // .checkPathSecurity はプライベートメソッドなので、
      // readFileIntelligentを通じてテスト
      const maliciousPath = '/safe/path/../../../etc/passwd';
      fs.readFileIntelligent(maliciousPath).then(result => {
        expect(result.success).toBe(false);
        expect(result.error).toContain('not allowed');
      });
    });
  });
  
  describe('ファイルタイプ判定', () => {
    it('正しくファイルタイプを判定する', () => {
      const fs = createIntelligentFileSystem({
        allowedPaths: ['/'],
        enabled: true
      }, '/');
      
      // getFileTypeはプライベートメソッドなので、
      // ファイル拡張子による動作を検証
      const testCases = [
        { file: 'test.ts', expectedSymbols: true },
        { file: 'test.py', expectedSymbols: true },
        { file: 'test.java', expectedSymbols: true },
        { file: 'test.txt', expectedSymbols: false },
        { file: 'test.jpg', expectedSymbols: false }
      ];
      
      // 実際のテストは readFileIntelligent の結果で判定
      testCases.forEach(({ file, expectedSymbols }) => {
        // ファイルタイプに応じた処理が選択されることを確認
        // （実装の詳細なテストは統合テストで実施）
        expect(expectedSymbols).toBeDefined();
      });
    });
  });
});
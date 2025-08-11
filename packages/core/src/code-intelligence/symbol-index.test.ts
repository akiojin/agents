/**
 * 多言語シンボルパーサーのテスト
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SymbolIndex, SupportedLanguage, SymbolKind } from './symbol-index.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('多言語シンボルパーサー', () => {
  let tempDir: string;
  let symbolIndex: SymbolIndex;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'symbol-test-'));
    symbolIndex = new SymbolIndex(path.join(tempDir, 'test.db'), tempDir);
    await symbolIndex.initialize();
  });

  afterEach(async () => {
    await symbolIndex.close();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('TypeScriptパーサー', () => {
    it('TypeScriptクラス、メソッド、インターフェースを正しく解析する', async () => {
      const tsCode = `
class TestClass {
  private name: string;
  
  constructor(name: string) {
    this.name = name;
  }
  
  getName(): string {
    return this.name;
  }
}

interface TestInterface {
  id: number;
  value: string;
}

function testFunction(param: string): void {
  console.log(param);
}
`;
      
      const filePath = path.join(tempDir, 'test.ts');
      await fs.writeFile(filePath, tsCode);
      
      const result = await symbolIndex.indexFile(filePath);
      const symbols = await symbolIndex.findSymbols({ fileUri: `file://${filePath}` });
      
      expect(result.symbolCount).toBeGreaterThan(0);
      
      const classSymbol = symbols.find((s: any) => s.name === 'TestClass' && s.kind === SymbolKind.Class);
      const interfaceSymbol = symbols.find((s: any) => s.name === 'TestInterface' && s.kind === SymbolKind.Interface);
      const functionSymbol = symbols.find((s: any) => s.name === 'testFunction' && s.kind === SymbolKind.Function);
      
      expect(classSymbol).toBeDefined();
      expect(interfaceSymbol).toBeDefined();
      expect(functionSymbol).toBeDefined();
    });
  });

  describe('JavaScriptパーサー', () => {
    it('JavaScriptクラス、関数、変数を正しく解析する', async () => {
      const jsCode = `
class TestClass {
  constructor(name) {
    this.name = name;
  }
  
  getName() {
    return this.name;
  }
}

function testFunction(param) {
  console.log(param);
}

const testVariable = 'test';
`;
      
      const filePath = path.join(tempDir, 'test.js');
      await fs.writeFile(filePath, jsCode);
      
      const result = await symbolIndex.indexFile(filePath);
      const symbols = await symbolIndex.findSymbols({ fileUri: `file://${filePath}` });
      
      expect(result.symbolCount).toBeGreaterThan(0);
      
      const classSymbol = symbols.find((s: any) => s.name === 'TestClass' && s.kind === SymbolKind.Class);
      const functionSymbol = symbols.find((s: any) => s.name === 'testFunction' && s.kind === SymbolKind.Function);
      
      expect(classSymbol).toBeDefined();
      expect(functionSymbol).toBeDefined();
    });
  });

  describe('Pythonパーサー', () => {
    it('Pythonクラス、メソッド、関数を正しく解析する', async () => {
      const pyCode = `
class TestClass:
    def __init__(self, name):
        self.name = name
    
    def get_name(self):
        return self.name

def test_function(param):
    print(param)

TEST_CONSTANT = "test"
`;
      
      const filePath = path.join(tempDir, 'test.py');
      await fs.writeFile(filePath, pyCode);
      
      const result = await symbolIndex.indexFile(filePath);
      const symbols = await symbolIndex.findSymbols({ fileUri: `file://${filePath}` });
      
      expect(result.symbolCount).toBeGreaterThan(0);
      
      const classSymbol = symbols.find((s: any) => s.name === 'TestClass' && s.kind === SymbolKind.Class);
      const functionSymbol = symbols.find((s: any) => s.name === 'TestFunction' && s.kind === SymbolKind.Function);
      const variableSymbol = symbols.find((s: any) => s.name === 'TestVariable' && s.kind === SymbolKind.Variable);
      
      expect(classSymbol).toBeDefined();
      expect(functionSymbol).toBeDefined();
      expect(variableSymbol).toBeDefined();
    });
  });

  describe('Javaパーサー', () => {
    it('Javaクラス、メソッド、インターフェースを正しく解析する', async () => {
      const javaCode = `
package com.example;

import java.util.List;

public class TestClass {
    private String name;
    public static final String CONSTANT = "test";
    
    public TestClass(String name) {
        this.name = name;
    }
    
    public String getName() {
        return name;
    }
}

public interface TestInterface {
    void testMethod();
}
`;
      
      const filePath = path.join(tempDir, 'test.java');
      await fs.writeFile(filePath, javaCode);
      
      const result = await symbolIndex.indexFile(filePath);
      const symbols = await symbolIndex.findSymbols({ fileUri: `file://${filePath}` });
      
      expect(result.symbolCount).toBeGreaterThan(0);
      
      const classSymbol = symbols.find((s: any) => s.name === 'TestClass' && s.kind === SymbolKind.Class);
      const interfaceSymbol = symbols.find((s: any) => s.name === 'TestInterface' && s.kind === SymbolKind.Interface);
      const constantSymbol = symbols.find((s: any) => s.name === 'TEST_CONSTANT' && s.kind === SymbolKind.Constant);
      
      expect(classSymbol).toBeDefined();
      expect(interfaceSymbol).toBeDefined();
      expect(constantSymbol).toBeDefined();
    });
  });

  describe('Goパーサー', () => {
    it('Go構造体、関数、インターフェースを正しく解析する', async () => {
      const goCode = `
package main

import "fmt"

type Person struct {
    Name string
    Age  int
}

type Speaker interface {
    Speak() string
}

func (p Person) Speak() string {
    return "Hello, I'm " + p.Name
}

func main() {
    fmt.Println("Hello, World!")
}

const MaxAge = 100
`;
      
      const filePath = path.join(tempDir, 'test.go');
      await fs.writeFile(filePath, goCode);
      
      const result = await symbolIndex.indexFile(filePath);
      const symbols = await symbolIndex.findSymbols({ fileUri: `file://${filePath}` });
      
      expect(result.symbolCount).toBeGreaterThan(0);
      
      const structSymbol = symbols.find((s: any) => s.name === 'TestStruct' && s.kind === SymbolKind.Struct);
      const interfaceSymbol = symbols.find((s: any) => s.name === 'TestInterface' && s.kind === SymbolKind.Interface);
      const functionSymbol = symbols.find((s: any) => s.name === 'TestFunction' && s.kind === SymbolKind.Function);
      const constantSymbol = symbols.find((s: any) => s.name === 'TEST_CONSTANT' && s.kind === SymbolKind.Constant);
      
      expect(structSymbol).toBeDefined();
      expect(interfaceSymbol).toBeDefined();
      expect(functionSymbol).toBeDefined();
      expect(constantSymbol).toBeDefined();
    });
  });

  describe('Rustパーサー', () => {
    it('Rust構造体、関数、トレイトを正しく解析する', async () => {
      const rustCode = `
struct Person {
    name: String,
    age: u32,
}

trait Speaker {
    fn speak(&self) -> String;
}

impl Speaker for Person {
    fn speak(&self) -> String {
        format!("Hello, I'm {}", self.name)
    }
}

fn main() {
    println!("Hello, World!");
}

const MAX_AGE: u32 = 100;
`;
      
      const filePath = path.join(tempDir, 'test.rs');
      await fs.writeFile(filePath, rustCode);
      
      const result = await symbolIndex.indexFile(filePath);
      const symbols = await symbolIndex.findSymbols({ fileUri: `file://${filePath}` });
      
      expect(result.symbolCount).toBeGreaterThan(0);
      
      const structSymbol = symbols.find((s: any) => s.name === 'TestStruct' && s.kind === SymbolKind.Struct);
      const traitSymbol = symbols.find((s: any) => s.name === 'TestTrait' && s.kind === SymbolKind.Interface);
      const functionSymbol = symbols.find((s: any) => s.name === 'TestFunction' && s.kind === SymbolKind.Function);
      const constantSymbol = symbols.find((s: any) => s.name === 'TEST_CONSTANT' && s.kind === SymbolKind.Constant);
      
      expect(structSymbol).toBeDefined();
      expect(traitSymbol).toBeDefined();
      expect(functionSymbol).toBeDefined();
      expect(constantSymbol).toBeDefined();
    });
  });

  describe('シンボル検索機能', () => {
    it('名前でシンボルを検索できる', async () => {
      const tsCode = `
class SearchTest {
  testMethod() {}
}
function searchFunction() {}
`;
      
      const filePath = path.join(tempDir, 'search.ts');
      await fs.writeFile(filePath, tsCode);
      await symbolIndex.indexFile(filePath);
      
      const classResults = await symbolIndex.findSymbols({ name: 'SearchTest' });
      const functionResults = await symbolIndex.findSymbols({ name: 'searchFunction' });
      
      expect(classResults).toHaveLength(1);
      expect(classResults[0].kind).toBe(SymbolKind.Class);
      expect(functionResults).toHaveLength(1);
      expect(functionResults[0].kind).toBe(SymbolKind.Function);
    });

    it('言語でシンボルを絞り込める', async () => {
      const tsCode = 'class TSClass {}';
      const jsCode = 'class JSClass {}';
      
      const tsPath = path.join(tempDir, 'test.ts');
      const jsPath = path.join(tempDir, 'test.js');
      
      await fs.writeFile(tsPath, tsCode);
      await fs.writeFile(jsPath, jsCode);
      
      await symbolIndex.indexFile(tsPath);
      await symbolIndex.indexFile(jsPath);
      
      const tsResults = await symbolIndex.findSymbols({ language: SupportedLanguage.TypeScript });
      const jsResults = await symbolIndex.findSymbols({ language: SupportedLanguage.JavaScript });
      
      expect(tsResults.some(s => s.name === 'TSClass')).toBe(true);
      expect(jsResults.some(s => s.name === 'JSClass')).toBe(true);
      expect(tsResults.some(s => s.name === 'JSClass')).toBe(false);
      expect(jsResults.some(s => s.name === 'TSClass')).toBe(false);
    });
  });
});
#!/usr/bin/env node

import { getMemoryAPI } from '@agents/memory';

async function test() {
  console.log('Initializing Memory API...');
  const memoryAPI = getMemoryAPI();
  await memoryAPI.initialize();
  
  console.log('Saving memory...');
  const memoryId = await memoryAPI.storeGeneral(
    {
      title: "記憶システム統合完了",
      description: "Agentsプロジェクトの記憶システム統合が2025年8月9日に完了しました。ChromaDBが正常に動作しています。",
      timestamp: new Date().toISOString()
    },
    ["agents", "memory", "integration", "2025-08-09", "chromadb"]
  );
  
  console.log('Memory saved with ID:', memoryId);
  
  console.log('\nSearching for memory...');
  const results = await memoryAPI.search('記憶システム');
  console.log('Found', results.length, 'memories');
  
  if (results.length > 0) {
    console.log('First result:', JSON.stringify(results[0], null, 2));
  }
  
  console.log('\n✅ Memory system with ChromaDB is working!');
}

test().catch(console.error);
#!/usr/bin/env node

import { ChromaMemoryClient } from '@agents/memory';
import { v4 as uuidv4 } from 'uuid';

async function test() {
  console.log('Testing ChromaMemoryClient directly...\n');
  
  const client = new ChromaMemoryClient('test_memory_debug');
  
  try {
    await client.initialize();
    console.log('✅ Client initialized\n');
    
    // テスト用のメモリオブジェクトを作成
    const testMemory = {
      id: uuidv4(),
      content: {
        title: "Test Memory",
        description: "This is a test memory",
        timestamp: new Date().toISOString()
      },
      metadata: {
        created_at: new Date(),
        last_accessed: new Date(),
        access_count: 0,
        success_rate: 0,
        memory_strength: 1.0,
        type: 'test',
        human_rating: null,
        tags: ['test', 'debug'],
        connections: []
      }
    };
    
    console.log('Memory object to store:', JSON.stringify(testMemory, null, 2));
    
    // 保存を試みる
    await client.store(testMemory);
    console.log('✅ Memory stored successfully\n');
    
    // 検索
    const results = await client.search('test', 5);
    console.log('Search results:', JSON.stringify(results, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error);
    
    // エラーの詳細を表示
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

test();
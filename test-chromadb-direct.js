#!/usr/bin/env node

import { ChromaClient } from 'chromadb';

async function test() {
  console.log('Testing ChromaDB directly...\n');
  
  // Docker環境内かどうかを判定
  const hostname = process.env.HOSTNAME || '';
  const isInDocker = hostname.length === 12 && /^[a-f0-9]{12}$/.test(hostname);
  const chromaHost = isInDocker ? 'host.docker.internal' : 'localhost';
  
  console.log('Using ChromaDB host:', chromaHost);
  
  const client = new ChromaClient({
    host: chromaHost,
    port: 8000,
    ssl: false
  });
  
  try {
    // コレクションを作成
    const collection = await client.getOrCreateCollection({
      name: 'test_direct',
      metadata: { description: 'Direct test' }
    });
    console.log('✅ Collection created');
    
    // シンプルなデータを追加
    await collection.add({
      ids: ['test1'],
      documents: ['This is a test document'],
      metadatas: [{
        created_at: new Date().toISOString(),
        type: 'test',
        count: 1,
        active: true
      }]
    });
    console.log('✅ Document added');
    
    // 検索
    const results = await collection.query({
      queryTexts: ['test'],
      nResults: 1
    });
    console.log('✅ Search completed');
    console.log('Results:', JSON.stringify(results, null, 2));
    
    // クリーンアップ
    await client.deleteCollection({ name: 'test_direct' });
    console.log('✅ Collection deleted');
    
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

test();
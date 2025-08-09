#!/usr/bin/env node

import { ChromaClient } from 'chromadb';

async function testConnection() {
  const chromaHost = process.env.CHROMA_HOST || 'localhost';
  const chromaPort = process.env.CHROMA_PORT || '8000';
  
  console.log(`Testing ChromaDB connection to: http://${chromaHost}:${chromaPort}`);
  
  try {
    const client = new ChromaClient({
      host: chromaHost,
      port: parseInt(chromaPort),
      ssl: false
    });
    
    // テスト用コレクションを作成
    const collection = await client.getOrCreateCollection({
      name: 'test_collection',
      metadata: { description: 'Test collection' }
    });
    
    console.log('✅ Successfully connected to ChromaDB');
    console.log('Collection created:', collection.name);
    
    // クリーンアップ
    await client.deleteCollection({ name: 'test_collection' });
    console.log('Test collection deleted');
    
  } catch (error) {
    console.error('❌ Failed to connect to ChromaDB:', error.message);
    console.error('Make sure ChromaDB server is running');
    console.error('Try: docker-compose up -d chroma');
    process.exit(1);
  }
}

testConnection();
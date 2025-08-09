#!/usr/bin/env node

import { ChromaClient } from 'chromadb';

async function test() {
  console.log('Testing ChromaDB with embeddings...\n');
  
  const hostname = process.env.HOSTNAME || '';
  const isInDocker = hostname.length === 12 && /^[a-f0-9]{12}$/.test(hostname);
  const chromaHost = isInDocker ? 'host.docker.internal' : 'localhost';
  
  const client = new ChromaClient({
    host: chromaHost,
    port: 8000,
    ssl: false
  });
  
  try {
    // embedderを明示的に指定せずにコレクションを作成
    const collection = await client.getOrCreateCollection({
      name: 'test_embeddings'
    });
    console.log('✅ Collection created without embedder');
    
    // ダミーのembeddingを作成（384次元）
    const dummyEmbedding = new Array(384).fill(0).map(() => Math.random());
    
    // embeddingを明示的に提供してドキュメントを追加
    await collection.add({
      ids: ['test1'],
      documents: ['This is a test document'],
      embeddings: [dummyEmbedding],
      metadatas: [{
        created_at: new Date().toISOString(),
        type: 'test',
        count: 1
      }]
    });
    console.log('✅ Document added with explicit embedding');
    
    // embeddingなしで追加を試みる（エラーになる可能性）
    try {
      await collection.add({
        ids: ['test2'],
        documents: ['This is another test document'],
        metadatas: [{
          created_at: new Date().toISOString(),
          type: 'test',
          count: 2
        }]
      });
      console.log('✅ Document added without embedding');
    } catch (error) {
      console.log('❌ Cannot add document without embedding:', error.message);
    }
    
    // クリーンアップ
    await client.deleteCollection({ name: 'test_embeddings' });
    console.log('✅ Collection deleted');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

test();
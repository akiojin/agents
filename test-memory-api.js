#!/usr/bin/env node

import { getMemoryAPI } from '@agents/memory';

async function testMemoryAPI() {
  console.log('Testing Memory API...\n');
  
  try {
    const memoryAPI = getMemoryAPI();
    
    console.log('1. Initializing Memory API...');
    await memoryAPI.initialize();
    console.log('✅ Memory API initialized\n');
    
    console.log('2. Testing Serena memory storage...');
    const memoryId = await memoryAPI.storeGeneral(
      {
        title: 'Test Memory',
        description: 'This is a test memory from the Memory API test',
        timestamp: new Date().toISOString()
      },
      ['test', 'api', 'memory']
    );
    console.log('✅ Memory stored with ID:', memoryId, '\n');
    
    console.log('3. Searching for memories...');
    const results = await memoryAPI.search('test memory');
    console.log('Found', results.length, 'memories');
    if (results.length > 0) {
      console.log('First result:', results[0]);
    }
    console.log();
    
    console.log('4. Getting statistics...');
    const stats = await memoryAPI.getStatistics();
    console.log('Statistics:', stats);
    
    console.log('\n✅ All tests passed successfully!');
    console.log('Note: ChromaDB vector storage may be limited if server is not running.');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testMemoryAPI();
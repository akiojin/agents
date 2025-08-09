#!/usr/bin/env node

/**
 * ChromaDB自動起動スクリプト
 * AGENTSをnpxで実行する際にChromaDBを自動的に起動する
 */

import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { ChromaClient } from 'chromadb';

const execAsync = promisify(exec);

async function isChromaRunning() {
  try {
    const client = new ChromaClient({
      path: 'http://localhost:8000'
    });
    await client.heartbeat();
    return true;
  } catch {
    return false;
  }
}

async function isDockerInstalled() {
  try {
    await execAsync('docker --version');
    return true;
  } catch {
    return false;
  }
}

async function startChromaWithDocker() {
  console.log('Starting ChromaDB with Docker...');
  
  // 既存のコンテナを停止
  try {
    await execAsync('docker stop chromadb-agents 2>/dev/null');
    await execAsync('docker rm chromadb-agents 2>/dev/null');
  } catch {
    // 無視
  }
  
  // ChromaDBコンテナを起動
  const dockerRun = spawn('docker', [
    'run',
    '-d',
    '--name', 'chromadb-agents',
    '-p', '8000:8000',
    '-v', 'chromadb-agents-data:/chroma/chroma',
    'chromadb/chroma:latest'
  ], { stdio: 'inherit' });
  
  return new Promise((resolve, reject) => {
    dockerRun.on('close', (code) => {
      if (code === 0) {
        console.log('ChromaDB Docker container started successfully');
        resolve();
      } else {
        reject(new Error(`Docker run failed with code ${code}`));
      }
    });
  });
}

async function installChromaPython() {
  console.log('Installing ChromaDB Python package...');
  
  try {
    await execAsync('pip install chromadb');
    console.log('ChromaDB Python package installed');
    return true;
  } catch (error) {
    console.error('Failed to install ChromaDB Python package:', error);
    return false;
  }
}

async function startChromaLocally() {
  console.log('Starting ChromaDB locally...');
  
  const chromaProcess = spawn('chroma', ['run', '--path', './chroma-data'], {
    stdio: 'inherit'
  });
  
  return new Promise((resolve) => {
    // ChromaDBが起動するまで少し待つ
    setTimeout(() => {
      console.log('ChromaDB local server started');
      resolve(chromaProcess);
    }, 3000);
  });
}

export async function ensureChromaDB() {
  console.log('Checking ChromaDB status...');
  
  // ChromaDBが既に動作中か確認
  if (await isChromaRunning()) {
    console.log('✅ ChromaDB is already running');
    return;
  }
  
  console.log('ChromaDB is not running. Attempting to start...');
  
  // Dockerが利用可能か確認
  if (await isDockerInstalled()) {
    try {
      await startChromaWithDocker();
      
      // 起動を待つ
      for (let i = 0; i < 30; i++) {
        if (await isChromaRunning()) {
          console.log('✅ ChromaDB is now running');
          return;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      throw new Error('ChromaDB failed to start within 30 seconds');
    } catch (error) {
      console.error('Failed to start ChromaDB with Docker:', error);
    }
  }
  
  // Dockerが利用できない場合はPython版を試す
  console.log('Docker not available. Trying Python ChromaDB...');
  
  if (await installChromaPython()) {
    try {
      const process = await startChromaLocally();
      
      // 起動を待つ
      for (let i = 0; i < 30; i++) {
        if (await isChromaRunning()) {
          console.log('✅ ChromaDB is now running');
          return process;
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      throw new Error('ChromaDB failed to start within 30 seconds');
    } catch (error) {
      console.error('Failed to start ChromaDB locally:', error);
    }
  }
  
  // ChromaDBが起動できなかった場合
  console.error(`
❌ ChromaDB could not be started automatically.

Please start ChromaDB manually using one of these methods:

1. Using Docker:
   docker run -d -p 8000:8000 chromadb/chroma:latest

2. Using Python:
   pip install chromadb
   chroma run --path ./chroma-data

3. Using Docker Compose:
   docker-compose up -d chroma

For more information: https://docs.trychroma.com/
`);
  
  throw new Error('ChromaDB is required but not available');
}

// 直接実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  ensureChromaDB().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
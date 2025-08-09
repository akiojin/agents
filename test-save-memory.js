#!/usr/bin/env node

import { SaveMemoryTool } from '@indenscale/open-gemini-cli-core';

async function test() {
  const tool = new SaveMemoryTool();
  const result = await tool.execute({
    type: "discovery",
    content: {
      title: "記憶システム統合完了",
      description: "Agentsプロジェクトの記憶システム統合が2025年8月9日に完了しました。ChromaDBは現在オフラインですが、Serena MCPによる記憶管理は正常に動作しています。"
    },
    tags: ["agents", "memory", "integration", "2025-08-09"]
  });

  console.log(result);
}

test();
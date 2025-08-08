#!/bin/bash

# Test local LLM connection
echo "Testing LLM endpoint: http://host.docker.internal:1234"
echo ""

# Test 1: Check if endpoint is reachable
echo "Test 1: Checking endpoint connectivity..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://host.docker.internal:1234/v1/models || echo "Connection failed"

echo ""
echo "Test 2: Getting models list..."
curl -s http://host.docker.internal:1234/v1/models | jq '.' || echo "Failed to get models"

echo ""
echo "Test 3: Testing chat completions..."
curl -s -X POST http://host.docker.internal:1234/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Hi"}],
    "temperature": 0.7,
    "max_tokens": 10
  }' | jq '.' || echo "Chat completion failed"
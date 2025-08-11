# Agents Package

The Agents package contains the core functionality of the Agents system. It provides the fundamental building blocks for creating and managing intelligent agents that can reason, plan, and execute tasks.

## Features

- **Agent Reasoning Engine**: Core logic for agent decision-making
- **Tool Integration**: Support for external tools and APIs
- **Multi-round Conversations**: Advanced conversation handling capabilities
- **Streaming Output**: Real-time response streaming for better UX
- **Memory Integration**: Seamless integration with memory systems

## Architecture

### Core Components

1. **Agent Core**: Main agent execution engine with reasoning capabilities
2. **Tool System**: Handles integration and execution of external tools
3. **Conversation Manager**: Manages multi-turn conversations with context preservation
4. **Memory Interface**: Connects to the memory system for persistent knowledge

### Agent Execution Flow

1. User input is processed through the conversation manager
2. Agent evaluates available tools and decides on appropriate actions
3. Tools are executed in sequence or in parallel as needed
4. Results are collected and used for next reasoning steps
5. Output is formatted and returned to the user

## Key Concepts

### Agent State Management
Agents maintain state across conversations through:
- Memory systems for long-term knowledge storage
- Conversation context tracking
- Tool execution history

### Tool Execution Patterns
Agents support various tool execution patterns:
- **Active Tool Calling**: Agent decides when to call tools
- **Passive Tool Calling**: Tools respond to specific prompts
- **Multi-round Active Tool Calling**: Complex workflows requiring multiple tool calls

### Streaming and Real-time Processing
- Supports real-time streaming of responses
- Allows for progressive output updates
- Handles partial results during long-running operations

## Usage Examples

### Basic Agent Creation
```typescript
import { Agent } from '@agents/agents';

const agent = new Agent({
  name: 'Task Manager',
  tools: [fileSystemTool, commandTool],
  memory: memorySystem
});

// Execute a task
const result = await agent.execute('Create a new directory called "test"');
```

### Multi-round Conversation
```typescript
const conversation = agent.startConversation();

// First exchange
const response1 = await conversation.send('Create a new file called "test.txt"');
// Second exchange (with context)
const response2 = await conversation.send('Add content to the file');
```

### Tool Integration
```typescript
// Define a custom tool
const customTool = {
  name: 'dataAnalyzer',
  description: 'Analyzes data and provides insights',
  parameters: {
    data: { type: 'string' }
  },
  execute: async (params) => {
    // Analysis logic here
    return { insights: 'Data analysis results' };
  }
};

const agent = new Agent({
  tools: [customTool]
});
```

## Implementation Details

### Memory Integration
Agents can integrate with various memory systems:
- ChromaDB for vector-based storage
- Synaptic networks for associative recall
- Serena integration for project-specific knowledge

### Conversation Context
The system maintains conversation context through:
- Message history tracking
- Memory-based context enhancement
- Tool result context preservation

### Tool Management
Tools are managed with:
- Automatic tool selection based on task requirements
- Concurrent tool execution capability
- Tool result aggregation and processing

## Configuration Options

### Agent Settings
```json
{
  "name": "Task Manager",
  "model": "gpt-4",
  "maxTokens": 2000,
  "temperature": 0.7,
  "tools": ["fileSystem", "command"],
  "memory": {
    "enabled": true,
    "type": "chroma"
  }
}
```

### Tool Configuration
Tools can be configured with:
- Specific parameters for each tool call
- Retry logic and error handling strategies
- Concurrency limits and execution order

## Integration with Other Packages

### Memory System Integration
Agents can seamlessly integrate with:
- ChromaDB for vector-based memory storage
- Synaptic networks for associative memory retrieval
- Project-specific knowledge through Serena integration

### Tool System Integration
Agents work with the tools package to:
- Execute external commands and APIs
- Handle complex workflows through tool composition
- Support real-time response streaming

### Adapter Integration
The agents system integrates with the adapter package to:
- Support multiple OpenAI-compatible providers
- Enable backend switching without code changes
- Maintain consistent agent behavior across different providers

## Performance Considerations

### Memory Efficiency
- Efficient memory usage through connection management
- Automatic cleanup of unused memories
- Context-aware memory prioritization

### Tool Execution Optimization
- Concurrent tool execution where possible
- Result caching to avoid redundant operations
- Efficient error handling and retry logic

### Conversation Management
- Efficient context tracking with minimal overhead
- Memory-efficient conversation history storage
- Smart tool call prioritization based on context

## Extensibility

### Custom Agent Types
Developers can create custom agent types by:
- Extending the base Agent class
- Implementing custom reasoning logic
- Adding specialized tool execution patterns

### Plugin System
The system supports plugin architecture for:
- Custom tools and providers
- Extended conversation handling
- Specialized memory management strategies

This flexible architecture allows for easy extension and customization to meet specific project requirements while maintaining core agent functionality.
# Memory System

The Memory system is an intelligent memory management component that combines SQLite with a synaptic network to provide human-like memory mechanisms. It enables agents to store, retrieve, and relate memories in a way that mimics human cognition.

## Components

1. **SQLite Client** - Handles vector database operations using SQLite for storing and searching memories.
2. **Synaptic Network** - Implements human-like synaptic connections between memories, enabling associative recall and learning through Hebbian learning.
3. **Integrated Memory System** - Combines the above components to provide a complete memory management solution.
4. **API Interface** - Provides integration with the Agents tool system for seamless memory operations.

## Architecture

### Memory Storage Flow
1. Memory is stored in SQLite with metadata
2. Synaptic connections are established between related memories
3. Memory strength and activation levels are maintained through learning algorithms

### Key Features
- **Hebbian Learning**: Memories that are activated together strengthen their connections (LTP/LTD)
- **Synaptic Decay**: Memory connections naturally decay over time based on usage patterns
- **Contextual Search**: Memory retrieval considers current context for better relevance
- **Pattern Recognition**: Identifies common action patterns to optimize future decisions

## Core Functions

### Memory Storage
- `store(content, tags)`: Store a memory with metadata and tags
- `storeErrorPattern(error, solution, context)`: Store error handling patterns
- `storeSuccessPattern(task, steps, result)`: Store successful task execution patterns

### Memory Retrieval
- `recall(query, context)`: Context-aware memory recall
- `findErrorSolution(error, context)`: Find solutions to similar errors
- `getImportantMemories(limit)`: Get highest importance memories

### Memory Management
- `activate(memoryId, propagate)`: Activate a memory and propagate to related memories
- `feedback(memoryId, success)`: Provide feedback on memory usage for learning
- `decay()`: Apply time-based decay to memory connections

### Integration Features
- `recordEvent(event)`: Automatically store relevant events as memories
- `search(query, includeProjectInfo)`: Search for memories with project context
- `getStatistics()`: Get detailed memory usage statistics

## Implementation Details

### SQLite Integration
- Uses SQLite as the primary vector database for memory storage
- Handles both in-memory and local file system modes
- Implements connection retry logic for robust operation

### Synaptic Network Architecture
- Implements Hebbian learning with LTP/LTD mechanisms
- Uses competitive learning for memory prioritization
- Includes homeostatic regulation to maintain network balance

### Memory Decay Algorithm
- Applies exponential decay based on the Ebbinghaus forgetting curve
- Considers usage frequency and success rate in strength calculations
- Maintains minimum connection strength to prevent complete forgetting

### Context-Aware Memory
- Uses context vectors for more relevant memory retrieval
- Implements temporal relationship recognition between memories
- Supports pattern recognition to learn from historical sequences

## Usage Examples

### Basic Memory Storage and Retrieval
```typescript
const memorySystem = new IntegratedMemorySystem();

// Store a memory
const memoryId = await memorySystem.store({
  type: 'error',
  error: 'File not found',
  solution: 'Check file path and permissions'
}, ['error', 'file']);

// Retrieve related memories
const memories = await memorySystem.recall('file not found');
```

### Error Pattern Recognition
```typescript
// Store an error solution
await memorySystem.storeErrorPattern(
  'Database connection failed',
  'Check database credentials and network access',
  { project: 'myapp', language: 'typescript' }
);

// Later, find solution for similar error
const solution = await memorySystem.findErrorSolution(
  'Database connection failed',
  { project: 'myapp' }
);
```

### Contextual Memory Search
```typescript
// Search with context awareness
const results = await memorySystem.recall(
  'how to handle authentication',
  ['user management', 'security']
);
```

### Memory Feedback Loop
```typescript
// Store a successful task pattern
const taskId = await memorySystem.storeSuccessPattern(
  'API integration',
  ['fetch data', 'process response', 'update database'],
  { status: 'completed', duration: '2 hours' }
);

// Later provide feedback
await memorySystem.feedback(taskId, true);
```

## Configuration Options

### Memory System Configuration
- `collectionName`: SQLite collection name (default: 'agent_memories')
- `sqlitePath`: SQLite database file path (default: ':memory:')
- `autoDecay`: Enable automatic memory decay (default: true)
- `decayInterval`: How often to apply decay (default: 1 hour)

### Synaptic Network Configuration
- `ltpThreshold`: Long-term potentiation threshold (default: 0.7)
- `ltdThreshold`: Long-term depression threshold (default: 0.2)
- `homeostaticTarget`: Target activation level for homeostasis (default: 0.5)
- `competitiveStrength`: Strength of competitive learning (default: 0.3)

## Performance Considerations

### Memory Management
- Memory decay reduces network size over time
- Garbage collection removes unused connections
- Memory strength is maintained through usage feedback

### Search Efficiency
- SQLite vector search for semantic similarity
- Synaptic network provides associative recall
- Context-aware filtering improves relevance

### Scalability
- Local file system mode for lightweight operation
- Server mode for distributed environments
- Memory compression and caching strategies

## Integration with Agents

The memory system integrates with the Agents tool system through:
1. API interface for tool integration
2. Event logging for automatic memory storage
3. Project context awareness through Serena integration
4. Decision logging for pattern recognition

This allows agents to learn from their experiences and improve over time, making more informed decisions based on previous successes and failures.
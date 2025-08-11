# Adapter Package

The Adapter package provides an abstraction layer that allows the Agents system to connect to various OpenAI-compatible API providers. This enables seamless switching between different backend services without requiring changes to the internal agent logic.

## Features

- **API Adaptor Layer**: Implements a unified interface for connecting to different OpenAI-compatible providers
- **Backend Transparency**: Allows switching between backends without affecting internal agent functionality
- **Format Conversion**: Converts between internal Agents format and OpenAI-compatible format

## Architecture

### Core Components

1. **Adapter Interface**: Defines the standard methods for interacting with different API providers
2. **Provider Implementations**: Concrete implementations for specific API services (e.g., OpenAI, Anthropic, etc.)
3. **Format Converters**: Handle conversion between internal and external formats

### Integration Flow

1. Agent requests processing through the standard Agents interface
2. Adapter layer translates request to OpenAI-compatible format
3. Provider handles the actual API call and response processing
4. Response is converted back to internal Agents format

## Configuration

### Environment Variables

- `OPENAI_LLM_KEY`: API key for the OpenAI-compatible provider
- `OPENAI_LLM_BASE`: Base URL of the API endpoint (e.g., https://api.openai.com/v1)
- `OPENAI_LLM_MODEL`: Default model to use for completions

### Model Configuration

Different task types can be configured to use specific models:

```json
{
  "taskTypes": {
    "planning": "gpt-4",
    "coding": "gpt-4-turbo",
    "analysis": "gpt-3.5-turbo"
  }
}
```

## Usage Examples

### Basic API Connection Setup
```typescript
// Configure adapter with environment variables
const adapter = new OpenAIAdapter({
  apiKey: process.env.OPENAI_LLM_KEY,
  baseURL: process.env.OPENAI_LLM_BASE,
  model: process.env.OPENAI_LLM_MODEL
});
```

### Model Selection by Task Type
```typescript
// Different models for different tasks
const taskConfig = {
  planning: "gpt-4",
  coding: "gpt-4-turbo",
  analysis: "gpt-3.5-turbo"
};

// The adapter automatically selects the appropriate model based on task type
```

### Format Conversion

```typescript
// Internal Agents format -> OpenAI format
const openaiRequest = adapter.toOpenAIFormat(internalRequest);

// OpenAI response -> Internal Agents format  
const agentsResponse = adapter.fromOpenAIFormat(openaiResponse);
```

## Implementation Details

### Provider Abstraction
The adapter implements a generic provider interface that can be extended to support:
- OpenAI-compatible APIs (OpenAI, Azure OpenAI, etc.)
- Other providers like Anthropic, Google Gemini, etc.

### Format Conversion

#### Input Conversion
- Converts internal message format to OpenAI-compatible messages
- Handles tool calling and function definitions
- Manages response format variations between providers

#### Output Conversion
- Translates provider responses back to internal Agents structure
- Handles streaming responses properly
- Maintains tool call information through conversion

## Integration with Agents System

The adapter integrates with the core Agents system to provide:
1. **Backend Flexibility**: Support for multiple API providers
2. **Seamless Switching**: Change backends without code changes
3. **Consistent Interface**: Unified API for all agent operations

This allows developers to choose their preferred backend provider while maintaining the same internal agent architecture.
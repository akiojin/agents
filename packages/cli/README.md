# CLI Package

The CLI package provides a command-line interface for interacting with the Agents system. It enables users to run agents, manage configurations, and perform various operations through terminal commands.

## Features

- **Agent Execution**: Run agents directly from the command line
- **Configuration Management**: Easy configuration of agents and providers
- **Tool Management**: Command-line interface for managing tools
- **Memory Operations**: Direct memory system interaction
- **Project Setup**: Quick project initialization and configuration

## Architecture

### Core Components

1. **Command Parser**: Handles command-line argument parsing and validation
2. **Agent Runner**: Executes agents with specified configurations
3. **Configuration Manager**: Manages and applies system configurations
4. **Memory Interface**: Direct access to memory system operations

### Command Flow

1. User inputs command through terminal
2. CLI parses and validates the command
3. Configuration is loaded and applied
4. Agent or operation is executed based on command
5. Results are formatted and displayed to user

## Available Commands

### Agent Management Commands
- `agents run`: Execute an agent with specified configuration
- `agents list`: List available agents and their status
- `agents config`: View or modify agent configuration

### Memory Commands
- `agents memory store`: Store a new memory entry
- `agents memory recall`: Recall memories based on query
- `agents memory search`: Search memories with filters
- `agents memory stats`: Display memory system statistics

### Tool Commands
- `agents tools list`: List available tools
- `agents tools install`: Install a new tool from registry
- `agents tools uninstall`: Remove an installed tool

### Configuration Commands
- `agents config set`: Set configuration values
- `agents config get`: Get current configuration values
- `agents config reset`: Reset configuration to defaults

## Usage Examples

### Running an Agent
```bash
# Run a basic agent with default configuration
agents run "Create a new project directory"

# Run an agent with specific configuration
agents run --config myagent.json "Create a new project directory"

# Run an agent with memory persistence
agents run --memory --name "Project Creator" "Create a new project directory"
```

### Memory Operations
```bash
# Store a memory entry
agents memory store --type "error" --tags "build,typescript" "Failed to build TypeScript project"

# Recall related memories
agents memory recall "build error"

# Search memories with filters
agents memory search --tag "error" --limit 5

# View memory statistics
agents memory stats
```

### Tool Management
```bash
# List available tools
agents tools list

# Install a new tool
agents tools install @agents/tools/file-system

# Uninstall an existing tool
agents tools uninstall @agents/tools/command
```

### Configuration Management
```bash
# View current configuration
agents config get

# Set a specific configuration value
agents config set OPENAI_LLM_KEY "your-api-key-here"

# Reset to default configuration
agents config reset
```

## Configuration

### Global Configuration
Configuration can be managed through:
- Environment variables (e.g., `OPENAI_LLM_KEY`)
- Configuration files (e.g., `.agents/config.json`)
- Command-line arguments

### Agent-Specific Configuration
Agents can be configured with:
```json
{
  "name": "Task Manager",
  "model": "gpt-4",
  "tools": ["fileSystem", "command"],
  "memory": {
    "enabled": true,
    "type": "chroma"
  }
}
```

## Implementation Details

### Command Parsing
The CLI uses a robust command parsing system that:
- Supports both positional and named arguments
- Validates input parameters against expected formats
- Provides helpful error messages for invalid commands

### Configuration Loading
Configuration is loaded in the following order of precedence:
1. Command-line arguments (highest priority)
2. Environment variables
3. Configuration files in `.agents/config.json`
4. Default values (lowest priority)

### Memory Integration
The CLI provides direct access to memory system features:
- Store and recall memories with context
- Search through stored memories
- View system statistics and performance metrics

### Tool Integration
The CLI handles tool management through:
- Package manager integration (npm/yarn)
- Automatic tool discovery and registration
- Version compatibility checking

## Integration with Agents System

### Agent Execution
The CLI provides a convenient interface for:
- Running agents in various modes (interactive, batch, etc.)
- Managing agent lifecycle (start, stop, restart)
- Monitoring agent performance and resource usage

### Configuration Management
The CLI offers:
- Easy configuration of global and agent-specific settings
- Validation of configuration values before application
- Backup and restore capabilities for configurations

### Memory Operations
Direct memory system interaction includes:
- Storing memories with metadata and tags
- Retrieving memories based on semantic search or filters
- Analyzing memory usage patterns and statistics

## Performance Considerations

### Startup Optimization
- Fast command parsing and initialization
- Lazy loading of configuration and tools
- Caching of frequently accessed data

### Resource Management
- Efficient handling of memory for large-scale operations
- Streaming responses to reduce terminal lag
- Memory-efficient processing of large data sets

### Command Efficiency
- Parallel execution where possible
- Asynchronous operation handling
- Optimized search and retrieval operations

## Extensibility

### Custom Command Plugins
Developers can create custom command plugins by:
- Implementing command interfaces
- Adding new command categories and operations
- Extending existing command functionality

### Configuration Extensions
The CLI supports:
- Custom configuration schema validation
- Extended configuration file formats (YAML, TOML)
- Integration with external configuration management systems

This flexible CLI design allows for easy extensibility and customization to meet specific operational requirements while maintaining a consistent and intuitive user experience.
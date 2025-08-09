# @akiojin/agents Architecture Overview (Based on Gemini CLI)

This document provides a high-level overview of the @akiojin/agents architecture, which extends the Google Gemini CLI with additional AI providers, MCP protocol support, and advanced memory management.

## Core components

The @akiojin/agents system builds upon the Gemini CLI foundation and is composed of the following main packages and extensions:

1.  **CLI package (`packages/cli`):**
    - **Purpose:** This contains the user-facing portion of the Gemini CLI, such as handling the initial user input, presenting the final output, and managing the overall user experience.
    - **Key functions contained in the package:**
      - [Input processing](./cli/commands.md)
      - History management
      - Display rendering
      - [Theme and UI customization](./cli/themes.md)
      - [CLI configuration settings](./cli/configuration.md)

2.  **Core package (`packages/core`):**
    - **Purpose:** This acts as the backend for the Gemini CLI. It receives requests sent from `packages/cli`, orchestrates interactions with the Gemini API, and manages the execution of available tools.
    - **Key functions contained in the package:**
      - API client for communicating with the Google Gemini API
      - Prompt construction and management
      - Tool registration and execution logic
      - State management for conversations or sessions
      - Server-side configuration

3.  **Tools (`packages/core/src/tools/`):**
    - **Purpose:** These are individual modules that extend the capabilities of the Gemini model, allowing it to interact with the local environment (e.g., file system, shell commands, web fetching).
    - **Interaction:** `packages/core` invokes these tools based on requests from the Gemini model.

## @akiojin/agents Extensions

Building on top of the Gemini CLI foundation, @akiojin/agents adds:

4.  **Agents Extensions (`src/`):**
    - **Purpose:** Additional functionality specific to the agents system
    - **Key components:**
      - `src/cli.ts`: Enhanced CLI entry point with agent-specific commands
      - `src/core/`: Agent core logic and ReAct pattern implementation
      - `src/providers/`: Multi-LLM provider support (OpenAI, Anthropic, Local)
      - `src/mcp/`: MCP (Model Context Protocol) integration for tool extensibility
      - `src/utils/`: Utility functions and configuration management

5.  **MCP Integration:**
    - **Serena MCP**: Advanced code exploration and editing capabilities
    - **Custom MCP servers**: Support for additional tool servers via MCP protocol
    - **Parallel tool execution**: Enhanced performance through concurrent operations

6.  **Multi-Provider LLM Support:**
    - **Google Gemini**: Original Gemini CLI integration (default)
    - **OpenAI**: GPT-4, GPT-3.5 support
    - **Anthropic**: Claude 3 family support
    - **Local LLMs**: Support for local models via LM Studio, Ollama, etc.

7.  **Advanced Memory System:**
    - **Serena Memory**: Persistent project context and knowledge
    - **ChromaDB Integration**: Vector database for semantic memory
    - **Synaptic Networks**: Brain-inspired memory management (planned)

## Interaction Flow

A typical interaction with @akiojin/agents follows this enhanced flow:

1.  **User input:** The user types a prompt or command into the terminal, which is managed by `packages/cli`.
2.  **Request to core:** `packages/cli` sends the user's input to `packages/core`.
3.  **Provider Selection:** The agent system selects the appropriate LLM provider based on configuration or task requirements.
4.  **Request processed:** The core package:
    - Constructs an appropriate prompt for the selected LLM API (Gemini, OpenAI, Anthropic, or Local)
    - Includes conversation history, available tool definitions, and MCP tool capabilities
    - Sends the prompt to the selected LLM API
5.  **LLM Response:** The LLM processes the prompt and returns a response. This response might be a direct answer or a request to use one of the available tools (including MCP tools).
6.  **Tool execution (if applicable):**
    - When the LLM requests a tool, the core package prepares to execute it
    - Tools can be from the original Gemini CLI toolkit or MCP servers
    - If the requested tool can modify the file system or execute shell commands, the user is first given details of the tool and its arguments, and the user must approve the execution
    - Read-only operations, such as reading files, might not require explicit user confirmation to proceed
    - MCP tools follow their own execution protocols and permissions
    - Once confirmed, or if confirmation is not required, the core package executes the relevant action
    - The result is sent back to the LLM by the core package
    - The LLM processes the tool result and generates a final response
7.  **Response to CLI:** The core package sends the final response back to the CLI package.
8.  **Display to user:** The CLI package formats and displays the response to the user in the terminal.

## Key Design Principles

### Inherited from Gemini CLI
- **Modularity:** Separating the CLI (frontend) from the Core (backend) allows for independent development and potential future extensions
- **Extensibility:** The tool system is designed to be extensible, allowing new capabilities to be added
- **User experience:** The CLI focuses on providing a rich and interactive terminal experience

### @akiojin/agents Additions
- **Multi-Provider Flexibility:** Support for multiple LLM providers allows users to choose based on cost, performance, or privacy needs
- **MCP Protocol Standard:** Adoption of the Model Context Protocol ensures compatibility with a growing ecosystem of tools
- **Memory Persistence:** Advanced memory systems maintain context across sessions for better continuity
- **Parallel Processing:** Concurrent tool execution and task handling for improved performance
- **Open Source First:** Complete transparency and community-driven development

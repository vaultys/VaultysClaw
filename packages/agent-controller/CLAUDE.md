# packages/agent-controller

Agent runtime: WebSocket client, LLM execution, tools, skills, memory. Connects to the control plane on port 8080.

## Key Files

- **`src/agent.ts`** — `AgentController` (EventEmitter): WebSocket client, auth challenge/response, task queue, scheduler, peer manager, memory store
- **`src/cli.ts`** — CLI entry point; modes: `headless` | `tui` (Ink terminal) | `web` (Vite SPA on port 3002)
- **`src/llm.ts`** — LLM invocation via Mastra (@mastra/core) + @ai-sdk/openai + ollama-ai-provider-v2; supports OpenAI, Anthropic, Google, Ollama
- **`src/tools/`** — Built-in tools: file ops, shell, code runner, HTTP requests, remote-agent calls
- **`src/skills/`** — Plugin-based skill loading; skills auto-discovered by `src/skills/loader.ts`
- **`src/memory/`** — Semantic memory: SQLite persistence, vector-based retrieval, LLM summarization

**Agent SQLite** (`agent.db`): delegation certs, peer grants, LLM config, token usage, chat sessions, task history.

## Adding a Tool

1. Create `src/tools/<name>.ts`, export a tool definition with a Zod schema
2. Register it in `src/tools/index.ts`

## Adding a Skill

Create a package under `skills/<name>/`, export Zod schemas + handlers. Skills are auto-discovered by `src/skills/loader.ts` and can be enabled per-workspace in the control plane UI.

## Environment

Reads from `.env` in this directory or environment variables:

| Variable | Purpose |
|---|---|
| `AGENT_NAME` | Agent display name |
| `CONTROL_PLANE_URL` | Control plane base URL |
| `LLM_MODEL` / `LLM_API_KEY` | LLM provider config |
| `VAULTYS_ID_PATH` | Path to agent VaultysId identity file |

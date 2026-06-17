# @vaultysclaw/agent-controller

The agent runtime CLI: a lightweight controller that connects to a VaultysClaw
control plane, maintains a cryptographic identity via [VaultysId](https://github.com/vaultys/id),
and executes LLM-driven intents using a set of tools and skills.

## Run modes

```bash
pnpm dev          # headless
pnpm dev:tui      # Ink terminal UI
pnpm dev:web      # web dashboard (Vite SPA, port 3002)
pnpm spawn        # spawn helper
```

From the repo root the equivalent aliases are `pnpm agent:dev`, `pnpm agent:tui`,
`pnpm agent:web`.

## Architecture

- **`src/agent.ts`** — `AgentController` (EventEmitter): WS client, auth
  challenge/response, task queue, scheduler, peer manager, memory store.
- **`src/cli.ts`** — entry point; selects `headless` | `tui` | `web` mode.
- **`src/llm.ts`** — LLM invocation via Mastra + AI SDK; supports OpenAI,
  Anthropic, Google, and Ollama.
- **`src/tools/`** — built-in tools: file ops, shell, code runner, HTTP, remote-agent calls.
- **`src/skills/`** — plugin-based skills (npm packages or local dirs), enabled per-realm.
- **`src/memory/`** — semantic memory: SQLite persistence, vector retrieval, LLM summarization.

Local state lives in `agent.db` (delegation certs, peer grants, LLM config, token
usage, chat sessions, task history).

## Configuration

Reads from `.env` in this package or the environment. Common keys:

| Variable                    | Purpose                                |
| --------------------------- | -------------------------------------- |
| `AGENT_NAME`                | Agent display name                     |
| `CONTROL_PLANE_URL`         | Control plane base URL                 |
| `LLM_MODEL` / `LLM_API_KEY` | LLM provider config                    |
| `VAULTYS_ID_PATH`           | Path to the agent's VaultysId identity |

See [`.env.example`](./.env.example).

## Building

```bash
pnpm build            # tsc -> dist/
pnpm build:binaries   # standalone CLI binaries (bash scripts/build-binaries.sh)
```

## Extending

- **Add a tool**: create `src/tools/<name>.ts` (Zod schema), register in `src/tools/index.ts`.
- **Add a skill**: create a package under `skills/<name>/`; auto-discovered by `src/skills/loader.ts`.

See the root [CLAUDE.md](../../CLAUDE.md) for details.

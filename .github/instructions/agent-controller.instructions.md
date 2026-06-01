---
description: "Use when working on the agent-controller package: tools, skills, agent runtime, WebSocket client, local SQLite DB, LLM integration, or CLI modes."
applyTo: "packages/agent-controller/**"
---

# Agent Controller Conventions

## Module Imports

**No `@/*` alias** — use relative paths for local imports:

```typescript
import { shellTool } from "./tools/shell";
import { getDb } from "../db";
```

Cross-package: `import { AgentCapability, WSMessage } from "@vaultysclaw/shared"` — never relative paths across package boundaries.

## Adding a Tool

Create `src/tools/<name>.ts`, export a single `AgentToolDefinition` constant:

```typescript
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { AgentToolDefinition } from "./types";

export const myTool: AgentToolDefinition = {
  name: "my-tool",
  capability: "internet_access", // see AgentCapability below
  requiresApproval: false, // true for system-modifying operations
  tool: createTool({
    id: "my-tool",
    description: "...",
    inputSchema: z.object({ url: z.string() }),
    execute: async ({ url }) => {
      /* ... */
    },
  }),
};
```

Then register in `src/tools/index.ts` by adding to the `builtIn` array inside `createToolRegistry()`.

**`requiresApproval: true`** for anything that writes files, runs shell commands, or executes code.

**`AgentCapability` values**: `file_access` | `internet_access` | `browser_control` | `api_call` | `mail_send` | `code_execution` | `system_command` | `agent_communication` | `knowledge_search`

## Adding a Skill

Skills are **runtime-loaded plugins** — they must ship as compiled `.js`/`.mjs`, not `.ts`.

Structure a local skill under `skills/<name>/index.ts`, compiled to `skills/<name>/index.js`:

```typescript
import type { SkillDefinition } from "../../src/skills/types";

export const skill: SkillDefinition = {
  name: "my-skill",
  description: "...",
  version: "1.0.0",
  tools: [
    /* AgentToolDefinition[] */
  ],
  systemPromptExtension: "Optional: guidance for the LLM about these tools.",
};
```

Accepted export forms: `export const skill = ...` or `export default { skill: ... }`.

The loader scans `SKILLS_DIR` for `.js`/`.mjs` files and `index.js`/`index.mjs` inside subdirectories. New skills require a restart (or trigger `SkillLoader.load()`) unless `SKILLS_WATCH=true`.

## Local SQLite DB

Access via `getDb()` from `src/db.ts` — same `better-sqlite3` pattern as control-plane, raw prepared statements:

```typescript
import { getDb } from "../db";

const db = getDb();
const sessions = db
  .prepare("SELECT * FROM chat_sessions WHERE source = ?")
  .all("tui");
```

Key tables: `tasks`, `schedules`, `delegations`, `llm_config`, `chat_sessions`, `peer_grants`.
Use exported query helpers (`getLlmConfig`, `recordTokenUsage`, etc.) before writing raw SQL.

## Sending WebSocket Messages

Use the private `this.send(message: WSMessage)` method on `AgentController`. It automatically routes through PeerJS (WebRTC) if connected, falling back to WebSocket. Never write directly to `this.ws`.

New message types must be added to `packages/shared/src/channel-types.ts` first.

## Environment / Config

All config is read from `src/config.ts` via environment variables. Key variables:

| Variable                     | Purpose                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `AGENT_NAME`                 | Agent display name                                         |
| `CONTROL_PLANE_URL`          | HTTP base URL (default `http://localhost:3000`)            |
| `CONTROL_PLANE_WS_URL`       | WebSocket URL (derived from above if unset)                |
| `LLM_PROVIDER` + `LLM_MODEL` | LLM provider and model (required for task execution)       |
| `LLM_API_KEY`                | Provider API key                                           |
| `VAULTYS_ID_PATH`            | Path to identity file (default `./.vaultys/agent.id`)      |
| `SKILLS_DIR`                 | Path to skills directory (default `~/.vaultysclaw/skills`) |
| `AGENT_CAPABILITIES`         | Comma-separated capability list                            |

## CLI Modes

`src/cli.ts` supports three modes via `--mode` flag:

- `headless` — no UI, logs to stdout
- `tui` — Ink terminal UI (`src/tui/`)
- `web` — Vite SPA on port 3002 (`src/web/`)

## Build

`pnpm build` compiles `src/` → `dist/` via `tsc`. Skills must also be compiled before they can be loaded. `pnpm build:binaries` produces standalone executables via `scripts/build-binaries.sh`.

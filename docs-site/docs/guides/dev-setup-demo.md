---
sidebar_position: 2
title: Demo & Simulator Setup
description: Quickly bootstrap a realistic dev environment using the built-in demo agents and 30-agent simulator.
---

# Demo & Simulator Setup

VaultysClaw ships two complementary tools for quickly getting a rich, realistic dev environment:

| Tool | What it gives you | When to use |
|------|-------------------|-------------|
| **`demo/setup.sh`** (3 real agents) | A lightweight control plane + 3 real agents driven by your LLM key | Demos, local exploration, recording videos |
| **`pnpm simulator:up`** (full stack) | PostgreSQL + MinIO + Docling + LiteLLM + Grafana + 30 simulated agents | Feature development, load testing, showcasing dashboards |

---

## Option A — Minimal demo (3 real agents)

This is the fastest way to see the platform end-to-end. It starts the control plane and three real agent-controller instances — one per demo scenario (research, code, report).

### Prerequisites

- Node.js 18+ and pnpm 9+
- An LLM API key (OpenAI, Anthropic, or a running Ollama instance)

### 1. Set your LLM key

Each agent has its own `.env` file under `demo/agents/`:

```
demo/agents/research-agent/.env
demo/agents/code-agent/.env
demo/agents/report-agent/.env
```

Open each one and set the same key (gpt-4o-mini is a good balance of speed and cost):

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=sk-...
```

:::tip Anthropic or Ollama?

```env
# Anthropic
LLM_PROVIDER=anthropic
LLM_MODEL=claude-haiku-4-5-20251001
LLM_API_KEY=sk-ant-...

# Ollama (no key required)
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
LLM_BASE_URL=http://localhost:11434
```

:::

### 2. Start everything

```bash
./demo/setup.sh
```

This launches:

- **Control plane** at http://localhost:3000 (data: `demo/data/`)
- **research-agent** (capability: `internet_access`)
- **code-agent** (capabilities: `code_execution`, `file_access`)
- **report-agent** (capability: `file_access`)

All three agents will appear in **Registrations** as pending.

### 3. Approve agents

Open http://localhost:3000 → **Registrations** → approve each agent with these capabilities:

| Agent | Capabilities |
|-------|-------------|
| research-agent | `internet_access` |
| code-agent | `code_execution`, `file_access` |
| report-agent | `file_access` |

### 4. Try it out

Go to **Chat**, select **research-agent**, and send:

> `Research microservices security best practices and summarize the top 5 risks.`

The agent will call `search_topic` (auto-approved), then pause for your approval before calling `fetch_and_summarize` — that's the Zero Trust tool-approval flow in action.

### Stop

`Ctrl+C` in the terminal running `setup.sh` stops everything cleanly.

---

## Option B — Full simulator stack (30 agents)

The simulator seeds a complete, realistic environment: 8 realms, 200+ users, 15 workflows, 30 agents spread across geographies and LLM providers, plus a full observability stack.

### Prerequisites

- Node.js 18+ and pnpm 9+
- **Docker** — the script starts PostgreSQL, MinIO, Docling, LiteLLM, and Grafana in containers
- ~8 GB disk space for Docker images (only on first run)

### 1. Run `simulator:up`

```bash
pnpm simulator:up
```

This single command:

1. Generates a `demo/.env.demo` file with random secrets (on first run)
2. Starts Docker containers for PostgreSQL, MinIO, Docling, LiteLLM, and the Grafana LGTM observability stack
3. Pushes the Prisma schema
4. Starts the control plane
5. Prompts you to **claim ownership** via the setup wizard (first-time only)
6. Seeds 8 realms, 200+ users, 30 agent identities, 15 workflows, skills, policies, and channels
7. Connects 30 simulated agents via WebSocket (real VaultysId cryptography)
8. Starts the scenario runner (fires demo workflows on a schedule)

Once it prints the summary banner, open:

| Service | URL |
|---------|-----|
| Control plane | http://localhost:3000 |
| Mission Control | http://localhost:3000/mission-control |
| Grafana (traces + metrics) | http://localhost:3001 |
| MinIO console | http://localhost:9001 |
| LiteLLM proxy | http://localhost:4000 |
| Prometheus | http://localhost:9090 |

### Available flags

```bash
pnpm simulator:up -- --skip-minio      # Filesystem storage instead of MinIO
pnpm simulator:up -- --skip-docling    # Skip Docling (document parsing)
pnpm simulator:up -- --skip-litellm    # Skip LiteLLM proxy
pnpm simulator:up -- --skip-obs        # Skip Grafana / Prometheus stack
pnpm simulator:up -- --skip-seed       # Re-use existing DB (skip re-seeding)
pnpm simulator:up -- --no-simulator    # Start services only, no agents
pnpm simulator:up -- --fresh           # Wipe DB and Docker volumes, start clean
```

### Add your LLM API keys (optional)

The simulator agents are simulated — they respond to intents without actually calling an LLM. To add real keys so the LiteLLM proxy routes to real providers, create `demo/simulator/demo-config.json`:

```json
{
  "llm": {
    "openai": {
      "apiKey": "sk-...",
      "baseUrl": "",
      "models": [
        { "id": "gpt-4o",      "name": "GPT-4o" },
        { "id": "gpt-4o-mini", "name": "GPT-4o Mini" }
      ]
    },
    "anthropic": {
      "apiKey": "sk-ant-...",
      "baseUrl": "",
      "models": [
        { "id": "claude-sonnet-4-5", "name": "Claude Sonnet 4.5" }
      ]
    }
  },
  "minio":   { "endpoint": "http://127.0.0.1:9000", "bucket": "vc-demo-files", "accessKey": "minioadmin", "secretKey": "minioadmin123", "region": "us-east-1" },
  "docling": { "url": "http://127.0.0.1:5001" },
  "peerjs":  { "enabled": false }
}
```

Then re-run the seed to register the models:

```bash
pnpm simulator:seed
```

### Run seed and simulator separately

```bash
# Seed only (idempotent — safe to re-run)
pnpm simulator:seed

# Start 30-agent fleet only (control plane must already be running)
pnpm simulator:start

# Seed then start (equivalent to the combined step in simulator:up)
pnpm simulator:full
```

### Stop

`Ctrl+C` in the terminal — all Node.js processes are killed and all Docker containers are stopped (volumes are preserved for the next run). Pass `--fresh` to wipe everything.

---

## Demo file structure

```
demo/
├── setup.sh                         ← Option A: start control plane + 3 real agents
├── NARRATION_SCRIPT.md              ← Word-for-word script for the 50-second video
├── data/                            ← Control plane data for demo (auto-created)
├── workspace/                       ← Agent output files (auto-created)
├── logs/                            ← Per-process log files (auto-created)
├── agents/
│   ├── research-agent/.env          ← Set LLM key here
│   ├── code-agent/.env
│   └── report-agent/.env
├── skills/
│   ├── web-research.skill.mjs       ← Loaded by research-agent
│   └── report-writer.skill.mjs      ← Loaded by report-agent
└── simulator/
    ├── demo-up.sh                   ← Option B: full Docker stack + 30 agents
    ├── seed-demo.ts                 ← Seeds DB (realms, users, workflows, agents)
    ├── index.ts                     ← Connects 30 simulated agents
    ├── config.ts                    ← 30 agent definitions across 8 realms
    ├── scenario-runner.ts           ← Fires demo workflows on a schedule
    ├── demo-config.json             ← (you create) LLM API keys + MinIO/Docling URLs
    └── identities/                  ← Per-agent VaultysId key files (auto-created)
```

---

## Secrets and re-runs

`simulator:up` generates `demo/.env.demo` on first run with random secrets (PostgreSQL password, `NEXTAUTH_SECRET`, LiteLLM master key). Every subsequent run re-uses that file so the database credentials stay stable.

To reset everything and start completely fresh:

```bash
pnpm simulator:up -- --fresh
```

This wipes all Docker volumes, removes `demo/.env.demo`, and regenerates all secrets and identities.

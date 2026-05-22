# VaultysClaw — Demo Setup

Everything you need to record the 50-second demo video.

---

## Quick start

### 1. Configure API keys

Edit each agent's `.env` file and replace the placeholder key:

```sh
# Pick one provider and set the key in all three files:
demo/agents/research-agent/.env
demo/agents/code-agent/.env
demo/agents/report-agent/.env
```

Supported: `openai` (gpt-4o-mini recommended), `anthropic` (claude-haiku-4-5-20251001), `ollama`.

### 2. Configure the control plane (optional)

By default, the control plane uses `demo/data/` as its data directory.
If you want to use a custom directory, create a `.env` file in `demo/data/`:

```sh
# demo/data/.env
NODE_ENV=development
PORT=3000
WS_PORT=8080
```

### 3. Start everything

```sh
./demo/setup.sh
```

This starts:
- The control plane at http://localhost:3000 (data: `demo/data/`)
- Three agents in `demo/agents/` (all pending approval)
  - research-agent (data: `demo/agents/research-agent/`)
  - code-agent (data: `demo/agents/code-agent/`)
  - report-agent (data: `demo/agents/report-agent/`)

### 4. Approve agents in the UI

Open http://localhost:3000 → **Registrations** panel. Approve each agent with these capabilities:

| Agent | Capabilities |
|-------|-------------|
| research-agent | `internet_access` |
| code-agent | `code_execution`, `file_access` |
| report-agent | `file_access` |

### 5. Record

Follow [NARRATION_SCRIPT.md](./NARRATION_SCRIPT.md) scene by scene.

---

## Demo scenario (what to demo in chat)

Send this intent to **research-agent** in the Chat panel:

> `Research microservices security best practices and summarize the top 5 risks.`

The agent will:
1. Call `search_topic` (auto-approved) → shows search results
2. Call `fetch_and_summarize` → **pauses for your approval** (the "wow" moment)
3. Return a signed, structured summary

Then send this to **report-agent**:

> `Write a security risks report based on: [paste summary]. Save it as microservices-security-2026.md`

The agent will:
1. Call `write_report` → **pauses for your approval**
2. Save the file to `demo/workspace/microservices-security-2026.md`
3. Confirm the file path

---

## File structure

```
demo/
├── README.md                        ← this file
├── NARRATION_SCRIPT.md              ← word-for-word VO script with timestamps
├── setup.sh                         ← starts control plane + 3 agents
├── data/                            ← control plane data (auto-created)
│   └── vaultysclaw.db
├── workspace/                       ← agent output files (auto-created)
├── logs/                            ← per-agent log files (auto-created)
├── agents/
│   ├── research-agent/
│   │   ├── .env                     ← agent config (internet_access)
│   │   ├── agent.db                 ← agent database (auto-created)
│   │   └── .vaultys/agent.id        ← agent identity (auto-created)
│   ├── code-agent/
│   │   ├── .env                     ← agent config (code_execution, file_access)
│   │   ├── agent.db                 ← agent database (auto-created)
│   │   └── .vaultys/agent.id        ← agent identity (auto-created)
│   └── report-agent/
│       ├── .env                     ← agent config (file_access)
│       ├── agent.db                 ← agent database (auto-created)
│       └── .vaultys/agent.id        ← agent identity (auto-created)
└── skills/
    ├── web-research.skill.mjs       ← loaded by research-agent
    └── report-writer.skill.mjs      ← loaded by report-agent
```

Each agent has its own data directory (e.g., `demo/agents/research-agent/`) containing:
- `.env` — Configuration (LLM keys, capabilities, etc.)
- `agent.db` — SQLite database for tasks, memories, etc.
- `.vaultys/agent.id` — Agent identity file (auto-created on first run)

---

## Stopping

`Ctrl+C` in the terminal running `setup.sh` stops all agents and the control plane cleanly.

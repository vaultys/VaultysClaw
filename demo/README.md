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

### 2. Configure the control plane

```sh
cp .env.example packages/control-plane/.env.local
# Defaults are fine for local demo (port 3300, WS 8880)
```

### 3. Start everything

```sh
./demo/setup.sh
```

This starts:
- The control plane at http://localhost:3300
- Three agents (all pending approval)

### 4. Approve agents in the UI

Open http://localhost:3300 → **Registrations** panel. Approve each agent with these capabilities:

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
├── workspace/                       ← agent output files (auto-created)
├── logs/                            ← per-agent log files (auto-created)
├── agents/
│   ├── research-agent/.env          ← internet_access agent config
│   ├── code-agent/.env              ← code_execution + file_access config
│   └── report-agent/.env            ← file_access agent config
└── skills/
    ├── web-research.skill.mjs       ← loaded by research-agent
    └── report-writer.skill.mjs      ← loaded by report-agent
```

---

## Stopping

`Ctrl+C` in the terminal running `setup.sh` stops all agents and the control plane cleanly.

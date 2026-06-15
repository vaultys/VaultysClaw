---
sidebar_position: 3
title: Deploying Agents
description: How to set up and connect agent controllers to your control plane.
---

# Deploying Agents

An **agent controller** is a Node.js process that connects to your control plane, receives signed intents, and executes them with the LLM of your choice. This guide covers deploying agents in various environments.

## Prerequisites

- A running control plane (see [Quick Start](/docs/guides/quickstart))
- Node.js 18+ on the agent machine
- Network access from the agent machine to the control plane's WebSocket port (default 8080)
- An API key for your chosen LLM provider (or a local Ollama instance)

## Basic deployment

### Install the agent

```bash
git clone https://github.com/vaultys/vaultysclaw.git
cd vaultysclaw
pnpm install --filter @vaultysclaw/agent-controller...
```

### Configure

```bash
cp packages/agent-controller/.env.example packages/agent-controller/.env.local
```

Edit `.env.local`:

```env
AGENT_NAME=my-first-agent
CONTROL_PLANE_WS_HOST=vaultysclaw.acme.internal
CONTROL_PLANE_WS_PORT=8080
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5
LLM_API_KEY=sk-ant-...
AGENT_CAPABILITIES=api_call,file_access
```

### Start

```bash
pnpm start -F @vaultysclaw/agent-controller
```

The agent will:

1. Generate (or load) its VaultysId
2. Connect to the control plane WebSocket
3. Send a registration request
4. Wait for admin approval

### Approve in the dashboard

In the control plane dashboard, go to **Agents → Pending Registrations** and approve the agent, selecting which capabilities to grant.

## Running as a system service (systemd)

For production Linux deployments, run the agent as a systemd service:

```ini
# /etc/systemd/system/vaultys-agent.service
[Unit]
Description=VaultysClaw Agent Controller
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=vaultys
WorkingDirectory=/opt/vaultysclaw
ExecStart=/usr/bin/node packages/agent-controller/dist/index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
EnvironmentFile=/etc/vaultys-agent/env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable vaultys-agent
sudo systemctl start vaultys-agent
```

Store secrets in `/etc/vaultys-agent/env` with mode `0600`.

## Running in Docker

```dockerfile
# Dockerfile.agent
FROM node:20-alpine

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/agent-controller ./packages/agent-controller
COPY packages/shared ./packages/shared

RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Build
RUN pnpm build -F @vaultysclaw/agent-controller

# Persist the VaultysId across restarts
VOLUME /app/.vaultys

CMD ["node", "packages/agent-controller/dist/index.js"]
```

```bash
docker build -f Dockerfile.agent -t vaultys-agent .

docker run -d \
  --name my-agent \
  --restart unless-stopped \
  -v /data/vaultys-agent/.vaultys:/app/.vaultys \
  -e AGENT_NAME=my-agent \
  -e CONTROL_PLANE_WS_HOST=vaultysclaw.acme.internal \
  -e CONTROL_PLANE_WS_PORT=8080 \
  -e LLM_PROVIDER=openai \
  -e LLM_MODEL=gpt-4o \
  -e LLM_API_KEY=sk-proj-... \
  -e AGENT_CAPABILITIES=api_call,file_access \
  vaultys-agent
```

:::warning Persist the VaultysId
Mount the `.vaultys` directory as a volume. If the container is recreated without this mount, the agent will generate a new identity and require re-approval.
:::

## Multiple agents

You can run multiple agent controllers pointing to the same control plane. Each has its own VaultysId, capabilities, and LLM configuration.

A typical setup might include:

| Agent       | LLM                | Capabilities                    | Realm       |
| ----------- | ------------------ | ------------------------------- | ----------- |
| `analyst`   | GPT-4o             | `internet_access`, `api_call`   | Research    |
| `coder`     | Claude Sonnet      | `code_execution`, `file_access` | Engineering |
| `mailer`    | GPT-4o-mini        | `mail_send`                     | Operations  |
| `local-llm` | Llama 3.2 (Ollama) | `file_access`                   | Engineering |

Each agent runs as a separate process, potentially on separate machines.

## Auto-reconnect

The agent controller automatically reconnects to the control plane WebSocket if the connection drops, using exponential back-off. No manual intervention is required.

## Health check

The agent's HTTP server (default port 3001) exposes:

```
GET /health
→ { status: "ok", agentDid: "did:vaultys:...", connected: true }

GET /status
→ { uptime: 3600, memoryMb: 128, llmProvider: "openai", connected: true }
```

Use these endpoints with your load balancer or container orchestrator health checks.

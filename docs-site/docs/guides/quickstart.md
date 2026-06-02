---
sidebar_position: 1
title: Quick Start
description: Get Vaultys Claw running in under five minutes.
---

# Quick Start

This guide walks you from zero to a running control plane with a connected agent in under five minutes.

## Prerequisites

- **Node.js** 18 or later
- **pnpm** 9 or later (`npm install -g pnpm`)
- Git

## 1. Clone the repository

```bash
git clone https://github.com/vaultys/vaultysclaw.git
cd vaultysclaw
```

## 2. Install dependencies

```bash
pnpm install
```

## 3. Configure environment variables

Copy the example environment files:

```bash
# Control plane
cp packages/control-plane/.env.example packages/control-plane/.env.local

# Agent controller
cp packages/agent-controller/.env.example packages/agent-controller/.env.local
```

Open `packages/control-plane/.env.local` and at minimum set:

```env
NEXTAUTH_SECRET=your-random-secret-here
```

Open `packages/agent-controller/.env.local` and set your LLM provider:

```env
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-...
AGENT_CAPABILITIES=api_call,file_access
```

:::tip Using Ollama (no API key required)?

```env
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
LLM_BASE_URL=http://localhost:11434
```

:::

## 4. Start the platform

Open two terminals:

**Terminal 1 — Control plane:**

```bash
pnpm dev -F @vaultysclaw/control-plane
```

You should see:

```
✓ Control plane ready on http://localhost:3000
✓ WebSocket hub ready on ws://localhost:8080
```

**Terminal 2 — Agent controller:**

```bash
pnpm dev -F @vaultysclaw/agent-controller
```

You should see:

```
✓ VaultysId loaded: did:vaultys:z6Mkf...
✓ Connected to control plane WebSocket
✓ Registration pending admin approval
```

## 5. Approve the agent

Open [http://localhost:3000](http://localhost:3000) in your browser.

1. Sign in (first user automatically gets global admin)
2. Navigate to **Agents** → **Pending Registrations**
3. Click **Approve** on your agent, selecting the capabilities to grant

The agent will immediately receive its signed policy and become active.

## 6. Send your first intent

```bash
curl -X POST http://localhost:3000/api/intents \
  -H "Content-Type: application/json" \
  -H "Cookie: <your-session-cookie>" \
  -d '{
    "action": "echo",
    "params": { "message": "Hello from Vaultys Claw!" }
  }'
```

Response:

```json
{
  "intentId": "int_01HZ...",
  "action": "echo",
  "sentTo": ["did:vaultys:z6Mkf..."],
  "count": 1
}
```

## 7. Chat with your agent

Open [http://localhost:3000/chat](http://localhost:3000/chat), select your agent, and start a conversation.

## Next steps

- [Configuration reference](/docs/guides/configuration) — all environment variables explained
- [Deploying to production](/docs/guides/deployment) — TLS, reverse proxy, and scaling
- [Creating workflows](/docs/guides/workflows) — automate multi-step agent tasks
- [API Reference](/docs/api/overview) — integrate with your own applications

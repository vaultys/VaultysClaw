---
sidebar_position: 2
title: Configuration
description: Complete reference for all environment variables in Vaultys Claw.
---

# Configuration Reference

Vaultys Claw is configured entirely through environment variables. Both the control plane and agent controller read from `.env.local` (development) or process environment variables (production / Docker).

## Control plane

Set in `packages/control-plane/.env.local`:

### Server

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `HOSTNAME` | `localhost` | Bind address |
| `NODE_ENV` | `development` | `development` or `production` |
| `WS_PORT` | `8080` | WebSocket hub port |

### Authentication

| Variable | Required | Description |
|---|---|---|
| `NEXTAUTH_URL` | Yes | Full public URL of the control plane, e.g. `https://vaultysclaw.acme.com` |
| `NEXTAUTH_SECRET` | Yes | Random secret for signing NextAuth sessions. Generate with `openssl rand -base64 32` |

### Database

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `sqlite:./data/vaultysclaw.db` | SQLite database file path |

### VaultysId

| Variable | Default | Description |
|---|---|---|
| `VAULTYS_ID_PATH` | `./.vaultys/control-plane.id` | Path to the control plane's identity file. Created automatically on first run. **Back this up.** |

### OAuth providers (optional)

Enable social login by configuring one or more OAuth providers:

```env
# GitHub
GITHUB_ID=your-github-oauth-app-id
GITHUB_SECRET=your-github-oauth-app-secret

# Google
GOOGLE_ID=your-google-client-id
GOOGLE_SECRET=your-google-client-secret
```

### Logging

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Pino log level: `trace`, `debug`, `info`, `warn`, `error` |

---

## Agent controller

Set in `packages/agent-controller/.env.local`:

### Identity

| Variable | Default | Description |
|---|---|---|
| `AGENT_NAME` | `agent-1` | Human-readable display name for this agent |
| `AGENT_VAULTYS_ID_PATH` | `./.vaultys/agent.id` | Path to the agent's identity file. Created automatically. **Back this up.** |

### Control plane connection

| Variable | Default | Description |
|---|---|---|
| `CONTROL_PLANE_URL` | `http://localhost:3000` | HTTP URL of the control plane |
| `CONTROL_PLANE_WS_HOST` | `localhost` | WebSocket hub hostname |
| `CONTROL_PLANE_WS_PORT` | `8080` | WebSocket hub port |

### HTTP server

| Variable | Default | Description |
|---|---|---|
| `AGENT_PORT` | `3001` | Agent's local HTTP server port (health checks) |

### LLM configuration

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | Yes | `openai`, `anthropic`, `google`, `ollama`, or `openai-compatible` |
| `LLM_MODEL` | Yes | Model name, e.g. `gpt-4o`, `claude-sonnet-4-5`, `gemini-2.0-flash`, `llama3.2` |
| `LLM_API_KEY` | Conditional | API key (not required for Ollama) |
| `LLM_BASE_URL` | Conditional | Base URL for `ollama` or `openai-compatible` providers |
| `LLM_SYSTEM_PROMPT` | No | Custom system prompt prepended to all conversations |
| `LLM_MAX_TOKENS` | `4096` | Maximum tokens per LLM response |
| `LLM_PRICE_INPUT` | No | Price per million input tokens (for cost tracking) |
| `LLM_PRICE_OUTPUT` | No | Price per million output tokens |

#### Provider examples

```env
# OpenAI
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-proj-...

# Anthropic Claude
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-5
LLM_API_KEY=sk-ant-...

# Google Gemini
LLM_PROVIDER=google
LLM_MODEL=gemini-2.0-flash
LLM_API_KEY=AI...

# Ollama (local, no key)
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2
LLM_BASE_URL=http://localhost:11434

# Groq (OpenAI-compatible)
LLM_PROVIDER=openai-compatible
LLM_MODEL=llama-3.3-70b-versatile
LLM_API_KEY=gsk_...
LLM_BASE_URL=https://api.groq.com/openai/v1

# LM Studio (local)
LLM_PROVIDER=openai-compatible
LLM_MODEL=local-model
LLM_BASE_URL=http://localhost:1234/v1
```

### Capabilities

| Variable | Default | Description |
|---|---|---|
| `AGENT_CAPABILITIES` | `""` | Comma-separated list of requested capabilities. Admin approval is still required. |

Example:
```env
AGENT_CAPABILITIES=file_access,api_call,internet_access
```

### File operations

| Variable | Default | Description |
|---|---|---|
| `AGENT_WORKSPACE_ROOT` | Current working directory | Root directory for `file_access` operations |

### Skills (custom tools)

| Variable | Default | Description |
|---|---|---|
| `SKILLS_DIR` | `~/.vaultysclaw/skills` | Directory containing custom skill definitions |
| `SKILLS_WATCH` | `false` | Hot-reload skills when files change |

### Tool approval

| Variable | Default | Description |
|---|---|---|
| `APPROVAL_TIMEOUT_MS` | `600000` | How long (ms) the agent waits for admin approval of a tool before timing out |

### Logging

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Pino log level |
| `NODE_ENV` | `development` | Affects log format (pretty in dev, JSON in prod) |

---

## Docker Compose

A reference `docker-compose.yml` is provided in the `docker/` directory:

```bash
cp docker/.env.docker.example docker/.env
# Edit docker/.env with your values
docker compose -f docker/docker-compose.yml up
```

Key variables in the Docker env file mirror the above, prefixed by service name for clarity.

---

## Security checklist

Before going to production, verify:

- [ ] `NEXTAUTH_SECRET` is a cryptographically random string (≥ 32 bytes)
- [ ] `VAULTYS_ID_PATH` and `AGENT_VAULTYS_ID_PATH` files are backed up securely
- [ ] LLM API keys are stored in a secrets manager, not in `.env` files committed to git
- [ ] `.vaultys/` directories are in `.gitignore`
- [ ] `NODE_ENV=production` is set on all services
- [ ] `NEXTAUTH_URL` matches the actual public URL (required for OAuth redirect)

# Quick Start Guide

Get VaultysClaw running in 5 minutes with the new WebSocket architecture.

## Prerequisites

- Node.js 18+ ([download](https://nodejs.org/))
- pnpm 9+ (install globally: `npm install -g pnpm@9`)

## Installation

```bash
# Clone the repo (you already have it)
cd VaultysClaw

# Install dependencies
pnpm install

# build 
pnpm build
```

## .env
Create a .env in working directory

For dev mode: 

```bash
mkdir .devdata
cp packages/control-plane/.env.example .devdata/.env.local
```



## Run Everything

### Option 1: Development Mode (Recommended)

Open 2 terminals:

**Terminal 1** - Control Plane (HTTP + WebSocket):
```bash
pnpm vaultysclaw:dev
# HTTP server: http://localhost:3000
# WebSocket server: ws://localhost:8080 (for agents)
```

**Terminal 2** - Agent Controller:
```bash
pnpm dev -F @vaultysclaw/agent-controller
# Starts at http://localhost:3001
# Connects to WebSocket at ws://localhost:8080
```

That's it! 🎉

### Option 2: All at Once

```bash
pnpm dev
# Starts all packages (but harder to see logs)
```

## What's Running

| Component               | URL                   | Purpose                                |
| ----------------------- | --------------------- | -------------------------------------- |
| Control Plane HTTP      | http://localhost:3000 | UI Dashboard and REST API              |
| Control Plane WebSocket | ws://localhost:8080   | Real-time agent communication          |
| Agent Controller HTTP   | http://localhost:3001 | Health checks and testing              |
| Agent Controller → WS   | ws://localhost:8080   | Persistent connection to control plane |

## Architecture Overview

```
┌──────────────────────────────────────┐
│   Control Plane                      │
│  ┌────────────────────────────────┐  │
│  │ Next.js HTTP (port 3000)       │  │
│  │ - Dashboard UI                 │  │
│  │ - REST API (/api/*)            │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ WebSocket Server (port 8080)   │  │
│  │ - Agent connections            │  │
│  │ - Real-time messaging          │  │
│  │ - Intent distribution          │  │
│  │ - Policy updates               │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
            ↕ (WebSocket)
┌──────────────────────────────────────┐
│   Agent Controller                   │
│  ┌────────────────────────────────┐  │
│  │ Express HTTP (port 3001)       │  │
│  │ - Health checks                │  │
│  │ - Test endpoints               │  │
│  └────────────────────────────────┘  │
│  ┌────────────────────────────────┐  │
│  │ WebSocket Client               │  │
│  │ - Persistent connection to CP  │  │
│  │ - Receives intents             │  │
│  │ - Sends results                │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

## First Steps

### 1. Visit Control Plane
Open [http://localhost:3000](http://localhost:3000)

You should see:
- Dashboard with agent stats
- "Connected Agents" section (will show agents as they connect via WebSocket)
- "Getting Started" guide

### 2. Verify Agent Connection

In terminal 2 (agent controller), you should see:
```
Connected to control plane
Sent registration to control plane
```

In the control plane dashboard, you should see the agent appear under "Connected Agents".

### 3. Send Intent to Agent

Use the API to send an intent:

```bash
curl -X POST http://localhost:3000/api/intents \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-...",
    "action": "echo",
    "params": {
      "message": "Hello from VaultysClaw!"
    }
  }'
```

The agent receives it via WebSocket, executes it, and sends the result back.

### 4. Broadcast Policy to All Agents

```bash
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "broadcast": true,
    "capabilities": ["file_access", "api_call"],
    "resourceLimits": {
      "maxMemoryMb": 512
    }
  }'
```

### 5. Test HTTP Endpoint on Agent

```bash
curl -X POST http://localhost:3001/execute \
  -H "Content-Type: application/json" \
  -d '{
    "action": "echo",
    "params": {
      "message": "Direct HTTP test"
    }
  }'
```

## Communication Flow

### Agent Registration

```
Agent                          Control Plane WS Server
     |                                 |
     |-- WebSocket Connect ----------->|
     |                         (connection established)
     |-- Register Message ------------>|
     |    { type: "register",          |
     |      name: "agent-1",           |
     |      capabilities: [...] }      |
     |                                 |
     |<-- Register Ack ----------------|
     |    { type: "register_ack",      |
     |      agentId: "..." }           |
     |                                 |
     |<persistent connection stays open>|
```

### Intent Execution

```
Control Plane                  Agent                Control Plane
(REST API)                   (WebSocket)           (Database)
     |                           |                       |
 /api/intents                    |                       |
  (POST)                         |                       |
     |                           |                       |
     |-- Intent Message -------->|                       |
     |  (via WebSocket)          |                       |
     |                     (execute)                     |
     |                           |                       |
     |<-- Result Message --------|                       |
     |  (via WebSocket)          |                       |
     |                           |                       |
     |--- Store Result --------------------------------->|
     |                           |                       |
```

## Common Commands

```bash
# See all available commands
pnpm --help

# Type checking
pnpm type-check

# Linting
pnpm lint

# Format code
pnpm format

# Build for production
pnpm build

# Clean everything
pnpm clean
```

## Environment Variables

Default values are set for development. For custom configuration, create `.env.local`:

```env
# Control Plane
CONTROL_PLANE_PORT=3000
CONTROL_PLANE_WS_HOST=localhost
CONTROL_PLANE_WS_PORT=8080

# Agent
AGENT_NAME=agent-1
AGENT_PORT=3001
CONTROL_PLANE_URL=http://localhost:3000
CONTROL_PLANE_WS_URL=ws://localhost:8080
LLM_TYPE=local
```

See `.env.example` for all available options.

## Troubleshooting

### Port Already in Use

```bash
# Find what's using port 3000
lsof -i :3000

# Find what's using port 8080
lsof -i :8080

# Kill by PID
kill -9 <PID>
```

### Agent Won't Connect

1. Check both servers are running (see terminal output)
2. Verify WebSocket port 8080 is accessible
3. Check agent logs for connection errors
4. Firewall might be blocking port 8080

### Dependencies Won't Install

```bash
# Clear cache and reinstall
pnpm store prune
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### WebSocket Connection Refused

```
# The control plane WebSocket server must be running
# Try: pnpm dev -F @vaultysclaw/control-plane
# Look for: "WebSocket server ready for agent connections"
```

## Next: Dive Deeper

- Read [DEVELOPMENT.md](./DEVELOPMENT.md) for code structure
- Read [SECURITY.md](./SECURITY.md) for WebSocket security
- Check [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed design (coming soon)
- Check [README.md](./README.md) for full feature roadmap

## Need Help?

- Check logs in terminal for error messages
- Read documentation files
- Check agent's health: `curl http://localhost:3001/health`
- Check control plane agents list: `curl http://localhost:3000/api/agents`

Happy building! 🚀

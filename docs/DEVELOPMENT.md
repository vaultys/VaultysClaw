# Development Guide

## Setup

### 1. Choose Your Monorepo Tools

We use:

- **pnpm**: Fast, space-efficient package manager
- **Turbo**: Build system with caching and parallelization
- **TypeScript**: Type-safe development

### 2. Install Dependencies

```bash
# Install pnpm globally if needed
npm install -g pnpm@9

# Install project dependencies
pnpm install
```

### 3. Setup Environment

```bash
# Copy example env
cp .env.example .env.local

# Update values as needed
```

### 4. Start Development

Terminal 1 - Control Plane (HTTP + WebSocket):

```bash
pnpm dev -F @vaultysclaw/control-plane
# HTTP: http://localhost:3000
# WebSocket: ws://localhost:8080
```

Terminal 2 - Agent Controller:

```bash
pnpm dev -F @vaultysclaw/agent-controller
# HTTP: http://localhost:3001
# Connects to: ws://localhost:8080
```

## Project Structure Deep Dive

### `/packages/shared`

Shared TypeScript types and utilities accessible to all packages.

```typescript
// Import in any package:
import {
  type WSMessage,
  type AgentPolicy,
  verifySignature,
} from "@vaultysclaw/shared";
```

**Key files:**

- `src/types.ts`: Core domain models + WebSocket message types
- `src/security.ts`: VaultysId integration stubs

**WebSocket Types (types.ts):**

- `WSMessage` - Wrapper for all WebSocket messages
- `WSMessageType` - Message type enum
- `WSRegisterPayload` - Agent registration
- `WSAckPayload` - Message acknowledgment

### `/packages/control-plane`

Next.js app + WebSocket server for agent orchestration.

**Structure:**

```
app/
  ├── layout.tsx                    # Root layout
  ├── page.tsx                      # Dashboard UI
  ├── globals.css                   # Styles
  └── api/
      ├── agents/route.ts           # Agent management
      ├── intents/route.ts          # Intent distribution REST API
      └── policies/route.ts         # Policy management REST API
lib/
  └── ws-server.ts                  # WebSocket server implementation
server.ts                           # Custom HTTP + WS server
components/                         # React components
```

**Key files:**

- `lib/ws-server.ts`: AgentWSServer implementation
  - Manages connected agents
  - Routes intents to agents
  - Handles policy distribution
  - Processes execution results

- `server.ts`: Custom Next.js server
  - Starts HTTP server on port 3000
  - Starts WebSocket server on port 8080
  - Handles graceful shutdown

**Running:**

```bash
pnpm dev -F @vaultysclaw/control-plane
# Starts both HTTP (3000) and WS (8080) servers
```

**Building:**

```bash
pnpm build -F @vaultysclaw/control-plane
```

### `/packages/agent-controller`

Node.js app with WebSocket client connection to control plane.

**Key files:**

- `src/index.ts`: Express + WebSocket client
  - HTTP endpoints for health/testing
  - WebSocket connection management
  - Intent execution handler
  - Message routing

- `src/config.ts`: Configuration loading
  - Agent name and settings
  - HTTP port
  - WebSocket connection URL

- `src/cli.ts`: CLI entry point

**Running:**

```bash
pnpm dev -F @vaultysclaw/agent-controller
# Starts HTTP on 3001
# Connects via WebSocket to 8080
```

**Building:**

```bash
pnpm build -F @vaultysclaw/agent-controller
```

## WebSocket Development

### Understanding the Connection Flow

1. **Agent starts** → Loads config → Tries to connect to WebSocket
2. **Connection established** → Send register message
3. **Control plane receives** → Creates agent record → Sends ack
4. **Agent confirmed** → Starts heartbeat → Waits for intents
5. **Persistent loop** → Receives intents/policies → Sends results

### Debugging WebSocket

**Check connection status:**

```bash
# Agent is connected when HTTP response includes "connected": true
curl http://localhost:3001/health

# Should show:
# "status": "ok",
# "connected": true,
# "lastHeartbeat": "..."
```

**List connected agents:**

```bash
curl http://localhost:3000/api/agents

# Should show agents retrieved from WebSocket server
```

**Monitor WebSocket traffic** (developer tools):

```bash
# In agent-controller index.ts, messages are logged
# Check pino logs for "Received message from control plane"
```

**Manual WebSocket testing:**

```bash
# Install wscat globally
npm install -g wscat

# Connect to control plane WebSocket
wscat -c ws://localhost:8080

# Send a registration message (not recommended, use agent controller)
```

### Adding a New Message Type

1. Add to `WSMessageType` in `packages/shared/src/types.ts`:

```typescript
export type WSMessageType =
  | "register"
  | "register_ack"
  | "intent"
  | "my_new_type"  // NEW
  | ...
```

2. Add payload type if needed:

```typescript
export interface MyNewPayload {
  // Your fields
}
```

3. Handle in control plane `lib/ws-server.ts`:

```typescript
private handleMessage(ws: WebSocket, data: WebSocket.Data) {
  switch (message.type) {
    case "my_new_type":
      this.handleMyNewType(message);
      break;
  }
}

private handleMyNewType(message: WSMessage): void {
  // Handle it
}
```

4. Handle in agent `src/index.ts`:

```typescript
function handleMessage(data: string): void {
  switch (message.type) {
    case "my_new_type":
      handleMyNewType(message);
      break;
  }
}

function handleMyNewType(message: WSMessage): void {
  // Handle it
}
```

### Testing Intents via API

```bash
# First, get the agent ID from the connected agents list
AGENT_ID=$(curl -s http://localhost:3000/api/agents | jq -r '.agents[0].id')

# Send an intent to the agent
curl -X POST http://localhost:3000/api/intents \
  -H "Content-Type: application/json" \
  -d "{
    \"agentId\": \"$AGENT_ID\",
    \"action\": \"echo\",
    \"params\": {
      \"message\": \"Hello from control plane\"
    }
  }"

# The agent receives it via WebSocket and responds
# Check agent controller logs for execution
```

### Broadcasting Intents

```bash
# Send to all agents with specific capability
curl -X POST http://localhost:3000/api/intents \
  -H "Content-Type: application/json" \
  -d '{
    "broadcastCapability": "api_call",
    "action": "fetch_url",
    "params": {
      "url": "https://api.example.com/data"
    }
  }'
```

## Common Development Tasks

### Add a New Dependency

```bash
# Add to control-plane
pnpm add react-query -F @vaultysclaw/control-plane

# Add to agent-controller
pnpm add ws -F @vaultysclaw/agent-controller

# Add to shared
pnpm add @vaultys/id -F @vaultysclaw/shared

# Add dev dependency
pnpm add -D @types/react -F @vaultysclaw/control-plane
```

### Type Checking

```bash
# Check all packages
pnpm type-check

# Check specific package
pnpm type-check -F @vaultysclaw/control-plane
```

### Linting

```bash
# Lint all packages
pnpm lint

# Lint specific package
pnpm lint -F @vaultysclaw/agent-controller
```

### Formatting

```bash
# Format all files
pnpm format
```

### Building for Production

```bash
# Build all packages
pnpm build

# Build specific package
pnpm build -F @vaultysclaw/control-plane
```

## Integration with VaultysId

Placeholders exist in `packages/shared/src/security.ts`:

1. `verifySignature()` - Verify signed messages

````

## Common Development Tasks

### Add a New Dependency

```bash
# Add to control-plane
pnpm add react-query -F @vaultysclaw/control-plane

# Add to agent-controller
pnpm add dotenv -F @vaultysclaw/agent-controller

# Add to shared
pnpm add @vaultys/id -F @vaultysclaw/shared

# Add dev dependency
pnpm add -D @types/react -F @vaultysclaw/control-plane
````

### Type Checking

```bash
# Check all packages
pnpm type-check

# Check specific package
pnpm type-check -F @vaultysclaw/control-plane
```

### Linting

```bash
# Lint all packages
pnpm lint

# Lint specific package
pnpm lint -F @vaultysclaw/agent-controller
```

### Formatting

```bash
# Format all files
pnpm format
```

### Building for Production

```bash
# Build all packages
pnpm build

# Build specific package
pnpm build -F @vaultysclaw/control-plane
```

## Integration with VaultysId

Placeholders exist in `packages/shared/src/security.ts`:

1. `verifySignature()` - Verify signed messages
2. `signMessage()` - Sign messages
3. `hasCapability()` - Check agent capabilities against policy
4. `verifyPolicy()` - Verify policy signatures

When VaultysId is released:

```bash
pnpm add @vaultys/id
```

Then update these functions to use the actual VaultysId APIs.

## Database

Currently using SQLite placeholders. To implement:

1. Install `better-sqlite3`:

```bash
pnpm add better-sqlite3 -F @vaultysclaw/control-plane
```

2. Create schema in `packages/control-plane/lib/db.ts`

3. Create migrations in `packages/control-plane/migrations/`

4. Update API routes to use real database queries

## API Development

### Adding a New Endpoint

1. Create route file: `app/api/[resource]/route.ts`
2. Implement GET, POST, PUT, DELETE handlers
3. Use shared types from `@vaultysclaw/shared`
4. Type the response with TypeScript

Example:

```typescript
// app/api/agents/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // TODO: Query database
    return NextResponse.json({ agent: { id: params.id } });
  } catch (error) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
```

## Frontend Development

### Adding a New Component

1. Create in `components/`:

```typescript
// components/AgentCard.tsx
import React from "react";

interface AgentCardProps {
  name: string;
  status: "online" | "offline";
}

export function AgentCard({ name, status }: AgentCardProps) {
  return (
    <div className="p-4 border rounded-lg">
      <h3 className="font-bold">{name}</h3>
      <p className="text-sm text-gray-500">{status}</p>
    </div>
  );
}
```

2. Use in pages/components:

```typescript
import { AgentCard } from "@/components/AgentCard";

export default function Page() {
  return <AgentCard name="Agent 1" status="online" />;
}
```

### Tailwind CSS

Classes available in all components. Some common patterns:

```typescript
// Spacing
<div className="p-4 mb-8">

// Colors (dark theme)
<div className="bg-gray-800 text-white border-gray-700">

// Layout
<div className="grid grid-cols-3 gap-4">

// Responsive
<div className="md:grid-cols-2 lg:grid-cols-3">

// Interactive
<button className="hover:bg-blue-700 transition">
```

See `tailwind.config.js` for theme customization.

## Testing

Currently no test setup. To add:

1. Install Jest/Vitest
2. Create `__tests__` directories
3. Add test scripts to package.json
4. Create CI workflow

## Debugging

### VS Code

Add `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Agent Controller",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev", "-F", "@vaultysclaw/agent-controller"],
      "console": "integratedTerminal"
    }
  ]
}
```

### Logging

Using Pino in agent-controller. Adjust log levels:

```typescript
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
});
```

## Common Issues

### Port Already in Use

```bash
# Kill process on port 3000
lsof -ti :3000 | xargs kill -9

# Kill process on port 3001
lsof -ti :3001 | xargs kill -9
```

### Dependency Issues

```bash
# Clean everything
pnpm clean

# Reinstall
pnpm install
```

### TypeScript Errors

```bash
# Rebuild
pnpm build

# Check all types
pnpm type-check
```

## Next Steps

1. Implement VaultysId integration
2. Add SQLite persistence
3. Create agent registration flow
4. Build policy editor UI
5. Implement intent execution pipeline

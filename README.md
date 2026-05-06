# VaultysClaw 🔐

**Decentralized AI Agent Orchestration Platform**

A secure, modular system for orchestrating AI agents across your organization. Built with Node.js/TypeScript and secured by VaultysId's decentralized identity framework.

## Vision

Ship early, iterate fast. Start simple, complexify orchestration:
- Simple features first → incremental complexity
- User-testable iterations
- Eventually orchestrate the whole AI agents of your company securely

**Secure by design**: Uses [VaultysId](https://github.com/vaultys) for decentralized, non-transferable identity. All agent controllers verify signed intents/results P2P according to policies distributed by the control plane.

## Architecture

### 🎮 Control Plane
- **React** + Tailwind CSS frontend
- **Next.js** API routes backend  
- **WebSocket Server** (port 8080) for agent communication
- **SQLite** database
- Manages policies, agent registration, orchestration rules
- Distributes signed policies and intents via WebSocket

### 🤖 Agent Controllers
- Lightweight Node.js services
- Connect to control plane via **persistent WebSocket**
- Receive intents and policies in real-time
- Run LLMs locally or via API keys
- Verify intents using control plane's public key
- Execute actions within policy boundaries
- Sign and return execution results via WebSocket

### 🔒 Security Layer
- VaultysId for non-transferable identity
- P2P signature verification over WebSocket
- Policy-based capability grants
- All communications signed and verified

## Project Structure

```
VaultysClaw/
├── packages/
│   ├── shared/              # Shared types & security utilities
│   ├── control-plane/       # React + Next.js control panel
│   └── agent-controller/    # Agent runtime
├── package.json            # Monorepo root (pnpm workspaces)
├── turbo.json             # Turbo build orchestration
└── README.md              # This file
```

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm 9.0+

### Installation

```bash
# Install dependencies
pnpm install

# Install VaultysId (when available)
pnpm add @vaultys/id
```

### Development

```bash
# Start everything in dev mode
pnpm dev

# Or start individual packages
pnpm dev -F @vaultysclaw/control-plane
pnpm dev -F @vaultysclaw/agent-controller
```

### First Run

1. **Control Plane** starts at `http://localhost:3000`
   - Visit the dashboard
   - See "Getting Started" section with instructions

2. **Agent Controller** starts at `http://localhost:3001`
   - Automatically registers with control plane
   - Waits for intents

3. **Try it out**
   - Register agents in the UI
   - Set up policies (what each agent can do)
   - Send test intents to agents

## Feature Roadmap

### Phase 1: Foundation ✈️
- [x] Monorepo structure
- [x] Basic agent registration
- [x] Policy distribution (skeleton)
- [ ] VaultysId integration for signing/verification
- [ ] SQLite persistence
- [ ] Simple UI for agents & policies

### Phase 2: Security & Verification 🔒
- [ ] P2P signature verification in agent controllers
- [ ] Policy enforcement on actions
- [ ] Audit logging
- [ ] Intent/result history

### Phase 3: Orchestration 🎯
- [ ] Intent queuing & scheduling
- [ ] Multi-agent workflows
- [ ] Conditional execution
- [ ] Error handling & retries

### Phase 4: Scaling 📈
- [ ] Clustering support
- [ ] Performance monitoring
- [ ] Advanced capability models
- [ ] Integration marketplace

## Usage Examples

### Register an Agent

```bash
curl -X POST http://localhost:3000/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-agent",
    "endpoint": "http://localhost:3001",
    "capabilities": ["file_access", "api_call"]
  }'
```

### Update Agent Policy

```bash
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "agentControllerId": "agent-1",
    "capabilities": ["file_access", "api_call"],
    "resourceLimits": {
      "maxMemoryMb": 512
    }
  }'
```

### Send an Intent to Agent

```bash
curl -X POST http://localhost:3001/intent \
  -H "Content-Type: application/json" \
  -d '{
    "id": "intent-123",
    "action": "read_file",
    "params": {
      "path": "/data/file.txt"
    },
    "signature": "...",
    "publicKey": "..."
  }'
```

## Development

### Build
```bash
pnpm build
```

### Type Check
```bash
pnpm type-check
```

### Lint
```bash
pnpm lint
```

### Format
```bash
pnpm format
```

## Environment Variables

### Control Plane
```env
PORT=3000
DATABASE_URL=sqlite:./data.db
VAULTYS_ID_PATH=./.vaultys/control-plane.id
```

### Agent Controller
```env
AGENT_NAME=agent-1
AGENT_PORT=3001
CONTROL_PLANE_URL=http://localhost:3000
LLM_TYPE=local|openai|anthropic
LLM_MODEL=gpt-3.5-turbo
LLM_API_KEY=...
LLM_BASE_URL=...
VAULTYS_ID_PATH=./.vaultys/agent.id
```

## Security Considerations

1. **Identity**: Each agent controller has a unique, non-transferable VaultysId
2. **Policies**: Signed by control plane, verified by agents
3. **Intents**: Signed by control plane, verified by agents
4. **Results**: Signed by agents, verified by control plane
5. **Capabilities**: Fine-grained, policy-based access control

## Architecture Decisions

- **pnpm workspaces**: Fast, efficient monorepo management
- **Turbo**: Build caching and parallelization
- **Next.js**: Full-stack React framework with API routes
- **SQLite**: Simple, embedded, serverless-friendly
- **VaultysId**: Decentralized identity without central authority
- **Express**: Lightweight agent runtime

## Contributing

Early stage project - contributions welcome! Areas to help:
- VaultysId integration
- SQLite schema & migrations
- Security hardening
- UI improvements
- Agent capabilities

## License

See [LICENSE](./LICENSE)

## Resources

- [VaultysId Documentation](https://github.com/vaultys/id)
- [Next.js Docs](https://nextjs.org/docs)
- [Turbo Documentation](https://turbo.build/repo/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**Status**: Alpha 🚀 - Shipping early, iterating fast.

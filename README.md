# VaultysClaw

<p align="center">
  <strong>Decentralized AI Agent Orchestration Platform</strong>
</p>

<p align="center">
  <a href="https://github.com/vaultys/VaultysClaw/actions"><img src="https://img.shields.io/github/actions/workflow/status/vaultys/VaultysClaw/ci.yml?branch=main&style=for-the-badge" alt="CI"></a>
  <a href="https://github.com/vaultys/VaultysClaw/releases"><img src="https://img.shields.io/github/v/release/vaultys/VaultysClaw?include_prereleases&style=for-the-badge" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/status-alpha-orange?style=for-the-badge" alt="Alpha">
</p>

**VaultysClaw** is a secure, self-hosted platform for orchestrating AI agents across your organization. A single control plane distributes signed policies and intents to lightweight agent controllers via WebSocket — all identities backed by [VaultysId](https://github.com/vaultys/id), a decentralized, non-transferable identity framework.

[Getting Started](#quick-start) · [Architecture](#architecture) · [Roadmap](#roadmap) · [Security](#security) · [Contributing](#contributing)

---

## Highlights

- **Decentralized identity** — every agent controller holds a unique, non-transferable [VaultysId](https://github.com/vaultys/id); no central credential store.
- **Policy-based capability grants** — the control plane signs and distributes policies; agents verify and enforce them locally.
- **End-to-end signing** — intents signed by the control plane, results signed by agents; all verified P2P over WebSocket.
- **Multi-LLM support** — connect agents to local models, OpenAI, Anthropic, or any OpenAI-compatible endpoint.
- **Monorepo, zero friction** — pnpm workspaces + Turborepo; one command starts the whole stack.

---

## Quick Start

**Runtime: Node.js 18+ · pnpm 10+**

```bash
# Install dependencies
pnpm install

# Start the full stack (control plane + agent controller)
pnpm dev
```

| Service | URL |
|---|---|
| Control Plane | http://localhost:3000 |
| Agent Controller | http://localhost:3001 |
| WebSocket | ws://localhost:8080 |

On first run, visit the control plane dashboard to register your first agent and define its policy.

---

## Architecture

```
VaultysClaw/
├── packages/
│   ├── shared/              # Shared types & security utilities
│   ├── control-plane/       # Next.js dashboard + WebSocket server
│   └── agent-controller/    # Agent runtime (Node.js)
├── turbo.json               # Build orchestration
└── package.json             # pnpm workspaces root
```

### Control Plane
- **React** + Tailwind CSS dashboard
- **Next.js** API routes
- **WebSocket server** (port 8080) — distributes signed policies and intents
- **SQLite** — agent registry, policy store, intent/result history

### Agent Controller
- Lightweight Node.js service
- Connects to the control plane via a persistent WebSocket
- Verifies intents against the control plane's public key before execution
- Executes actions within policy boundaries and signs results
- Supports local LLMs, OpenAI, Anthropic, or any OpenAI-compatible endpoint

### Security Layer
- VaultysId for non-transferable, decentralized agent identity
- All intents and results signed and verified P2P
- Policy-based capability grants — no action runs without a valid signed policy
- Audit log of every intent and result

---

## Configuration

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
LLM_MODEL=gpt-4o
LLM_API_KEY=sk-...
LLM_BASE_URL=https://api.openai.com/v1   # optional override
VAULTYS_ID_PATH=./.vaultys/agent.id
```

---

## API Examples

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

### Update an Agent Policy

```bash
curl -X POST http://localhost:3000/api/policies \
  -H "Content-Type: application/json" \
  -d '{
    "agentControllerId": "agent-1",
    "capabilities": ["file_access", "api_call"],
    "resourceLimits": { "maxMemoryMb": 512 }
  }'
```

### Send an Intent

```bash
curl -X POST http://localhost:3001/intent \
  -H "Content-Type: application/json" \
  -d '{
    "id": "intent-123",
    "action": "read_file",
    "params": { "path": "/data/report.txt" },
    "signature": "<control-plane-signature>",
    "publicKey": "<control-plane-public-key>"
  }'
```

---

## Development

```bash
pnpm dev            # Start everything in watch mode
pnpm build          # Production build (all packages)
pnpm test           # Run test suite
pnpm type-check     # TypeScript checks
pnpm lint           # ESLint
pnpm format         # Prettier
```

To target a single package:
```bash
pnpm dev -F @vaultysclaw/control-plane
pnpm dev -F @vaultysclaw/agent-controller
```

---

## Security

1. **Identity**: Each agent controller holds a unique, non-transferable VaultysId — identity cannot be copied or delegated.
2. **Policies**: Signed by the control plane; agents reject any unsigned or tampered policy.
3. **Intents**: Signed by the control plane; agents verify the signature before execution.
4. **Results**: Signed by the agent; the control plane verifies before accepting.
5. **Capabilities**: Fine-grained, per-agent grants — no implicit permissions.

---

## Roadmap

### Phase 1 — Foundation
- [x] Monorepo structure (pnpm + Turborepo)
- [x] Agent registration
- [x] VaultysId integration
- [x] Policy distribution skeleton
- [ ] SQLite persistence
- [ ] Control plane UI

### Phase 2 — Security & Verification
- [ ] P2P signature verification in agent controllers
- [ ] Policy enforcement on all actions
- [ ] Audit logging
- [ ] Intent/result history

### Phase 3 — Orchestration
- [ ] Intent queuing & scheduling
- [ ] Multi-agent workflows
- [ ] Conditional execution
- [ ] Error handling & retries

### Phase 4 — Scale
- [ ] Clustering support
- [ ] Performance monitoring
- [ ] Advanced capability models
- [ ] Integration marketplace

---

## Contributing

Early-stage project — contributions welcome. Priority areas:

- SQLite schema & migrations
- Security hardening & audit
- Control plane UI
- Agent capabilities & integrations
- Documentation

Please open an issue before starting significant work.

---

## License

[MIT](./LICENSE) © François-Xavier Thoorens

## Resources

- [VaultysId](https://github.com/vaultys/id) — decentralized identity framework
- [Next.js](https://nextjs.org/docs)
- [Turborepo](https://turbo.build/repo/docs)

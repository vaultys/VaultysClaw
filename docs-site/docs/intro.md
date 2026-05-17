---
sidebar_position: 1
title: Introduction
description: What is Vaultys Claw, and why should your organisation care?
---

# Vaultys Claw

**Vaultys Claw** is an open-source, enterprise-grade platform for deploying, orchestrating, and governing AI agents across your organisation. It provides a central control plane that coordinates any number of distributed agent controllers — each capable of using different LLM providers — while enforcing security policies through cryptographically-verified decentralised identity.

## Why Vaultys Claw?

Running AI agents at enterprise scale introduces problems that most frameworks ignore:

| Problem | How Vaultys Claw solves it |
|---|---|
| **Who authorised this action?** | Every intent is signed by the issuer's VaultysId key — tamper-evident, non-repudiable |
| **Can I trust this agent?** | Agents carry non-transferable DID identities; impersonation is cryptographically impossible |
| **How do I revoke access?** | Capability grants and policies are revoked instantly from the control plane and pushed to agents |
| **LLM vendor lock-in** | Per-agent LLM configuration: OpenAI, Anthropic, Gemini, Ollama, or any OpenAI-compatible endpoint |
| **Multi-team isolation** | Realms provide hard boundaries between teams; role-based access from member to global admin |
| **Audit trail** | Every intent, result, and approval is logged and cryptographically attributable |

## Core components

```
Control Plane (Next.js + WebSocket hub)
    ├── REST API  — manage agents, users, policies, workflows
    ├── Dashboard — live visibility across the fleet
    └── WS Hub   — bidirectional real-time channel to agents

Agent Controller (Node.js)
    ├── Identity   — VaultysId (non-transferable DID)
    ├── LLM engine — multi-provider, per-agent config
    ├── Executor   — policy-checked action execution
    └── Signer     — signs results before returning them
```

## Key concepts

- **VaultysId** — The decentralised identity system at the heart of Vaultys Claw. Every participant (user, control plane, agent) has a cryptographic key pair. All messages are signed and verified using these keys. See [VaultysId Security](/docs/security/vaultys-id).

- **Agent** — A process running the agent controller package. It connects outbound to the control plane WebSocket hub, receives signed intents, and executes them within its granted capabilities.

- **Intent** — A signed, structured request to execute an action on one or more agents. Intents are the primary unit of work.

- **Policy** — A signed document pushed from the control plane to an agent that defines which capabilities the agent is allowed to use, resource limits, and optional time windows.

- **Realm** — An organisational scope (team, department, project) that groups agents, users, and workflows with isolated access control.

- **Capability** — A specific permission granted to an agent, such as `file_access`, `internet_access`, or `code_execution`.

## Next steps

- [Architecture](/docs/overview/architecture) — how the control plane and agents communicate
- [VaultysId](/docs/security/vaultys-id) — the decentralised identity backbone
- [Quick Start](/docs/guides/quickstart) — run the platform in under 5 minutes
- [API Reference](/docs/api/overview) — integrate with your own applications

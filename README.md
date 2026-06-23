<div align="center">

# 🦞 VaultysClaw

### Zero-trust orchestration for millions of AI agents

**Give every AI agent a cryptographic identity, deny-by-default permissions, and a non-repudiable audit trail — so one compromised agent is a contained incident, not a breach.**

[![CI](https://img.shields.io/github/actions/workflow/status/vaultys/VaultysClaw/ci.yml?branch=main&style=for-the-badge)](https://github.com/vaultys/VaultysClaw/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)
[![Zero Trust](https://img.shields.io/badge/Zero%20Trust-Compliant-blue?style=for-the-badge)](ZERO_TRUST_COMPLIANCE.md)

[**Quickstart**](#-quickstart-60-seconds) · [**Demo**](#-demo) · [**Architecture**](#architecture-at-a-glance) · [**Compliance**](ZERO_TRUST_COMPLIANCE.md) · [**Contributing**](CONTRIBUTING.md)

</div>

---

## 🎬 Demo

> One command boots the whole stack — control plane, agents, and real-time audit.

<!-- Upload the demo as a GitHub asset (drag video/vaultysclaw.webm into an issue/PR
     comment, then paste the resulting user-images URL here) so it renders inline.
     A short looping GIF/asciinema above the fold converts best. -->

[vaultysclaw.webm](https://github.com/user-attachments/assets/c6147c1b-1e68-4e0b-a94b-00f1f922ed84)

---

## ⚡ Quickstart (60 seconds)

```bash
git clone https://github.com/vaultys/VaultysClaw.git
cd VaultysClaw
./quick-start.sh          # checks docker/node/npm/openssl, generates .env, builds & starts the stack
```

Then open **http://localhost:3000/quick-start** — a guided page that logs you in (developer mode, no VaultysID app needed), so you can create an agent, assign capabilities, and watch every action get audited.

> ⚠️ Quick-start login (`VC_DEV_LOGIN=true`) is for local testing only — never use it in production.

<details>
<summary><b>Manual setup (pnpm)</b></summary>

Requirements: Node.js 18+, pnpm 10+

```bash
git clone https://github.com/vaultys/VaultysClaw.git
cd VaultysClaw
pnpm install
pnpm dev
```

This boots everything:
- ✓ Control plane UI → http://localhost:3000
- ✓ Agent web dashboard → http://localhost:3002
- ✓ WebSocket server → ws://localhost:8080
- ✓ Passwordless QR-code login (scan to create your first identity)

</details>

---

## The problem

Enterprises are deploying AI agents but have no idea what they're actually doing:

- ❌ Agents run with overly broad permissions → one compromised agent = full breach
- ❌ No audit trail of what agents accessed or why → compliance nightmare
- ❌ No way to revoke access → leaked credentials stay leaked
- ❌ Shared credentials across agents → can't tell who did what
- ❌ No approval workflows → agents make high-risk decisions in the dark

Traditional identity (usernames, passwords, shared API keys) was never designed for autonomous AI.

## The solution: zero trust for AI

Three principles, built in from day one:

- ✅ **Never trust, always verify** — cryptographic identity per agent (VaultysId); all intents signed and verified
- ✅ **Assume breach** — deny-by-default permissions; policies define what agents *can't* do
- ✅ **Verify every access** — fine-grained capabilities ("read DB 9am–5pm weekdays only") and approval workflows for high-risk actions

**Result:** non-repudiation. You know who did what, can prove it cryptographically, and can respond in milliseconds.

---

## How VaultysClaw compares

| Capability                          | VaultysClaw | API keys | OAuth | Traditional RBAC |
| ----------------------------------- | :---------: | :------: | :---: | :--------------: |
| Non-transferable identity           |      ✅      |    ❌     |   ⚠️   |        ❌         |
| Deny-by-default permissions         |      ✅      |    ❌     |   ❌   |        ⚠️         |
| Cryptographic proof of who-did-what |      ✅      |    ❌     |   ✅   |        ❌         |
| Policy-driven (not code-driven)     |      ✅      |    ❌     |   ❌   |        ⚠️         |
| Sub-agent isolation                 |      ✅      |    ❌     |   ❌   |        ⚠️         |
| Real-time approval workflows        |      ✅      |    ❌     |   ❌   |        ❌         |
| Open-source, self-hosted            |      ✅      |    ⚠️     |   ⚠️   |        ✅         |

---

## Key features

**🔐 Zero-trust foundation**
- **VaultysId** — each agent & user gets a unique, cryptographically-rooted identity (a passport, not a password)
- **Signed intents** — all agent work is cryptographically signed; no one can deny what they did
- **Policy engine** — express rules without code: `allow read_database if time >= 9am AND time <= 5pm AND day != weekend`
- **Capabilities, not credentials** — agents are granted capabilities, never raw API keys

**🎛️ Governance out of the box**
- **Realms** — multi-tenant namespaces for teams, departments, or customers
- **Token budgets** — daily/monthly spend limits per agent and realm, tracked in real time
- **Approval workflows** — visual editor routes high-risk intents to humans first
- **Governance dashboard** — live posture: agent coverage, policy violations, budget spend, risk score
- **Audit trail** — every operation (who, what, when, why) with cryptographic proof

**🚀 Agent orchestration**
- **Workflow engine** — drag-and-drop visual editor (React Flow) with sequential/parallel execution, loops, and human approval steps
- **30+ skills & tools** — file ops, shell, HTTP, code runner, remote agents, knowledge search, Slack, email
- **Semantic memory** — persistent agent memory with auto-summarization and retrieval
- **Multi-agent coordination** — agents delegate via cryptographically-signed peer grants
- **LiteLLM registry** — centrally manage any LLM (OpenAI, Anthropic, Llama, local); agents pick from an approved roster

**🔌 Enterprise integrations**
- **Microsoft Entra ID** — auto-sync users and groups from Azure AD (groups map to realms)
- **SMTP** — configurable email notifications
- **Docker Compose** — pre-built dev + production stacks
- **LiteLLM proxy** — route requests to any model provider

---

## Architecture at a glance

```
┌─────────────────────────────────────────────────────────┐
│              VaultysClaw Control Plane (Next.js)          │
│   Dashboard • Workflow Editor • Policy Engine • Audit     │
│            SQLite • WebSocket Server (port 8080)          │
└────────────────┬────────────────────────────────────────┘
                 │  (Signed Intents + Policies)
      ┌──────────┼──────────┐
      ▼          ▼          ▼
  ┌────────┐ ┌────────┐ ┌────────┐
  │ Agent  │ │ Agent  │ │ Agent  │   ← Lightweight. Any LLM.
  │  #1    │ │  #2    │ │  #N    │     Cryptographic ID. 30+ tools.
  └────────┘ └────────┘ └────────┘
```

Each agent holds a unique VaultysId, connects to the control plane over WebSocket, receives signed policy updates and intents, reports actions back for the audit trail, and can delegate tasks to peer agents.

---

## Compliance & security

Built to implement Anthropic's **"Zero Trust for AI Agents"** framework (May 2026). Current status: **Foundation Tier ✅ (production-ready)**.

- ✅ Unique cryptographic identity per agent (VaultysId)
- ✅ Deny-by-default permission model
- ✅ Comprehensive, non-repudiable audit logging
- ✅ Signed policies & intents (ECDSA verification)
- ✅ Policy-based access control (expression engine)
- ✅ Identity-based resource isolation

**Readiness:** NIST SP 800-207 (all three zero-trust principles) · SOC 2 / HIPAA / GDPR foundation controls in place · 70% of the Anthropic framework's Foundation tier, with a clear roadmap to Enterprise.

**Next (Enterprise tier):** output filtering (block credential/PII leakage), automated behavioral response (auto-revoke on anomaly), immutable tamper-evident audit logs, cross-agent distributed tracing.

→ Full scoring, gaps, and quick wins in [`ZERO_TRUST_COMPLIANCE.md`](ZERO_TRUST_COMPLIANCE.md).

---

## Use cases

- **Regulatory compliance** — healthcare, finance, and government needing audit trails and approval workflows
- **Multi-team orchestration** — teams running agents in isolated realms without stepping on each other
- **Sensitive data handling** — agents touching customer data, credentials, or PII under zero-trust controls
- **Autonomous backends** — replace microservices with agents whose behavior is defined by policy, not code
- **Controlled experimentation** — test new agent behaviors with time- and capability-limited deployments

---

## Roadmap

- **Phase 1–3 — ✅ Complete** — identity, security, orchestration
- **Phase 4 — 🟡 In progress** — enterprise integrations, governance, scale
- **Phase 5 — 🔲 Planned** — documentation, enterprise hardening, SaaS option

→ Full maturity roadmap and compliance journey in [`ZERO_TRUST_COMPLIANCE.md`](ZERO_TRUST_COMPLIANCE.md).

---

## ⭐ Help us grow

VaultysClaw is open-source and built in the open. If zero-trust for AI agents matters to you:

- **Star the repo** — it's the single best signal that this problem is worth solving, and it's how others find us.
- **Try it and tell us** — open a [Discussion](https://github.com/vaultys/VaultysClaw/discussions) or [Issue](https://github.com/vaultys/VaultysClaw/issues) with what worked and what didn't.
- **Pick up a good first issue** — see [`CONTRIBUTING.md`](CONTRIBUTING.md). Quick wins are labeled and take 1–5 days.
- **Harden the platform** — security review, output filtering, and audit-log work are especially welcome.

## Community & support

- 💬 **Discussions:** [GitHub Discussions](https://github.com/vaultys/VaultysClaw/discussions)
- 🐛 **Bugs:** [GitHub Issues](https://github.com/vaultys/VaultysClaw/issues)
- 🔒 **Security:** see [`SECURITY.md`](SECURITY.md)
- 📧 **Email:** dev@vaultys.com

## License

MIT — see [`LICENSE`](LICENSE).
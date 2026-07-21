---
sidebar_position: 12
title: Custom Agent Runtime
description: Build your own agent implementation by extending BaseAgentRuntime from @vaultysclaw/sdk.
---

# Custom Agent Runtime

VaultysClaw ships with two built-in agent implementations:

| Package | Description |
|---|---|
| `@vaultysclaw/agent-controller` | Mastra + LLM provider (OpenAI, Anthropic, Ollama, …) |
| `@vaultysclaw/mcp-gateway` | Headless `claude -p` subprocess, exposed as MCP tools |

Both extend the same abstract base class from **`@vaultysclaw/sdk`**. You can do the same to build an agent backed by any runtime — a custom inference engine, a rules-based system, a human-in-the-loop workflow, or another LLM framework entirely.

---

## Architecture

```
@vaultysclaw/shared          (types, WS message shapes)
       ↓
@vaultysclaw/sdk             (BaseAgentRuntime)
  ├── WebSocket / WebRTC connection & auth
  ├── Intent routing + policy enforcement
  ├── Peer-to-peer agent invocations (PeerJS)
  └── abstract executeIntent() + abstract executeChat()
       ↓                      ↓
 agent-controller          mcp-gateway        your-agent
 (Mastra / LLM)            (claude -p)        (anything)
```

The protocol layer — registration, auth handshake, heartbeats, capability enforcement, peer catalog management — lives entirely in `BaseAgentRuntime`. Your subclass only implements **what to do** when an intent or a chat message arrives.

---

## Installation

```bash
pnpm add @vaultysclaw/sdk @vaultysclaw/shared
# WebRTC polyfill — required for Node.js (see WebRTC section below)
pnpm add @roamhq/wrtc
```

The package re-exports `PeerManager` and `verifyIntentMessage` so you do not need a separate dependency on `agent-controller`.

---

## Minimal implementation

```typescript
// index.ts — polyfill must come first (see WebRTC section below)
import "./polyfill";
import { BaseAgentRuntime, type AgentRuntimeConfig } from "@vaultysclaw/sdk";
import type { ChatMessageEntry } from "@vaultysclaw/shared";

class EchoAgent extends BaseAgentRuntime {
  // Called for every intent — from the control plane (WebSocket) or
  // from a peer agent (WebRTC).  Return any JSON-serialisable value.
  async executeIntent(
    action: string,
    params: Record<string, unknown>,
    _callerDid?: string,
    _intentId?: string
  ): Promise<unknown> {
    return { echo: { action, params } };
  }

  // Called for every chat message from the control-plane chat UI.
  // Use sendChunk() to stream text back.  Call it once with done=true
  // to close the response, or multiple times for streaming.
  async executeChat(
    messages: ChatMessageEntry[],
    _conversationId: string,
    sendChunk: (chunk: string, done?: boolean) => void
  ): Promise<void> {
    const last = [...messages].reverse().find((m) => m.role === "user");
    sendChunk(`You said: "${last?.content ?? ""}"`, true);
  }
}

// ── Start the agent ───────────────────────────────────────────────────────────

const config: AgentRuntimeConfig = {
  name: "echo-agent",
  controlPlaneUrl: process.env.CONTROL_PLANE_URL ?? "http://localhost:3000",
  controlPlaneWsUrl: process.env.CONTROL_PLANE_WS_URL ?? "ws://localhost:8080",
  vaultysIdPath: "./.vaultys/echo.id",
  requestedCapabilities: ["text_generation"],
};

const agent = new EchoAgent(config);

agent.on("log", ({ level, message }) => console.error(`[${level}] ${message}`));
agent.on("status_changed", ({ status }) => console.error(`status → ${status}`));

await agent.start();
```

---

## Abstract methods

### `executeIntent(action, params, callerDid?, intentId?)`

Handles an **intent** — a structured request with an action name and parameters.

| Source | How it arrives |
|---|---|
| Control-plane REST | `POST /api/agents/:did/run` → WebSocket `intent` message |
| Control-plane workflow | Workflow step targets this agent |
| Peer agent | WebRTC `invoke` message via `PeerManager` |

Return any JSON-serialisable value; the runtime wraps it in an `ExecutionResult` and sends it back to the caller automatically.

```typescript
async executeIntent(
  action: string,
  params: Record<string, unknown>,
  callerDid?: string,   // DID of the sender (peer agent or control-plane)
  intentId?: string     // ID echoed back in the result
): Promise<unknown> {
  if (action === "summarise") {
    const text = String(params.text ?? "");
    return { summary: text.slice(0, 100) + "…" };
  }
  throw new Error(`Unknown action: ${action}`);
}
```

:::tip
The base class enforces capability checks, token budget limits, and hourly rate limits **before** calling `executeIntent`. You do not need to repeat those checks.
:::

### `executeChat(messages, conversationId, sendChunk)`

Handles a **chat session** from the control-plane chat UI.

`messages` is the full conversation history (role + content). `sendChunk` sends a text delta back to the browser. The final call must set `done = true`.

```typescript
async executeChat(
  messages: ChatMessageEntry[],
  conversationId: string,
  sendChunk: (chunk: string, done?: boolean, isError?: boolean, errorCode?: string) => void
): Promise<void> {
  try {
    const reply = await myLlm.generate(messages);

    // Stream word by word
    for (const word of reply.split(" ")) {
      sendChunk(word + " ");
      await sleep(20);
    }
    sendChunk("", true); // signal end of stream
  } catch (err) {
    sendChunk(String(err), true, true, "llm_error");
  }
}
```

---

## Optional hooks

Override these `protected` methods to react to control-plane events without touching the protocol layer.

| Hook | When called |
|---|---|
| `onAuthComplete(payload)` | After the auth handshake succeeds; payload contains your certificate and policy metadata |
| `onLlmConfig(payload)` | Control plane pushed an LLM config update |
| `onDelegationUpdate(payload)` | User delegation grants/revocations received |
| `onPeerCatalogUpdated(grants)` | Peer agent catalog updated (new agents you can call) |
| `onSkillsConfig(payload)` | Workspace skill configuration changed |
| `onKnowledgeSources(sources)` | Knowledge source list updated |
| `getDailyTokenUsageForBudget()` | Return `{promptTokens, completionTokens}` so the base class can enforce `maxTokensPerDay`; default returns `{0, 0}` |

```typescript
protected async onAuthComplete(payload: WSAuthCompletePayload): Promise<void> {
  console.log("Connected. Policy:", payload.policyId);
}

protected async onPeerCatalogUpdated(grants: AgentPeerGrant[]): Promise<void> {
  console.log(`${grants.length} peer agent(s) available`);
}
```

---

## Connecting to peer agents

The runtime initialises `PeerManager` automatically. Call `invokePeer()` from anywhere in your subclass to send an intent to another agent over WebRTC.

```typescript
const result = await this.invokePeer(
  "did:vaultys:abc123",  // target agent DID
  "text_generation",     // action
  { prompt: "Summarise this document …" }
);
```

Peer agent DIDs come from `this.getPeerCatalog()`. The control plane must have created a peer grant between your agent and the target.

---

## WebRTC transport

To connect via WebRTC instead of WebSocket (lower latency, no control-plane relay for data), pass the control plane's PeerJS peer ID in config:

```typescript
const config: AgentRuntimeConfig = {
  // …
  peerjsControlPlaneId: "3381ae1e0875c8bb…",  // SHA-256 of control-plane DID
  peerjsServerUrl: "https://my-signaling-server.example.com",  // optional
};
```

When `peerjsControlPlaneId` is set the runtime automatically uses `connectViaPeerjs()` instead of `connectViaWs()`. All other behaviour — auth, intent routing, heartbeats — is identical.

### Node.js WebRTC polyfill (required)

`@vaultysclaw/sdk` deliberately does **not** install a WebRTC polyfill — that is the caller's responsibility, so you can choose the binding that works for your platform.

**Your entry point must polyfill the WebRTC globals before importing anything else.** The easiest way is a small module imported first:

```typescript
// src/polyfill.ts  — import this as the very first line of your entry point
import { createRequire } from "module";
const _req = createRequire(import.meta.url);
const wrtc = _req("@roamhq/wrtc") as Record<string, unknown>;
(global as Record<string, unknown>).RTCPeerConnection = wrtc.RTCPeerConnection;
(global as Record<string, unknown>).RTCSessionDescription = wrtc.RTCSessionDescription;
(global as Record<string, unknown>).RTCIceCandidate = wrtc.RTCIceCandidate;
(global as Record<string, unknown>).getUserMedia = wrtc.getUserMedia;
```

```typescript
// src/index.ts — polyfill MUST be the first import
import "./polyfill";
import { MyAgent } from "./agent";
// …
```

:::info Why `createRequire` instead of `import *`?
`@roamhq/wrtc` is a CJS package whose exports are populated by a native addon at runtime. ESM's static `import *` synthesis only sees exports that can be statically detected, which misses `RTCPeerConnection` and friends. `createRequire` loads the CJS module directly, giving you the full exports object.
:::

Add `@roamhq/wrtc` to your package's dependencies:

```bash
pnpm add @roamhq/wrtc
```

---

## Emitted events

Your code (or the process running the agent) can listen to these events.

```typescript
agent.on("log", ({ level, message, data }) => { … });
agent.on("status_changed", ({ status }) => { … });
agent.on("heartbeat", ({ uptime }) => { … });
agent.on("intent_received", ({ intentId, action, params }) => { … });
agent.on("intent_result", ({ intentId, status, output, error }) => { … });
```

`status` transitions: `initializing` → `connecting` → `pending_approval` (first run) → `connected` → `reconnecting` → `stopped`.

---

## Complete example — HTTP proxy agent

An agent that forwards every intent as an HTTP request to an external API:

```typescript
// Entry point — polyfill.ts imported first
import "./polyfill";
import { BaseAgentRuntime, type AgentRuntimeConfig } from "@vaultysclaw/sdk";
import type { ChatMessageEntry } from "@vaultysclaw/shared";

class HttpProxyAgent extends BaseAgentRuntime {
  private readonly apiBase: string;

  constructor(config: AgentRuntimeConfig, apiBase: string) {
    super(config);
    this.apiBase = apiBase;
  }

  async executeIntent(action: string, params: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.apiBase}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async executeChat(
    messages: ChatMessageEntry[],
    _conversationId: string,
    sendChunk: (chunk: string, done?: boolean) => void
  ): Promise<void> {
    const last = [...messages].reverse().find((m) => m.role === "user");
    const res = await fetch(`${this.apiBase}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: last?.content }),
    });
    const { reply } = await res.json();
    sendChunk(reply, true);
  }
}

const agent = new HttpProxyAgent(
  {
    name: "http-proxy",
    controlPlaneUrl: "http://localhost:3000",
    vaultysIdPath: "./.vaultys/proxy.id",
    requestedCapabilities: ["agent_communication"],
  },
  "https://api.example.com"
);

await agent.start();
```

---

## Reference

### `AgentRuntimeConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `name` | `string` | ✓ | Display name shown in the dashboard |
| `controlPlaneUrl` | `string` | ✓ | HTTP base URL of the control plane |
| `controlPlaneWsUrl` | `string` | | WebSocket URL (derived from `controlPlaneUrl` if omitted) |
| `peerjsControlPlaneId` | `string` | | PeerJS ID of the control plane — enables WebRTC transport |
| `peerjsServerUrl` | `string` | | Custom PeerJS signaling server URL |
| `vaultysIdPath` | `string` | ✓ | Path to the VaultysId identity file (created on first run) |
| `requestedCapabilities` | `AgentCapability[]` | ✓ | Capabilities to request on first registration |
| `workspaceRoot` | `string` | | Root directory for file-system tool access |

### Public API (from `BaseAgentRuntime`)

```typescript
agent.start(): Promise<void>
agent.stop(): void
agent.getDid(): string
agent.getStatus(): AgentStatus
agent.getPeerCatalog(): AgentPeerGrant[]
agent.invokePeer(targetDid, action, params): Promise<unknown>
agent.getInfo(): AgentInfo
```

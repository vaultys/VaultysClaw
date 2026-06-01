---
name: add-ws-message
description: "Add a new WebSocket message type to the VaultysClaw protocol. Use when extending agent-control plane communication: new commands sent from control plane to agent, new status reports sent from agent to control plane, or new bidirectional message flows. Covers shared type definition, payload interface, control-plane handler, agent handler, and signed message verification."
argument-hint: "<type-name> [--signed] — e.g. 'memory_sync' or 'config_push --signed'"
---

# Add WebSocket Message Type

## When to Use

- Adding a new command the control plane sends to agents
- Adding a new report/event agents send back to the control plane
- Extending the protocol for a new feature (sync, config, notifications, etc.)

## Protocol Overview

`WSMessage` is a **flat interface** (not a discriminated union) — all messages share the same envelope:

```typescript
{
  messageId: string;      // e.g. "memory-sync-1748700000000"
  type: WSMessageType;    // string literal from the union
  agentId?: string;       // sender's DID (set by the agent or control plane)
  payload: any;           // typed by convention via payload interface
  timestamp: string;      // ISO 8601
  signature?: string;     // ECDSA hex — only for critical messages
}
```

## Procedure

### 1. Add the Type String to the Union

**File:** `packages/shared/src/types.ts`

Add your new type literal to the `WSMessageType` union:

```typescript
export type WSMessageType =
  | ... existing types ...
  | "my_new_type";   // ← add here
```

### 2. Add the Payload Interface

In the **same file** (`packages/shared/src/types.ts`), add a typed payload interface:

```typescript
export interface WSMyNewTypePayload {
  // required fields
  sourceId: string;
  // optional fields
  metadata?: Record<string, unknown>;
}
```

Naming convention: `WS` + PascalCase(type) + `Payload` (e.g. `WSMemorySyncPayload`).

### 3. Handle in the Control Plane (`lib/ws-server.ts`)

**Direction: agent → control plane** (agent sends, server receives):

Add a `case` to the `switch (message.type)` in `handleMessage()`:

```typescript
case "my_new_type":
  this.handleMyNewType(message);
  break;
```

Then implement the handler as a private method:

```typescript
private handleMyNewType(message: WSMessage): void {
  const payload = message.payload as WSMyNewTypePayload;
  const agentId = message.agentId;
  // ... business logic ...
}
```

**Direction: control plane → agent** (server sends):

Add a public method to send the message:

```typescript
sendMyNewTypeTo(agentDid: string, data: WSMyNewTypePayload): boolean {
  const agent = this.agents.get(agentDid);
  if (!agent || !agent.sender.isOpen()) return false;
  this.sendMessage(agent.sender, {
    messageId: `my-new-type-${Date.now()}`,
    type: "my_new_type",
    agentId: agentDid,
    payload: data,
    timestamp: new Date().toISOString(),
  });
  return true;
}
```

### 4. Handle in the Agent (`src/agent.ts`)

Add a `case` to the `switch (message.type)` in `handleMessage()`:

```typescript
case "my_new_type":
  this.handleMyNewType(message);
  break;
```

Implement the handler as a private method. Use `.catch()` for async:

```typescript
private handleMyNewType(message: WSMessage): void {
  const payload = message.payload as WSMyNewTypePayload;
  // ... react to the message ...
}

// If async:
case "my_new_type":
  this.handleMyNewType(message).catch((e) => this.log("error", "handleMyNewType error", e));
  break;
```

For messages that **agent sends** to control plane, call `this.send(message)`.

### 5. For Signed Messages (critical/policy-like)

Only if the message carries trust-sensitive data (policies, capability grants):

**Signing** (control plane side, before sending):

```typescript
import { signMessage } from "@vaultysclaw/shared";

const payload = { ... };
const signature = await signMessage(JSON.stringify(payload), serverPrivateKey);
this.sendMessage(sender, { ..., payload, signature });
```

**Verification** (agent side, before processing):

```typescript
import { verifySignature } from "@vaultysclaw/shared";

private async handleMySignedType(message: WSMessage): Promise<void> {
  const isValid = await verifySignature(
    JSON.stringify(message.payload),
    message.signature!,
    this.controlPlanePublicKey,
  );
  if (!isValid) {
    this.log("error", "Invalid signature — rejecting my_signed_type message");
    return;
  }
  // ... proceed ...
}
```

Add a status guard for post-auth messages (like `intent`, `policy_update`):

```typescript
case "my_new_type":
  if (this._status !== "connected") {
    this.log("warn", "Received my_new_type before auth — ignoring");
    return;
  }
  this.handleMyNewType(message);
  break;
```

### 6. Checklist Before Done

- [ ] Type literal added to `WSMessageType` union in `packages/shared/src/types.ts`
- [ ] Payload interface added in `packages/shared/src/types.ts` (named `WS<TypeName>Payload`)
- [ ] `packages/shared` rebuilt (`pnpm build -F @vaultysclaw/shared`) before using in other packages
- [ ] `case` added to `handleMessage()` switch in `lib/ws-server.ts`
- [ ] Handler method implemented in `ws-server.ts`
- [ ] `case` added to `handleMessage()` switch in `src/agent.ts`
- [ ] Handler method implemented in `agent.ts`
- [ ] Signed messages: verification call before processing (agent side)
- [ ] Post-auth messages: `_status !== "connected"` guard in agent switch
- [ ] Async handlers wrapped with `.catch()` in agent switch

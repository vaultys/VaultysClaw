// ─── packages/shared/src/types.ts ────────────────────────────────────────────
// Step 1: Add to WSMessageType union
export type WSMessageType =
  // ... existing types ...
  | "my_new_type";  // ← new entry

// Step 2: Add payload interface
export interface WSMyNewTypePayload {
  sourceId: string;
  data: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

// ─── packages/control-plane/lib/ws-server.ts ─────────────────────────────────

// In handleMessage() switch — agent → control plane direction:
switch (message.type) {
  // ... existing cases ...
  case "my_new_type":
    this.handleMyNewType(message);
    break;
}

// New handler method (add as private method in WSServer class):
private handleMyNewType(message: WSMessage): void {
  const payload = message.payload as WSMyNewTypePayload;
  const agentId = message.agentId;
  if (!agentId) return;

  // TODO: business logic
  // e.g. persist to DB, emit event to admin clients, update agent state
}

// OR — control plane → agent direction: public send method
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

// ─── packages/agent-controller/src/agent.ts ──────────────────────────────────

// In handleMessage() switch:
switch (message.type) {
  // ... existing cases ...
  case "my_new_type":
    // For post-auth messages, guard against early delivery:
    if (this._status !== "connected") {
      this.log("warn", "Received my_new_type before auth — ignoring");
      return;
    }
    // For async handlers:
    this.handleMyNewType(message).catch((e) =>
      this.log("error", "handleMyNewType error", e),
    );
    // For sync handlers:
    // this.handleMyNewType(message);
    break;
}

// New handler method (add as private method in AgentController class):
private async handleMyNewType(message: WSMessage): Promise<void> {
  const payload = message.payload as WSMyNewTypePayload;

  // TODO: react to the message
  // e.g. update local state, write to DB, emit an event
  this.emit("my_new_type", payload);
}

// To SEND this type from the agent to the control plane:
private sendMyNewType(data: WSMyNewTypePayload): void {
  this.send({
    messageId: `my-new-type-${Date.now()}`,
    type: "my_new_type",
    agentId: this.id,
    payload: data,
    timestamp: new Date().toISOString(),
  });
}

// ─── Signed message variant (for trust-sensitive data) ───────────────────────

// Control plane — signing before send:
import { signMessage } from "@vaultysclaw/shared";

const payload: WSMySignedPayload = { ... };
const signature = await signMessage(JSON.stringify(payload), serverPrivateKey);
this.sendMessage(sender, {
  messageId: `my-signed-${Date.now()}`,
  type: "my_signed_type",
  agentId: targetDid,
  payload,
  signature,
  timestamp: new Date().toISOString(),
});

// Agent — verification before processing:
import { verifySignature } from "@vaultysclaw/shared";

private async handleMySignedType(message: WSMessage): Promise<void> {
  const isValid = await verifySignature(
    JSON.stringify(message.payload),
    message.signature!,
    this.controlPlanePublicKey,
  );
  if (!isValid) {
    this.log("error", "Invalid signature — rejecting my_signed_type");
    return;
  }
  const payload = message.payload as WSMySignedPayload;
  // ... proceed safely ...
}

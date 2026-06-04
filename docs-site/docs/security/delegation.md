---
sidebar_position: 4
title: Delegation
description: How users grant capabilities to agents via cryptographically-verified delegation certificates.
---

# Delegation

Delegation is the mechanism by which a human user authorises an agent to act on their behalf with specific capabilities. Vaultys Claw implements delegation through cryptographically-signed certificates — so agents can verify authorisation **without** a live query to the control plane.

## The delegation model

```mermaid
flowchart TD
  U["User (authenticated)\nHas: role in realm + capability grant"]
  CP["Control Plane (VaultysId)\nVerifies role & grant → issues cert"]
  CERT["DelegationCert\nsigned by control plane VaultysId"]
  A["Agent\nStores cert locally\nVerifies offline at execution time"]
  EXEC(["Execution authorised ✓"])

  U -->|authenticate| CP
  CP -->|sign| CERT
  CERT -->|push via WebSocket| A
  A -->|verify signature + expiry| EXEC
```

## Certificate structure

```typescript
interface DelegationCertPayload {
  id: string; // Unique cert ID
  grantId: string; // Source grant in control plane DB
  userDid: string; // The user being delegated from
  agentDid: string; // The agent being delegated to
  // (or "*" for all agents)
  capabilities: AgentCapability[]; // What is delegated
  certificate: string; // base64-encoded signature
  expiresAt?: string; // ISO 8601 optional expiry
}
```

## Certificate lifecycle

```mermaid
sequenceDiagram
  participant Admin as Admin
  participant CP as Control Plane
  participant A as Agent
  participant U as User

  Admin->>CP: Create grant (userDid, agentDid, capabilities)
  CP->>CP: Sign DelegationCert with VaultysId
  CP->>A: WS "delegation_update" {certificates: [...]}
  Note over A: Stores cert in memory

  U->>CP: POST /api/intents (with sessionToken)
  CP->>A: WS "intent" (signed)
  A->>A: Look up cert for userDid + capability
  A->>A: Verify cert signature (offline)
  A->>A: Check expiresAt
  A->>A: Execute ✓
  A->>CP: WS "result" (signed)
```

### When certificates are created

Certificates are created whenever:

1. An agent registers (all existing grants are pushed as certs)
2. A new grant is created (cert is pushed to the relevant agent immediately)
3. A cert expires and is renewed

### Revocation

```mermaid
sequenceDiagram
  participant Admin as Admin
  participant CP as Control Plane
  participant A as Agent

  Admin->>CP: DELETE /api/grants/:id
  CP->>A: WS "delegation_update" {removed: ["cert_01HZ..."]}
  A->>A: Delete cert from local store
  Note over A: Next intent from this user → cert not found → reject ✗
```

## Distribution via WebSocket

The control plane pushes certificates to agents via the `delegation_update` message:

```json
{
  "type": "delegation_update",
  "payload": {
    "certificates": [
      {
        "id": "cert_01HZ...",
        "userDid": "did:vaultys:z6MkUser...",
        "agentDid": "did:vaultys:z6MkAgent...",
        "capabilities": ["api_call", "file_access"],
        "certificate": "base64...",
        "expiresAt": "2026-12-31T23:59:59Z"
      }
    ],
    "removed": []
  },
  "signature": "base64...",
  "publicKey": "z6MkCP..."
}
```

## Grant-to-cert relationship

Each **grant** (stored in the control plane database) produces one or more **delegation certificates** (pushed to agents).

```mermaid
graph LR
  G["Grant\nuserDid: Alice\nagentDid: null (all)\ncaps: api_call"]
  C1["DelegationCert\nfor Agent A"]
  C2["DelegationCert\nfor Agent B"]
  C3["DelegationCert\nfor new Agent C\n(on registration)"]

  G -->|push to each connected agent| C1
  G --> C2
  G -->|push at registration time| C3
```

## Agent peer grants

The same delegation mechanism is used for **agent-to-agent** communication:

```typescript
interface AgentPeerGrant {
  id: string;
  sourceDid: string; // Calling agent DID
  targetDid: string; // Target agent DID
  targetName: string; // Human-readable name
  skillDescription: string; // Used as the LLM tool description
  capabilities: string[]; // Capabilities the source can invoke on target
  certificate: string; // Signed by control plane
  expiresAt?: string;
}
```

Peer grants are distributed via the `agent_peer_catalog` WebSocket message. The calling agent verifies the certificate before routing a request to the peer.

## Security properties of delegation

| Property            | How it is achieved                                                       |
| ------------------- | ------------------------------------------------------------------------ |
| Unforgeable         | Only the control plane's VaultysId private key can sign certificates     |
| Tamper-evident      | Any modification to the certificate content breaks the signature         |
| Offline-verifiable  | Agent holds the control plane's public key; no network round-trip needed |
| Time-limited        | Optional `expiresAt` field enforced by the agent                         |
| Instantly revocable | Control plane pushes a removal message; agent deletes the cert           |
| Scoped              | Cert specifies exact capabilities — not "everything"                     |

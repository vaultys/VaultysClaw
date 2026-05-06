# Security Architecture

## Overview

VaultysClaw is **secure by design** using VaultysId for decentralized, non-transferable identity. Every agent, policy, intent, and result is cryptographically signed and verified in a P2P fashion.

## Core Principles

1. **Non-Transferable Identity**: Each agent controller has a unique VaultysId that cannot be copied or transferred
2. **Zero-Trust Communication**: All messages are signed and verified
3. **Policy-Based Access Control**: Capabilities are granted via signed policies
4. **Decentralized Verification**: Agents verify control plane identity without central intermediaries
5. **Audit Trail**: All actions signed and timestamped

## Identity Model

### Control Plane Identity (VaultysID)
- Created and managed by the control plane
- Signs policies and intents
- Non-transferable to other control planes
- Public VaultysID shared with all agents

### Agent Identity (VaultysID)
- Created during agent registration
- Unique per agent controller instance
- Signs execution results
- Verified by control plane to detect maybe some
- Verified by the next Agent Controller before executing and action

```
┌─────────────────────────────────────────────────────────┐
│                   VaultysId                             │
├─────────────────────────────────────────────────────────┤
│  Control Plane          │         Agent Controller      │
│  ┌─────────────┐        │         ┌──────────────┐      │
│  │ Private Key │        │         │ Private Key  │      │
│  │ (secure)    │        │         │ (secure)     │      │
│  └──────┬──────┘        │         └──────┬───────┘      │
│         │               │                │              │
│         ├─→ Signs       │                ├─→ Signs      │
│         │   policies    │                │   results    │
│         │   | intents   │                │              │
│         ▼               │                ▼              │
│  ┌─────────────┐        │         ┌──────────────┐      │
│  │ VaultysID   │        │         │ VaultysID    │      │
│  │(distributed)│        │         │(distributed) │      │
│  └─────────────┘        │         └──────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## Message Flow

### 1. Agent Registration

```
Agent Controller              Control Plane
        |                            |
 Create VaultysId              Create VaultysId
        |                            |
        |←-- Registration (SRP)  --→ | 
        |                            |
        |                    Generate Policy
        |                            |
        |←-- Policy signed (SRP)  --→|
        |                            |
   Store Policy                Verify Agent
   Verify Signature             Store Agent VaultysID and policy
```

### 2. Intent Distribution

```
Agent Controller 1             Agent Controller 2
        |                            |
   Create Intent                     |
   Sign with VaultysId.              |
   {action, params, sig}             |
        |                            |
        |--- Send Intent (signed) -→ |
        |                    Verify Signature
        |                    Check Policy (ask a copy of the policy associated with the VaultysID of the Agent controller 1 to the control plane if not needed)
        |                    Execute Action
```

### 3. Result Return

```
Agent Controller              Control Plane
        |                            |
   Execute Intent                    |
   Prepare Result                    |
   Sign with Agent VaultysID         | 
        |                            |
        |--- Send signed result   --→|
        |                    Verify Signature
        |                    Log Result
        |                    Update State
```

## Cryptographic Operations

### Signing a Message

```typescript
import { VaultysId } from "@vaultys/id";

const vaultysId = await VaultysId.load("./agent.id");
const message = JSON.stringify({ action: "file_read", path: "/data.txt" });
const signature = await vaultysId.sign(message);

// Message sent with signature
```

### Verifying a Signature

```typescript
import { VaultysId } from "@vaultys/id";

// Verify using public key
const isValid = await VaultysId.verify(
  message,
  signature,
  publicKey
);

if (!isValid) {
  throw new Error("Invalid signature - possible tampering");
}
```

## Policy Structure

```typescript
interface AgentPolicy {
  id: string;
  agentControllerId: string;
  
  // What the agent can do
  capabilities: [
    "file_access",      // Read/write files
    "internet_access",  // Make HTTP requests
    "browser_control",  // Control browser
    "api_call",         // Call APIs
    "mail_send",        // Send emails
    "code_execution",   // Run code
    "system_command"    // System commands
  ];

  // Resource limits
  resourceLimits: {
    maxCpuPercent: 50,
    maxMemoryMb: 512,
    maxNetworkBandwidthMbps: 10
  };

  // Time window
  timeWindow: {
    startTime: "2024-01-01T00:00:00Z",
    endTime: "2024-12-31T23:59:59Z"
  };

  // Signed by control plane
  signature: "...",
  signedBy: "control-plane-id"
}
```

Policies are:
1. **Created by control plane**
2. **Signed by control plane private key**
3. **Published to agents**
4. **Verified by agents before accepting**
5. **Updated via policy-update intents**

## Verification Checklist

Before executing an intent, agent checks:

```typescript
// 1. Signature valid?
if (!await verifySignature(intent.signature, cpPublicKey)) {
  throw new Error("Invalid intent signature");
}

// 2. Policy exists and is valid?
const policy = await loadPolicy(intent.agentId);
if (!policy || policy.expired) {
  throw new Error("No valid policy");
}

// 3. Policy is properly signed?
if (!await verifySignature(policy.signature, cpPublicKey)) {
  throw new Error("Invalid policy signature");
}

// 4. Agent has capability?
if (!policy.capabilities.includes(intent.action)) {
  throw new Error("Capability not granted");
}

// 5. Within resource limits?
if (estimatedMemory > policy.resourceLimits.maxMemoryMb) {
  throw new Error("Would exceed memory limit");
}

// 6. Within time window?
if (now < policy.timeWindow.start || now > policy.timeWindow.end) {
  throw new Error("Outside policy time window");
}

// ✅ Safe to execute
execute(intent);
```

## Threat Model

### Attack: Intent Tampering
**Defense**: Signature verification
- Intent is signed by control plane
- Agent verifies signature before execution
- Attacker cannot modify intent without private key

### Attack: Replay Attack
**Defense**: Intent IDs and timestamps
- Each intent has unique ID
- Timestamp included
- Agent tracks processed intents
- Prevents processing same intent twice

### Attack: Policy Downgrade
**Defense**: Policy version tracking
- Policies have version numbers
- Agent refuses to downgrade to older policy
- All changes logged and signed

### Attack: Man-in-the-Middle
**Defense**: Signature verification
- All communication signed
- Verification with public key
- No plaintext secrets in transit

### Attack: Compromised Agent
**Defense**: Limited capabilities
- Each agent has specific capability grants
- Other agents unaffected
- Logs show what compromised agent did
- Can revoke immediately

### Attack: Unauthorized Agent
**Defense**: Registration flow
- Registration signed by control plane
- Identity verified before use
- Public key verification

## Implementation Checklist

- [ ] VaultysId integration in `packages/shared/src/security.ts`
- [ ] Agent registration endpoint with verification
- [ ] Policy storage with signature validation
- [ ] Intent verification before execution
- [ ] Result verification on control plane
- [ ] Audit logging for all operations
- [ ] Key rotation mechanism
- [ ] Revocation list (CRL)

## Key Management

### Private Key Storage
- Agent: Encrypted local file (`.vaultys/agent.id`)
- Control Plane: Encrypted local file (`.vaultys/control-plane.id`)
- **Never** commit to git (in `.gitignore`)
- **Protect** with file permissions (chmod 600)

### Public Key Distribution
- Each service publishes its public key
- Agents fetch control plane public key on registration
- Control plane stores agent public keys
- Distribution via direct API calls (HTTPS only)

### Key Rotation
- Support periodic key rotation
- New keys distributed to all agents
- Old keys continue working for grace period
- Eventually deprecate old keys

## Deployment Security

1. **Control Plane**
   - Run behind HTTPS
   - Restrict API access to authorized networks
   - Use strong postgres/sqlite passwords
   - Encrypt database backups
   - Enable audit logging

2. **Agent Controllers**
   - Run in isolated containers/VMs
   - Restrict outbound network access
   - Monitor resource usage
   - Log all actions
   - Disable unnecessary capabilities

3. **Network**
   - VPN/encrypted channels between agents
   - TLS for all communication
   - Firewall rules
   - Rate limiting
   - DDoS protection

## Compliance

Consider for your deployment:
- GDPR (data protection)
- HIPAA (healthcare)
- SOC 2 (security controls)
- FedRAMP (government)
- ISO 27001 (information security)

VaultysClaw provides the security foundation. Deployment practices should follow your organization's compliance requirements.

## Security Advisories

Report security issues to: (contact TBD)

Do not open public GitHub issues for security vulnerabilities.

## Further Reading

- VaultysId documentation: https://github.com/vaultys/vaultysid
- Cryptographic best practices: https://crypto.stackexchange.com/
- OWASP Top 10: https://owasp.org/Top10/

# @vaultysclaw/shared

Shared types, security utilities, and channel protocol definitions used across all
VaultysClaw packages. This is the contract layer that keeps the control plane,
agent controller, agent runtime, and MCP gateway in sync.

## What's inside

- **`src/types.ts`** — core domain types: `VaultysIdentity`, `AgentCapability`,
  `ResourceLimits`, `AgentPolicy`, `SignedIntent`, `ExecutionResult`.
- **`src/channel-types.ts`** — the typed WebSocket message envelope exchanged
  between agents and the control plane (`register`, `intent`, `result`,
  `policy_update`, …). Critical messages carry ECDSA signatures.
- **`src/constants/`** — shared constants (e.g. Vaultys URLs).

## Usage

Import via the workspace path alias:

```typescript
import type { SignedIntent, AgentCapability } from "@vaultysclaw/shared";
```

## Scripts

```bash
pnpm build        # compile to dist/ with tsc
pnpm type-check   # tsc --noEmit
pnpm lint
```

This package has no runtime entry point — it is consumed as a library by the other
workspace packages.

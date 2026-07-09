# packages/policy

The **policy engine** — pure, dependency-light logic for what an agent is allowed
to do. No Prisma, Next.js, or WebSocket coupling; depends only on `@vaultys/id`
and `@msgpack/msgpack`. Import via `@vaultysclaw/policy`.

## What lives here

- **`src/types.ts`** — canonical `AgentCapability`, `ResourceLimits`,
  `PolicyResourceLimits`, `PolicyEntry`. `@vaultysclaw/shared` and the
  control-plane policy contract re-export these for backward compatibility.
- **`src/certs/`** — the single implementation of the signed-cert wire format
  `base64( 4-byte-LE len | msgpack(body) | signature )`:
  - `codec.ts` — `packCert` / `unpackCert`
  - `sign.ts` — generic `signCert(vid, payload)` / `openCert(vid, token)`
  - `intent.ts`, `delegation.ts`, `peer-grant.ts` — typed wrappers
    (`sign*Cert` / `verify*Cert`)
- **`src/enforcement/`** — `PolicyEnforcer`: runtime gates (capability, policy
  expiry, daily token budget, hourly request rate) plus `resolveEffectiveAction`.
  Clock and token-usage source are injected so it unit-tests without an agent.

## Who consumes it

- `packages/agent-runtime` — `base-agent.ts` composes `PolicyEnforcer`;
  `intent-verify.ts` / `peer-grant-verify.ts` are thin wrappers over the cert
  layer (construct a `VaultysId` from the server public key, then delegate).
- `packages/control-plane` — `lib/intent-signing.ts` / `lib/delegation.ts` are
  DB-aware wrappers that resolve the server identity from `serverSecret` and
  delegate to the cert layer.

Persistence (`PolicyDAO`), distribution (`ws-server.applyPolicy`), API routes,
and governance UI intentionally stay in `control-plane` — this package is the
engine, not the plumbing.

## Design rules

- **No I/O.** Signing/verification take a `VaultysId`; enforcement takes injected
  `now` + `getDailyTokenUsage`. Callers own DB/secret access.
- **Preserve error strings.** Enforcement error messages are user-facing and
  asserted against in tests — keep them stable.

## Testing

Dedicated, Docker-free suite (own `vitest.config.mjs`, no global setup):

```bash
pnpm --filter @vaultysclaw/policy test        # fast, standalone
pnpm --filter @vaultysclaw/policy type-check
```

`__tests__/enforcer.test.ts` covers the gates against the real `PolicyEnforcer`;
`__tests__/certs.test.ts` covers the cert round-trip against a generated
`VaultysId`. The repo-root `pnpm test` also picks these up.

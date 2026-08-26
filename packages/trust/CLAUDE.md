# packages/trust

The **trust ledger engine** — pure, dependency-light logic for resolving what a Principal is
allowed to do *right now*, given the full set of certificates it currently holds. No Prisma,
Next.js, or WebSocket coupling; depends only on `@vaultysclaw/policy` for the underlying
`AgentCapability`/`ResourceLimits` types. Import via `@vaultysclaw/trust`.

Design and rationale: [`docs/CERTIFICATE_WEB_OF_TRUST.md`](../../docs/CERTIFICATE_WEB_OF_TRUST.md)
§3.6 and §9.

## Why this is a separate package from `packages/policy`

`packages/policy`'s `PolicyEnforcer` gates a single agent against a single active policy.
`resolvePermission` here gates an action against a *set* of concurrently active, possibly
overlapping, possibly attribute-scoped certificates (standing grants and short-lived ABAC grants
side by side) — a different responsibility with a different test shape (combination coverage over
cert sets, not gate-by-gate checks). Keeping it separate keeps both packages easy to audit in
isolation.

## What lives here

- **`src/types.ts`** — `CertScope` (the ABAC attribute-scoping shape: `resource`,
  `resourcePattern`, `maxUses`, `purpose`), `CapabilityCertificateLite` (the minimal shape
  `resolvePermission` needs — a subset of the full `CapabilityCertificate` ledger row), and the
  request/decision types.
- **`src/resolve-permission.ts`** — `resolvePermission(action, activeCerts, now)`: the core
  decision function. Returns the first active, non-expired, capability- and scope-matching
  certificate that authorizes the action, or a denial with a reason.
- **`src/renewal.ts`** — `isEligibleForProactiveRenewal`: which certs a renewal scan
  (control-plane side) should even consider — standing grants only, never scoped/ephemeral ones,
  never certs with `expiresAt: null`.

## Who consumes it

- `packages/controlplane` — `lib/access-control.ts`'s `hasCapability` fetches the current
  `CapabilityCertificate` rows for a Principal (`db/certificate.dao.ts`'s `toLite`) and calls
  `resolvePermission`. This is the **only** authorization mechanism in the console — there is no
  role check anywhere to keep in sync with it.
- `packages/sdk` — local decisions with no DB in the loop, over the certificate the client holds.
- `sdk-go/authz` — the Go port, held to this package by `conformance/permission-vectors.json`
  (25 cases, run by both suites). Never change a vector on one side only.

## Design rules

- **No I/O.** Every function here takes already-verified data and a clock; callers own
  DB/network/crypto-verification. `packages/policy/src/certs` verifies a cert's signature — this
  package only ever sees the decoded, already-trusted payload.
- **Two invariants any change here must preserve** (see `__tests__/resolve-permission.test.ts`):
  revoking a certificate never grants more access, and adding a certificate never removes access
  except through an explicit scope-narrowing supersession.

## Testing

Dedicated, Docker-free suite (own `vitest.config.mjs`, no global setup):

```bash
pnpm --filter @vaultysclaw/trust test        # fast, standalone
pnpm --filter @vaultysclaw/trust type-check
```

The repo-root `pnpm test` also picks these up.

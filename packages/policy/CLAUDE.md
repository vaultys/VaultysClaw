# packages/policy

The **policy engine** — pure, dependency-light logic for what an agent is allowed
to do. No Prisma, Next.js, or WebSocket coupling; depends only on `@vaultys/id`
and `@msgpack/msgpack`. Import via `@vaultysclaw/policy`.

## What lives here

- **`src/types.ts`** — canonical `AgentCapability`, `CertScope`, `ResourceLimits`,
  `PolicyResourceLimits`, `PolicyEntry`. `@vaultysclaw/trust` imports `CertScope`
  from here rather than redeclaring it — it is part of the wire format, not the
  decision logic.
- **`src/certs/`** — the single implementation of the signed-cert wire format
  `base64( 4-byte-LE len | msgpack(body) | signature )`:
  - `codec.ts` — `packCert` / `unpackCert`
  - `sign.ts` — generic `signCert(vid, payload)` / `openCert(vid, token)`, plus
    `decodeCertUnsafe(token)` — decodes a payload **without** verifying its
    signature, for display/audit UIs only (e.g. a certificate detail page).
    Never use it to make an authorization decision.
  - `intent.ts`, `delegation.ts`, `peer-grant.ts` — typed wrappers
    (`sign*Cert` / `verify*Cert`)
  - `capability-grant.ts` — the co-signed request/grant pair
    (docs/CERTIFICATE_WEB_OF_TRUST.md §3.2): `signCapabilityRequestCert` (agent
    or system self-signs the "ask"), `signCapabilityGrantCert` (control plane
    signs the grant, embedding the request verbatim as the co-signature).
  - `cert-status.ts` — the OCSP-style status-check protocol (trust doc §4.1):
    `signCertStatusRequestCert`/`signCertStatusResponseCert`, the latter
    supporting a `maxAgeMs` staple-TTL check on verification.
- **`src/enforcement/`** — `PolicyEnforcer`: runtime gates (capability, policy
  expiry, daily token budget, hourly request rate) plus `resolveEffectiveAction`.
  Clock and token-usage source are injected so it unit-tests without an agent.

## Who consumes it

- `packages/controlplane` — `lib/certificates.ts` (issuance), `lib/cert-inspect.ts`
  (re-verification for the certificate detail page), `lib/ws-server.ts` (the
  `cert_status_request`/`cert_status_response` protocol), `lib/proxy-rules.ts`
  (signed rule sets). It resolves the server identity from the DB, then delegates
  to the cert layer here.
- `packages/trust` — imports the capability/scope types; `resolvePermission`
  decides over them.
- `packages/sdk` — verifies what it receives with no DB in the loop.
- `sdk-go/grant` — the Go port of the packcert verification, held to this package
  by `conformance/grant-fixture.json`.

Persistence, distribution and UI intentionally stay in `packages/controlplane` —
this package is the engine, not the plumbing.

Some of the surface here (`intent.ts`, `delegation.ts`, `peer-grant.ts`,
`PolicyEnforcer`'s token/rate gates) has **no consumer in this repo today** — it
was built for the agent runtime that has since been removed. It is kept because
the wire formats are stable and independently tested, but do not assume a caller
exists; check before extending it.

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
`__tests__/certs.test.ts` covers the codec/intent/delegation/peer-grant cert
round-trips plus `decodeCertUnsafe`; `__tests__/capability-certs.test.ts` covers
the capability request/grant co-signature and the cert-status protocol. The
repo-root `pnpm test` also picks these up.

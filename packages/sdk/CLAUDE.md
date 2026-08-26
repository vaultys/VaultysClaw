# packages/sdk

The TypeScript client for the control plane's protocol — the counterpart of `sdk-go/`. Instantiate
`ActorRuntime`; it is not subclassed (there is no work pushed in to handle).

An Actor proves its identity, obtains a certificate, **gates its own behaviour** on what it was
granted, and keeps that grant honest by re-checking it. Behaviour is ported from the Go SDK's
`vconn.ClientConn`, which has been exercised against a real control plane.

## What lives here

- **`actor-runtime.ts`** — connection lifecycle, the Challenger handshakes, and the certificate
  status loop (below).
- **`handshake.ts`** — the two Challenger exchanges (`auth`, `certificate`). `contactId()` is where
  the control plane's own identity comes from.
- **`cap-state.ts`** — persists the granted certificate, its capabilities, and the last verified
  status. Deliberately file-compatible with the Go SDK's `vconn/capstate.go`; new fields are
  optional for that reason.
- **`capability-manifest.ts`** — the `capabilities.json` format (below).
- **`protocol.ts`** — the message envelope and payload types.

## Certificate status: the staple loop

A certificate is a signed artefact, so holding one proves it *was* issued — not that it is still
good. The runtime therefore re-checks it:

- `refreshCertStatus()` signs a `cert_status_request`, and verifies the response against the
  **control plane's key from the completed handshake** — not merely because it arrived on an
  authenticated socket. The verified response *replaces* the held capability set, which is how a
  revocation, or a custom capability deleted from the registry, actually lands.
- Cadence comes from `actor_config`'s `trust.maxStatusAgeSeconds`: positive refreshes at half that
  interval (so one dropped message doesn't immediately deny everything), negative disables
  auto-refresh, and **0 means no cached status is acceptable at all**.
- `trust.failClosed` decides what a stale staple means. Closed: deny. Open: keep the cached grant.
  No config at all is treated as closed.

**Deciding**: `resolvePermission()` is synchronous and decides on what is already known — it denies
on a non-active status, and on a stale staple under `failClosed` (so under
`maxStatusAgeSeconds: 0` it always denies). `checkPermission()` and `isOperationAllowed()` are the
async variants that refresh first; use those for anything consequential.

There is deliberately **no** "nothing granted means allow everything" fallback anywhere in this
package. An unbound operation, an ungranted capability, and an unreachable control plane all deny.

## The capability manifest

`capabilities.json` (path via `capabilityManifestPath`) declares which capabilities the application
needs and which of its operations each one gates:

```jsonc
{
  "version": 1,
  "declares": [
    { "name": "acme:invoice.approve", "label": "Approve invoices",
      "description": "Marks an invoice approved in the Acme ERP." }
  ],
  "bindings": { "erp_approve_invoice": "acme:invoice.approve" }
}
```

This SDK has **no tool registry**. What an operation *is* — a tool, a route, a button — is the
host's business, and so is what a capability means. What the SDK owns is the seam: which capability
gates which operation name (`capabilityFor`), whether it may run right now
(`isOperationAllowed`), and reporting the declared set to the control plane in `register` so an
admin can see what is wanted.

Parsing is strict — every problem throws rather than warning, because each one describes an
operation that would otherwise be silently ungated or permanently denied: an invalid name, a
binding naming an undeclared capability, a duplicate declaration. A configured manifest path that
does not exist is an error too; degrading to "no capabilities" would look identical to an
application that needs none.

**Declaring is not requesting, and neither is granting.** An admin creates the registry entry and
issues the certificate. See `docs/CUSTOM_CAPABILITIES.md`.

## Tests

`__tests__/` — the status-loop decision logic and manifest parsing, both without a socket (neither
depends on one). Run: `pnpm --filter @vaultysclaw/sdk test`.

The vitest config aliases `@vaultysclaw/policy` and `@vaultysclaw/trust` to their **source**: those
packages resolve `types` from `src/` but `import` from a gitignored `dist/`, so a runtime value
import would otherwise hit stale or missing output while type-checking cleanly.

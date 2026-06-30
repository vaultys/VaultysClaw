# @vaultysclaw/cli — `vaultysclaw`

A CLI for the VaultysClaw control plane that demonstrates the "passport, not
password" governance model: give an agent a cryptographic identity, grant it a
narrow signed capability, and watch deny-by-default enforcement produce a
signed, verifiable audit trail.

## Auth model

The CLI authenticates with a VaultysId-based session — **no API keys**.

`login` generates the CLI's own VaultysId, then **links it to your existing user
profile** via an invite-style approval link (like a device-pairing link): the
CLI prints a URL + QR, you open it while signed in to the control plane and
approve, and the CLI's VaultysId becomes a linked identity on your account. The
CLI then signs in and stores the NextAuth session cookie under `~/.vaultysclaw/`.

A user can link **many** VaultysIds (laptop, CI, etc.); each acts **in the
user's name** when it calls the API, and every action is attributed to that user
in the audit trail. Manage/revoke linked identities at `/settings/devices`.

State lives under `~/.vaultysclaw/` (override with `VC_HOME`):

| File | Contents |
|---|---|
| `config.json` | `{ controlPlaneUrl, session }` |
| `identity.json` | the CLI's VaultysId (base64 secret + did + fingerprint) |
| `agents/<name>.id` | base64 secret for each agent created via `agent create` |

`VC_CONTROL_PLANE_URL` (or `--url`) overrides the control-plane URL.

## Usage

```bash
# 0) Link this CLI to your profile — opens an approval URL you confirm in-browser
vaultysclaw login
#  ↳ Open this link while signed in to approve the device: http://…/devices/link/<id>
#  ✓ device linked
#  ✓ logged in

# 1) Give an agent a cryptographic identity (ECDSA keypair via VaultysId)
vaultysclaw agent create --name billing-bot --realm finance
#  ✓ agent "billing-bot" created
#  ↳ VaultysId: vid_3f9a…c21  (ECDSA keypair generated)

# 2) Grant a narrow capability (business-hours window is stored & signed)
vaultysclaw policy grant billing-bot --allow read_database --window "Mon-Fri 09:00-17:00"
#  ✓ policy signed & pushed to billing-bot

# 3) An action outside the grant → denied (deny-by-default) + audited
vaultysclaw intent run billing-bot --action delete_database
#  ✗ DENIED  reason: no capability "delete_database" (deny-by-default)
#  ↳ audit: intent_id=intent-… signed=ECDSA who=billing-bot when=…

# 4) Pull the signed, non-repudiable record
vaultysclaw audit tail --last 1
#  {"action":"delete_database","decision":"DENY","agent":"…","signature":"…","verified":true}
```

Global flags: `--json` (machine-readable output), `--url <url>`.

> **Note** — the `--window` value is parsed, persisted in the policy's
> `resourceLimits.timeWindow`, and signed into the agent certificate. Runtime
> enforcement of the window is out of scope; the deny-by-default decision is
> capability-based.

## Development

```bash
pnpm --filter @vaultysclaw/cli dev -- <args>   # run via tsx
pnpm --filter @vaultysclaw/cli build           # emit dist/
pnpm --filter @vaultysclaw/cli type-check
```

Unit tests live alongside the source (`src/**/*.test.ts`); backend integration
tests live in the repo-root `__tests__/` (`cli-*.test.ts`). Run with
`pnpm vitest run`.

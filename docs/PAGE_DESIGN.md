# VaultysClaw Rebuild — Page & Navigation Design

**Status:** Draft. Concretizes [`REBUILD_ARCHITECTURE.md`](REBUILD_ARCHITECTURE.md) §7 into an
actual page-by-page spec for the two apps that survive the rebuild: the **admin console** and the
**Access Portal**. Assumes [`CERTIFICATE_WEB_OF_TRUST.md`](CERTIFICATE_WEB_OF_TRUST.md) (the
ledger/cert model) and `REBUILD_ARCHITECTURE.md` (the Actor/kind model, Notification Channels)
as given. Follows the existing UI conventions in
[`packages/control-plane/CLAUDE.md`](../packages/control-plane/CLAUDE.md) (`useToolbar`,
`useBreadcrumbs`, semantic Tailwind classes) rather than introducing new ones.

## 0. Two apps, one capability model

Both apps are gated by the capability check from `REBUILD_ARCHITECTURE.md` §4.5 — a route loads
only if the logged-in DID holds a current, non-revoked cert granting the relevant capability.
There is no separate role table to consult; the gate *is* a `cert_status`-style lookup against the
ledger.

| App | Gate | Route prefix |
|---|---|---|
| Admin console | `admin_console_access` (org-wide or workspace-scoped via `CertScope.resource = "workspace:<id>"` — see §6) | `/admin/*` |
| Access Portal | `portal_access` | `/portal/*` |

An admin's cert can carry both capabilities, so the app shell should offer a lightweight switcher
between them rather than forcing a re-login — but they remain visually and structurally distinct
apps (separate nav, separate layout root), not tabs of one thing.

## 1. Admin console

### 1.1 Navigation

Sidebar, top to bottom: **Overview · Actors · Certificates · Audit Log · Workspaces ·
Integrations · Settings**. No `/app/*` vs `/admin/*` split inside this app — it's all admin.

### 1.2 Overview (`/admin`)

Posture dashboard, the "is everything okay" landing page.

- **Toolbar**: title "Overview", no actions — this page is read-only by design.
- **Stat tiles**: actors by kind (count per `openclaw`/`mcp`/`sensor`), active certificates,
  certificates expiring in the next 24h/7d, revocations in the last 7d, pending registrations
  awaiting approval.
- **Recent activity feed**: last ~20 audit log entries (link to full Audit Log).
- **Attention list**: anything needing action now — pending registrations, certs expiring soon
  with no renewal in flight, any `expiresAt: null` cert issued since the bootstrap grant (flagged
  per trust doc §3.3's "loud, not silent" rule) so it's never invisible after the first login.
- **Empty state** (fresh deployment, only the bootstrap admin exists): short "Getting started"
  card — invite your first agent, configure an identity provider, set up a notification channel —
  each linking to the relevant page. No separate onboarding wizard route; this is the wizard.

### 1.3 Actors (`/admin/actors`)

Unified replacement for today's separate Agents/Sensors pages.

```typescript
useToolbar(
  {
    title: "Actors",
    description: `${total} registered · ${online} online`,
    actions: [
      { kind: "badge", id: "live", label: "Live", tone: "success", icon: <Wifi /> },
      {
        kind: "tabs", id: "status", value: statusFilter, onChange: setStatusFilter,
        options: [
          { value: "active", label: "Active" },
          { value: "pending", label: "Pending", }, // badge count of PendingRegistration rows
        ],
      },
      { kind: "button", id: "invite", label: "Invite actor", variant: "primary", icon: <Plus />, onClick: openInviteFlow },
    ],
    search: {
      value: search, onChange: setSearch, placeholder: "Search actors…",
      chips: kindFilter.map((k) => ({ id: `kind-${k}`, label: k, onRemove: () => toggleKind(k) })),
      filterGroups: [
        { id: "kind", label: "Kind", options: KINDS.map((k) => ({ id: k, label: k, active: kindFilter.includes(k), onToggle: () => toggleKind(k) })) },
        { id: "workspace", label: "Workspace", options: workspaceOptions },
      ],
    },
  },
  [total, online, statusFilter, search, kindFilter]
);
```

- **List columns**: Name, Kind (badge, colored per kind), Workspace, Status (online/offline —
  derived from WS/WebRTC connection state, not just `lastSeen`), Active certs (count, links to
  Certificates filtered by this actor), Registered.
- **Pending tab**: `PendingRegistration` rows — approve/deny inline, and for `kind: "openclaw"`/
  `"mcp"` requests, assign the initial capabilities as part of approval (this *is* the first
  `capability_request` → `capability_grant` round-trip from the trust doc, just surfaced as one
  approval action instead of two steps).
- **Row click** → detail page.

### 1.4 Actor detail (`/admin/actors/[did]`)

Breadcrumb: Actors → `{name}`.

- **Header**: name, DID (copyable), kind badge, workspace, online/offline, connection transport
  (WS or WebRTC — trust doc §4.4).
- **Tabs**:
  - **Overview** — registration date, last seen, raw `kindConfig` (rendered by the kind's own
    panel component, not generically — trust doc/rebuild doc §4.3).
  - **Certificates** — every `CapabilityCertificate` row for this DID (active, revoked, expired,
    superseded chains shown linked), "Grant certificate" action opens the issuance flow (§1.5)
    pre-filled with this actor.
  - **Kind panel** — the extension surface from `REBUILD_ARCHITECTURE.md` §4.3:
    - `openclaw`: LLM provider/model config, **chat** (same mechanism the Access Portal launches
      into, §2.2 — this page is just another authenticated entry point to it), token consumption
      chart (daily/monthly, budget vs. actual), knowledge sources (RAG — list, upload, delete).
    - `mcp`: server URL, transport (stdio/SSE), tool allowlist, live tool list as reported by the
      server.
    - `sensor`: workload/process list (today's `/admin/sensors` detail view, unchanged).
  - **Audit** — this actor's slice of the global Audit Log (§1.5 filter, scoped by DID).

### 1.5 Certificates (`/admin/certificates`)

The ledger, front and center — this is the page that makes the trust model legible to a CISO
looking over an admin's shoulder.

- **Toolbar**: title "Certificates", filter chips for Status (`active`/`revoked`/`superseded`/
  `expired`), Scope (`standing`/`scoped`), Kind, Workspace; search by actor name/DID/certId.
  Primary action: **Issue certificate**.
- **List columns**: Actor (name + kind badge), Capabilities (comma list, truncated with
  overflow badge), Scope (`—` for standing, or the `resource`/`resourcePattern` for scoped —
  trust doc §3.6), Status (colored badge; a `revoked` row shows the reason on hover), Issued,
  Expires (`Never` rendered in a distinct warning color, not a neutral one, per the "loud, not
  silent" rule for nullable expiry), Actions (Revoke, if active).
- **Detail drawer per row** (not a separate route — this is a lookup, not a destination):
  - Full decoded payload: capabilities, scope, resource limits.
  - The signature chain: the embedded agent-signed `capability_request` and the control-plane-
    signed `capability_grant` (trust doc §3.2) — both shown as verified/unverified, so the
    co-signature claim from the trust doc is something an admin can actually see, not just trust.
  - Supersession chain — link to the cert this one replaced and/or was replaced by.
  - **Status-check history** — every `cert_status_request` this cert has answered (who asked, when,
    what they were told), from the trust doc §4 protocol. This is the single most demo-able piece
    of the whole design: it's direct evidence the web-of-trust model is actually being exercised,
    not just designed.
- **Issue certificate flow** (modal or dedicated route `/admin/certificates/new`):
  1. Pick actor (existing, or "new pending registration").
  2. Pick capabilities (checkboxes from the `AgentCapability` enum).
  3. Optional scope — resource / resource pattern / max uses / purpose (trust doc §3.6). Leaving
     this empty issues a standing grant.
  4. Expiry — a duration picker defaulting to a short, sensible TTL for scoped grants and a longer
     one for standing grants; selecting "No expiry" requires an explicit confirmation step
     ("this certificate will remain valid until someone revokes it — are you sure?"), never just a
     checkbox ticked in passing.
  5. Submit → control plane counter-signs, ledger row created, pushed live if the actor is
     connected (trust doc §3.2/§3.4).
- **Revoke flow**: reason required (free text → `revokedReason`), confirmation modal stating this
  is a ledger write, not a forced disconnect (trust doc §3.5) — the UI should say plainly "this
  takes effect the next time anyone checks this agent's status, not immediately on an open
  connection" so nobody mistakes it for a kill switch.

### 1.6 Audit Log (`/admin/audit`)

Unified `IntentLog`/`ActivityLog` (merged, per `REBUILD_ARCHITECTURE.md` §7).

- **Toolbar**: filters for event type, actor, workspace, date range; search.
- **List**: timestamp, actor (actor or human, with kind badge), event type, target, a small
  "✓ signed" badge where the entry carries a verifiable signature (today's `IntentLog.signature`)
  — another concrete, visible trust artifact rather than an abstract claim.
- **Row expand**: full details JSON, and for cert-related events (issue/revoke/status-check),
  a direct link into the Certificates detail drawer for that cert.
- Append-only by construction — no edit or delete action exists on this page, full stop.

### 1.7 Workspaces (`/admin/workspaces`, `/admin/workspaces/[id]`)

- **List**: name, actor count, member count (humans with any cert scoped to this workspace),
  budget usage bar.
- **Detail tabs**:
  - **Overview** — name, description, color, default capabilities for new actors here.
  - **Actors** — actors assigned to this workspace (link into §1.4).
  - **Access** — humans holding a workspace-scoped `admin_console_access` or `portal_access` cert
    (`CertScope.resource = "workspace:<id>"`) — this *is* workspace-level admin/member management
    now, expressed as scoped certs rather than a separate `UserWorkspace` role table (§6).
  - **Budgets & Model Access** — token budgets, `WorkspaceRouterKey`, allowed models (unchanged
    from today).

### 1.8 Integrations (`/admin/integrations`, tabbed)

- **Identity** — OIDC/Entra configuration (unchanged from today; binds into a DID per trust doc
  §6.3).
- **API Keys** — list (DID, allowed routes, workspace scope, created, expires), create flow issues
  a scoped `CapabilityCertificate` to a new service DID rather than generating a bearer secret
  (trust doc §6.2).
- **Webhooks** — unchanged from today (signed HMAC delivery to admin-controlled URLs).
- **Notification Channels** — new (`REBUILD_ARCHITECTURE.md` §5): list of channels (name, Apprise
  key, event subscriptions, active toggle); create/edit form (name, description, one Apprise
  service URL per line — `slack://…`, `mailto://…` — stored encrypted, event checkboxes drawn
  from the same catalog Webhooks uses); a **Send test notification** button per channel so an
  admin can confirm delivery without waiting for a real event.
- **Model Registry** — unchanged from today (LLM provider/model config, workspace access).

### 1.9 Settings (`/admin/settings`)

- **Server identity** — the control plane's own DID and public key, displayed plainly ("this is
  the identity that signs every certificate and policy in your organization") — makes the root of
  trust visible rather than an implementation detail buried in `SettingsDAO`.
- **Trust policy** — org-wide defaults for fail-open/closed and staple TTL (trust doc §5); a note
  that workspaces can override these (link to §1.7's per-workspace settings once added there).
- **General** — whatever minimal org-level config remains (naming, branding) — deliberately small.

## 2. Access Portal

A separate, much smaller app — no sidebar, just a top bar with two views.

### 2.1 My Certificates (`/portal`)

- **List**: capability, scope (if any), issued by, issued, expires, status. No actor column —
  it's implicitly "me." No revoke action — a human can't revoke their own grant; they can only see
  it (and, out of band, ask whoever issued it to revoke it — that's an admin-console action).
- **Empty state**: "You haven't been granted any access yet" — nothing to do here but wait, by
  design; this page never invites the user to request access themselves, since that would
  reintroduce a self-service capability-request flow this rebuild deliberately keeps out of scope.

### 2.2 My Agents (`/portal/agents`)

- **Cards**, one per certificate that carries a connect right: agent name, kind badge, granted
  capability, expiry, a **Connect** button.
- **Connect** opens the target kind's own mechanism, gated by presenting that specific cert — for
  `openclaw`, this is the same chat surface as the admin console's Actor detail page (§1.4),
  just reached through a different, capability-scoped door. No portal-side reimplementation of chat
  UI per kind — one component, two entry points.
- **Empty state**: "No agents available to connect to."

## 3. Cross-cutting notes

- **Status badge vocabulary**, used consistently across Actors/Certificates/Audit Log:
  `active` (success/green), `pending` (warning/amber), `revoked` (danger/red), `expired`
  (neutral/gray), `superseded` (neutral/gray, with a link to the replacement).
- **Nullable expiry gets a distinct visual treatment everywhere it appears** (`Never` in
  warning-amber, not the neutral gray used for "no value" elsewhere) — a deliberate choice so the
  bootstrap admin cert, or any other indefinite grant, never blends into the background the way an
  empty/default field would.
- **Workspace-scoped admin rights via `CertScope`** (§1.7 Access tab) means there's no separate
  `UserWorkspace.role` concept to keep in sync with the cert ledger — a human's admin rights for a
  given workspace *are* whatever workspace-scoped certs they hold, checked the same
  `resolvePermission` way as anything else in `packages/trust`.

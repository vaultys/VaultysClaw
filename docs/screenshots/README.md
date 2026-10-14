# Control-plane screenshots

Captured on 2026-10-01 from the isolated fleet-simulator stack (`pnpm simulator:up`, port 3003),
at 1600×1000 with a device-scale factor of 1.5 (2400×1500 PNG). Illustrative data only: simulated
Actors with real VaultysIds, never a customer database.

Two fleet sizes were used, so the numbers on screen differ:

- **Large run** (`pnpm simulator:demo`: 2,000 estate + 5,000 agents, 1,400 people) —
  `overview.png`, `actors-pending.png`, `certificates.png`, `audit.png`.
- **Small run** (20 estate + 100 agents, 20 people, with the `ActorLink` relationships from
  `packages/simulator/src/links.ts`) — everything else, notably `graph.png` (141 actors,
  308 relationships).

`full/` holds whole pages; `crops/` holds the regions used in the presentation decks.

| File | Page |
|---|---|
| `full/login.png` | `/login` |
| `full/overview.png` | `/admin` |
| `full/actors-pending.png` | `/admin/actors` — pending approvals with capability choice |
| `full/actor-detail.png` | `/admin/actors/[did]` |
| `full/actor-relationships.png` | `/admin/actors/[did]?tab=relationships` — ego graph and owner |
| `full/certificates.png` | `/admin/certificates` |
| `full/certificate-detail.png` | `/admin/certificates/[id]` — "Signature verified" |
| `full/graph.png` | `/admin/graph` |
| `full/map.png` | `/admin/map` |
| `full/sensors.png` | `/admin/sensors` |
| `full/audit.png` | `/admin/audit` |
| `full/settings-kill-switch.png` | `/admin/settings` — kill switch, server identity, trust policy |
| `full/integrations-webhooks.png` | `/admin/integrations` (Webhooks tab) |
| `full/integrations-identity.png` | `/admin/integrations?tab=identity` |
| `full/webhooks-docs.png` | `/admin/integrations/webhooks/docs` |
| `full/workspaces.png`, `full/workspace-default.png` | `/admin/workspaces`, `/admin/workspaces/default` |

Not captured: the Access Portal (`/portal`, `/portal/agents`), because the bootstrap admin used here
held `admin_console_access` but not `portal_access`.

/**
 * Kill switches — the emergency, **reversible** counterpart to revocation.
 *
 * Revoking a certificate (`CapabilityCertificateDAO.revoke`) is a one-way ledger
 * write: `status` flips to `"revoked"`, `revokedAt`/`revokedBy`/`revokedReason`
 * are filled in and never cleared, and there is no `unrevoke`. Coming back means
 * re-issuing every certificate, which means a fresh `cert_challenge` handshake
 * per Actor. That is right for a deliberate withdrawal and useless in an
 * incident.
 *
 * A kill switch instead **computes** suspension at the moment a decision is
 * made, from a `KillSwitch` row that is entirely separate from the ledger. So:
 *
 * - No `CapabilityCertificate` row is ever written. The ledger keeps telling the
 *   truth about what was issued, and the audit log carries the arm/disarm story.
 * - Disarming is instant and total — no re-issuance, no new handshake.
 * - `CertificateStatus` stays the closed four-value union it is in
 *   `@vaultysclaw/policy`, so `packages/trust`, `sdk-go/authz` and the shared
 *   `conformance/` vectors are untouched by this feature. A fifth `"suspended"`
 *   state would have rippled through all of them.
 *
 * This module is the *only* place that decides whether something is suspended.
 * Every enforcement point (`lib/ws-server.ts`'s status handler and handshake,
 * `lib/access-control.ts`, the two issuance paths) calls `suppressionFor`.
 */
import type { KillSwitch } from "@prisma/client";
import {
  filterAgainstRegistry,
  type AgentCapability,
  type CertScope,
  type CertificateStatus,
} from "@vaultysclaw/policy";
import { KillSwitchDAO } from "@/db";

/**
 * How long the armed set may be trusted without re-reading — the same shape and
 * the same reasoning as `CustomCapabilityDAO`'s name cache.
 *
 * `handleCertStatusRequest` is the hot path: this package's CLAUDE.md "Scale"
 * section records that a single extra `Setting` read per handshake was enough to
 * collapse a 7,000-Actor ramp, so an uncached query here would reintroduce
 * exactly that. The control plane's HTTP and WebSocket servers share one process
 * (`server.ts`), so an admin arming the switch invalidates this cache in the
 * same process that answers status requests — the TTL only bounds out-of-band
 * changes (a second instance, or a direct database write).
 */
const CACHE_TTL_MS = 5_000;

export interface KillSwitchState {
  /** The org-wide switch, or null if it is not armed. */
  global: KillSwitch | null;
  /** Armed per-workspace switches, keyed by workspace id. */
  byWorkspace: Map<string, KillSwitch>;
}

/** The subset of a certificate row the predicate needs. */
export interface SuppressibleCert {
  workspaceId: string | null;
  scope: CertScope | null;
}

/** The subset of the holding Actor the predicate needs. */
export interface SuppressibleActor {
  kind: string;
  workspaceId: string | null;
}

let cache: { state: KillSwitchState; at: number } | null = null;
let inFlight: Promise<KillSwitchState> | null = null;

function toState(rows: KillSwitch[]): KillSwitchState {
  const byWorkspace = new Map<string, KillSwitch>();
  let global: KillSwitch | null = null;
  for (const row of rows) {
    if (row.scopeType === "global") global = row;
    else if (row.workspaceId) byWorkspace.set(row.workspaceId, row);
  }
  return { global, byWorkspace };
}

export async function getKillSwitchState(): Promise<KillSwitchState> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.state;

  // Collapse concurrent misses into one query, so a fleet reconnecting all at
  // once after a disarm doesn't issue one identical query per Actor.
  if (!inFlight) {
    inFlight = KillSwitchDAO.list()
      .then((rows) => {
        const state = toState(rows);
        cache = { state, at: Date.now() };
        return state;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/**
 * Drop the cached armed set. Called by every arm/disarm action.
 *
 * Arming that waited out the TTL would keep authorizing for seconds after an
 * admin was told the switch was on; disarming that waited would keep refusing
 * reconnections after they were told it was off. Neither is acceptable, hence
 * the explicit invalidation rather than relying on the TTL alone.
 */
export function invalidateKillSwitchCache(): void {
  cache = null;
}

/**
 * The switch suspending this certificate, or null if nothing does.
 *
 * Returning the row rather than a boolean is deliberate: callers report the
 * reason back to the holder or the admin, and re-reading it would race with a
 * disarm.
 */
export function suppressionFor(
  cert: SuppressibleCert,
  actor: SuppressibleActor,
  state: KillSwitchState
): KillSwitch | null {
  // Humans are never suspended. `admin_console_access` is itself a capability
  // carried by a certificate (`lib/capabilities.ts`), so without this exemption
  // arming the global switch would lock every admin out of the console — and
  // the console is the only way to disarm it. `portal_access` is exempted along
  // with it rather than carving out one capability name, so a human's access
  // does not silently half-work during an incident.
  if (actor.kind === "human") return null;

  if (state.global) return state.global;
  if (state.byWorkspace.size === 0) return null;

  // A certificate belongs to a workspace three ways. The first two are exactly
  // what `WorkspaceDAO.listActiveScopedCertificates` matches on when a workspace
  // is deleted; the third is a deliberate widening. A kill switch must
  // over-include — an Actor filed under the workspace whose certificate carries
  // no workspace of its own still has to fall — where a deletion must
  // under-include, since it revokes irreversibly.
  const candidates = [
    cert.workspaceId,
    actor.workspaceId,
    typeof cert.scope?.resource === "string" && cert.scope.resource.startsWith("workspace:")
      ? cert.scope.resource.slice("workspace:".length)
      : null,
  ];
  for (const id of candidates) {
    if (!id) continue;
    const row = state.byWorkspace.get(id);
    if (row) return row;
  }
  return null;
}

/** Whether an Actor is suspended irrespective of any one certificate — the
 *  handshake and issuance gates, which act before a certificate is in hand. */
export function suppressionForActor(
  actor: SuppressibleActor,
  state: KillSwitchState
): KillSwitch | null {
  return suppressionFor({ workspaceId: null, scope: null }, actor, state);
}

/** The reason string shown to a refused client. Kept in one place so the
 *  handshake refusal and the `kill_switch` push cannot drift. */
export function killSwitchReason(row: KillSwitch): string {
  const scope = row.scopeType === "global" ? "org-wide" : `workspace ${row.workspaceId}`;
  return `Kill switch armed (${scope}): ${row.reason}`;
}

/** What a `cert_status_response` will actually say — the row's own fields after
 *  expiry, kill-switch suspension and registry filtering are applied. */
export interface EffectiveCertStatus {
  status: CertificateStatus;
  capabilities: AgentCapability[];
}

/**
 * Everything that stands between a stored certificate row and the status the
 * control plane signs for its holder.
 *
 * Pure and separated from `lib/ws-server.ts`'s handler so the invariant it
 * encodes is directly testable: **a suspended certificate is reported `revoked`
 * while its row still says `active`**. That gap is the whole design, and a
 * regression in it would silently re-authorize a fleet an admin believes is cut
 * off.
 *
 * The three adjustments, in order, are not interchangeable:
 *
 * 1. **Expiry** overlays the row, because nothing sweeps `expiresAt` into
 *    `status` — an "active" row past its expiry is normal and must read as
 *    `expired`.
 * 2. **Kill switch** reports `revoked` for a row the ledger still calls active.
 *    This is the opposite of rule 3's principle, deliberately: `revoked` is the
 *    only value in the closed `CertificateStatus` union that makes a holder stop
 *    (`resolvePermission`'s `isUsable` and the SDK's `activeCerts()` both reject
 *    anything that is not `active`), and nothing has been written to the ledger
 *    — the row stays honest about what was issued, so the audit trail does not
 *    lie, only the live authorization answer changes. A fifth `"suspended"`
 *    state would have rippled through policy, trust, the SDK, sdk-go and the
 *    shared conformance vectors, to be treated by every one of them exactly as
 *    this one is.
 * 3. **Registry filtering** drops custom capabilities an admin has deleted
 *    (docs/CUSTOM_CAPABILITIES.md), and here the row's real `status` *is* kept:
 *    a certificate whose capabilities are all filtered away is honestly "active
 *    with nothing on it". Collapsing that to `revoked` would misreport the
 *    ledger to express an authorization outcome.
 */
export function resolveCertStatus(
  cert: SuppressibleCert & {
    status: string;
    capabilities: string[];
    expiresAt: number | null;
  },
  actor: SuppressibleActor,
  state: KillSwitchState,
  registryNames: Set<string>,
  now: number
): EffectiveCertStatus {
  let status = cert.status as CertificateStatus;
  if (status === "active" && cert.expiresAt !== null && cert.expiresAt <= now) {
    status = "expired";
  }

  if (suppressionFor(cert, actor, state)) {
    // Nothing is granted while suspended, so there is nothing left to filter.
    return { status: "revoked", capabilities: [] };
  }

  return { status, capabilities: filterAgainstRegistry(cert.capabilities, registryNames) };
}

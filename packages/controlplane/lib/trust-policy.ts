/**
 * Trust policy resolution — org-wide defaults, overridden per workspace.
 *
 * Two knobs (docs/CERTIFICATE_WEB_OF_TRUST.md §5): what a verifier does when it
 * cannot reach the control plane (`failMode`), and how stale a signed status
 * response may be before it stops counting (`stapleTtlSeconds`). Both live as
 * org-wide `Setting` rows, and either can be overridden on a `Workspace`.
 *
 * This module is the *only* place that decides an effective policy, the same way
 * `lib/kill-switch.ts` is the only place that decides suspension. Everything that
 * needs one — today `lib/actor-config.ts`, building the `trust` block of
 * `actor_config` — calls `resolveTrustPolicy`.
 *
 * **The override direction is the opposite of the kill switch's, deliberately.**
 * There, an armed global switch short-circuits and the workspace is never
 * consulted: it is an emergency brake, so the most restrictive scope wins. Here
 * the most *specific* scope wins, because this is configuration — a workspace
 * that says `open` means it, and an admin who set it there would be very
 * surprised to find the org value still in force. Do not "harmonise" the two.
 *
 * Inheritance is per field. A workspace can pin `failMode` and keep inheriting
 * the staple TTL, which is why the two columns are separately nullable rather
 * than one JSON blob or one all-or-nothing flag. `null` is the only spelling of
 * "inherit": a stored `0` is a real staple TTL (the strictest one — force a live
 * query every time), so an empty-string or 0 sentinel would silently turn the
 * strictest setting into the inherited one.
 */
import { SettingsDAO, WorkspaceDAO } from "@/db";
import {
  DEFAULT_STAPLE_TTL_SECONDS,
  DEFAULT_TRUST_FAIL_MODE,
  SETTINGS_KEYS,
} from "./org-settings";

export type TrustFailMode = "open" | "closed";

/** Where an effective value came from. Displayed by the admin UI; nothing decides on it. */
export type TrustPolicySource = "workspace" | "org";

export interface EffectiveTrustPolicy {
  /** `failMode` translated for the wire: `closed` → true (protocol.ts's `trust.failClosed`). */
  failClosed: boolean;
  /** 0 = force a live query every time; negative = unbounded (only reachable per-Actor). */
  stapleTtlSeconds: number;
  source: { failMode: TrustPolicySource; stapleTtl: TrustPolicySource };
}

/** The org-wide defaults, already parsed. */
export interface OrgTrustDefaults {
  failMode: TrustFailMode;
  stapleTtlSeconds: number;
}

/** A workspace's raw override columns — `null` on either field means "inherit". */
export interface WorkspaceTrustOverride {
  certFailMode: string | null;
  certStapleTtlSeconds: number | null;
}

export interface TrustPolicyState {
  org: OrgTrustDefaults;
  /** Workspaces carrying at least one override, keyed by workspace id. */
  byWorkspace: Map<string, WorkspaceTrustOverride>;
}

/**
 * How long the resolved state may be trusted without re-reading.
 *
 * Same value and same reasoning as `lib/kill-switch.ts`: `buildActorConfig` runs
 * on the connection path (`ws-server.ts` pushes on connect and on approval), and
 * this package's CLAUDE.md "Scale" section records that a single extra `Setting`
 * read per handshake was enough to collapse a 7,000-Actor ramp. Adding a
 * per-workspace lookup there uncached would reintroduce exactly that — so the
 * whole state (two settings plus every workspace override) is fetched in one go
 * and cached, which makes the hot path cheaper than it was before this feature.
 *
 * The TTL only bounds out-of-band changes: the HTTP and WebSocket servers share
 * one process (`server.ts`), so a Server Action's `invalidateTrustPolicyCache()`
 * reaches the socket side immediately.
 */
const CACHE_TTL_MS = 5_000;

let cache: { state: TrustPolicyState; at: number } | null = null;
let inFlight: Promise<TrustPolicyState> | null = null;

/** Drop the cached state. Called by every action that writes a trust setting. */
export function invalidateTrustPolicyCache(): void {
  cache = null;
}

function parseFailMode(raw: string | null | undefined): TrustFailMode {
  // Anything unrecognised resolves to the safe direction, matching the original
  // `failMode !== "open"` test this replaces: a typo in the database must not be
  // able to turn enforcement off.
  return raw === "open" ? "open" : "closed";
}

function parseStapleTtl(raw: string | null | undefined): number {
  const parsed = raw === null || raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_STAPLE_TTL_SECONDS;
}

async function loadState(): Promise<TrustPolicyState> {
  const [failModeRaw, stapleTtlRaw, workspaces] = await Promise.all([
    SettingsDAO.get(SETTINGS_KEYS.trustFailMode),
    SettingsDAO.get(SETTINGS_KEYS.trustStapleTtlSeconds),
    // Only the rows that actually override something — a deployment with many
    // workspaces and few overrides keeps this small, and a workspace absent from
    // the map is indistinguishable from one whose columns are both null.
    WorkspaceDAO.listTrustOverrides(),
  ]);

  const byWorkspace = new Map<string, WorkspaceTrustOverride>();
  for (const ws of workspaces) {
    byWorkspace.set(ws.id, {
      certFailMode: ws.certFailMode,
      certStapleTtlSeconds: ws.certStapleTtlSeconds,
    });
  }

  return {
    org: {
      failMode: parseFailMode(failModeRaw ?? DEFAULT_TRUST_FAIL_MODE),
      stapleTtlSeconds: parseStapleTtl(stapleTtlRaw),
    },
    byWorkspace,
  };
}

export async function getTrustPolicyState(): Promise<TrustPolicyState> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.state;

  // Collapse concurrent misses into one query, so a fleet reconnecting all at
  // once doesn't issue one identical pair of queries per Actor.
  if (!inFlight) {
    inFlight = loadState()
      .then((state) => {
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
 * Compose an effective policy from the org defaults and one workspace's overrides.
 *
 * Pure — no I/O, no clock — so the inheritance rules are testable on their own
 * (`__tests__/trust-policy.test.ts`), exactly like `resolveCertStatus` is for the
 * kill switch.
 *
 * `override` is null both for an Actor that belongs to no workspace and for a
 * workspace that overrides nothing; the two are the same case and produce the
 * org values.
 */
export function composeTrustPolicy(
  org: OrgTrustDefaults,
  override: WorkspaceTrustOverride | null
): EffectiveTrustPolicy {
  // Compared against null/undefined rather than tested for truthiness:
  // `certStapleTtlSeconds: 0` is an override, and the strictest one there is.
  const failModeOverride = override?.certFailMode ?? null;
  const stapleTtlOverride = override?.certStapleTtlSeconds ?? null;

  const failMode = failModeOverride === null ? org.failMode : parseFailMode(failModeOverride);

  return {
    failClosed: failMode !== "open",
    stapleTtlSeconds: stapleTtlOverride === null ? org.stapleTtlSeconds : stapleTtlOverride,
    source: {
      failMode: failModeOverride === null ? "org" : "workspace",
      stapleTtl: stapleTtlOverride === null ? "org" : "workspace",
    },
  };
}

/**
 * The effective trust policy for an Actor (or a page) in this workspace.
 *
 * `null` — an Actor assigned to no workspace, which is the default state since
 * nothing auto-assigns one — resolves to the org values. That short-circuit is
 * explicit here rather than left to a map miss so the "no workspace" case reads
 * as a decision, the same way `SrtTemplateDAO.forWorkspace` handles it.
 */
export async function resolveTrustPolicy(
  workspaceId: string | null
): Promise<EffectiveTrustPolicy> {
  const state = await getTrustPolicyState();
  if (!workspaceId) return composeTrustPolicy(state.org, null);
  return composeTrustPolicy(state.org, state.byWorkspace.get(workspaceId) ?? null);
}

/** The org-wide defaults on their own — what a workspace form shows as "inherited". */
export async function getOrgTrustDefaults(): Promise<OrgTrustDefaults> {
  return (await getTrustPolicyState()).org;
}

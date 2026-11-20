/**
 * Validation for `hook_audit` events (docs/HARNESS_HOOKS.md) — what a
 * vaultysclaw-hooks agent reports its hooks decided.
 *
 * Pure, so it is what the tests exercise. Everything here is a claim made by
 * software running as the governed user on the governed machine: it is a
 * record to show an admin, never an input to an authorization decision, and it
 * is shaped defensively — unknown fields dropped, strings clipped, a batch
 * capped — so a misbehaving host cannot use it to bloat the database.
 */

/** At most this many events are accepted from one message; the rest are dropped. */
export const MAX_HOOK_AUDIT_BATCH = 500;

const MAX_SHORT = 128;
const MAX_LONG = 2048;

/** Event kinds vaultysclaw-hooks emits (`internal/adapter.Kind`). */
const KINDS = new Set(["pre_tool", "post_tool", "prompt", "session_start", "session_end", "stop", "other"]);

export interface HookAuditInput {
  /** Client-generated, unique per record; with the Actor's DID it makes delivery idempotent. */
  eventId: string;
  occurredAt: Date;
  vendor: string;
  event: string;
  kind: string;
  mode: string;
  session: string | null;
  cwd: string | null;
  tool: string | null;
  capability: string | null;
  resource: string | null;
  decided: boolean;
  blocked: boolean;
  wouldDeny: boolean;
  unmapped: boolean;
  floorRefused: boolean;
  ruleId: string | null;
  certId: string | null;
  reason: string | null;
  error: string | null;
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "") return null;
  return t.length > max ? t.slice(0, max) : t;
}

const bool = (v: unknown): boolean => v === true;

/**
 * Parse one event. Returns null for anything that is not recognisably a
 * vaultysclaw-hooks record — no id, no parseable time, no known kind.
 *
 * A timestamp from the far future is clamped to `now`: the host's clock is its
 * own claim, and a record dated next year would sit at the top of every
 * "recent decisions" list indefinitely.
 */
export function parseHookAuditEvent(raw: unknown, now: Date = new Date()): HookAuditInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const eventId = str(r.id, 64);
  if (!eventId || !/^[A-Za-z0-9_-]+$/.test(eventId)) return null;

  const kind = str(r.kind, MAX_SHORT);
  if (!kind || !KINDS.has(kind)) return null;

  const time = typeof r.time === "string" ? new Date(r.time) : null;
  if (!time || Number.isNaN(time.getTime())) return null;
  const occurredAt = time.getTime() > now.getTime() ? now : time;

  const mode = str(r.mode, MAX_SHORT);

  return {
    eventId,
    occurredAt,
    vendor: str(r.vendor, MAX_SHORT) ?? "unknown",
    event: str(r.event, MAX_SHORT) ?? kind,
    kind,
    mode: mode === "enforce" || mode === "observe" ? mode : "unknown",
    session: str(r.session, MAX_SHORT),
    cwd: str(r.cwd, MAX_LONG),
    tool: str(r.tool, MAX_SHORT),
    capability: str(r.capability, MAX_SHORT),
    resource: str(r.resource, MAX_LONG),
    decided: bool(r.decided),
    blocked: bool(r.blocked),
    wouldDeny: bool(r.wouldDeny),
    unmapped: bool(r.unmapped),
    floorRefused: bool(r.floorRefused),
    ruleId: str(r.ruleId, MAX_SHORT),
    certId: str(r.certId, MAX_SHORT),
    reason: str(r.reason, MAX_LONG),
    error: str(r.error, MAX_LONG),
  };
}

/** Parse a batch, dropping invalid events and anything past the cap. */
export function parseHookAuditBatch(
  events: unknown,
  now: Date = new Date()
): { accepted: HookAuditInput[]; rejected: number; truncated: number } {
  if (!Array.isArray(events)) return { accepted: [], rejected: 0, truncated: 0 };
  const truncated = Math.max(0, events.length - MAX_HOOK_AUDIT_BATCH);
  const accepted: HookAuditInput[] = [];
  let rejected = 0;
  for (const raw of events.slice(0, MAX_HOOK_AUDIT_BATCH)) {
    const parsed = parseHookAuditEvent(raw, now);
    if (parsed) accepted.push(parsed);
    else rejected++;
  }
  return { accepted, rejected, truncated };
}

// ─── Coverage (`hook_coverage`) ─────────────────────────────────────────────

/** Coverage levels, best to worst — vaultysclaw-hooks' `coverage.Level`. */
export const COVERAGE_LEVELS = ["enforcing", "partial", "observe", "ungoverned"] as const;
export type CoverageLevel = (typeof COVERAGE_LEVELS)[number];

const MAX_VENDORS = 32;
const MAX_REASONS = 16;

export interface HookCoverageVendor {
  vendor: string;
  level: CoverageLevel;
  found: boolean;
  reasons: string[];
}

export interface HookCoverageInput {
  mode: "enforce" | "observe" | "unknown";
  scope: "machine" | "user" | "unknown";
  tamperResistant: boolean;
  vendors: HookCoverageVendor[];
}

/**
 * Parse a coverage report. Null when it is not recognisably one.
 *
 * An unknown level is not dropped but read as `ungoverned`: a newer agent
 * reporting a level this console does not know must not be displayed as
 * anything better than the worst it could mean. `tamperResistant` is true only
 * when literally true *and* the scope is machine — the claim is meaningless at
 * user scope.
 */
export function parseHookCoverage(raw: unknown): HookCoverageInput | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.vendors)) return null;

  const mode = r.mode === "enforce" || r.mode === "observe" ? r.mode : "unknown";
  const scope = r.scope === "machine" || r.scope === "user" ? r.scope : "unknown";
  const vendors: HookCoverageVendor[] = [];
  for (const v of r.vendors.slice(0, MAX_VENDORS)) {
    if (!v || typeof v !== "object" || Array.isArray(v)) continue;
    const o = v as Record<string, unknown>;
    const vendor = str(o.vendor, MAX_SHORT);
    if (!vendor) continue;
    const level = (COVERAGE_LEVELS as readonly string[]).includes(o.level as string)
      ? (o.level as CoverageLevel)
      : "ungoverned";
    const reasons = Array.isArray(o.reasons)
      ? o.reasons
          .slice(0, MAX_REASONS)
          .map((x) => str(x, 512))
          .filter((x): x is string => x !== null)
      : [];
    if (level === "ungoverned" && o.level !== "ungoverned") {
      reasons.unshift(`unrecognised coverage level reported: ${String(o.level).slice(0, 32)}`);
    }
    vendors.push({ vendor, level, found: bool(o.found), reasons });
  }
  return { mode, scope, tamperResistant: scope === "machine" && bool(r.tamperResistant), vendors };
}

/**
 * At most this many `harness.tool_denied` events are raised per audit batch;
 * the rest are counted in the last event's `moreInBatch`. An agent retrying a
 * refused call in a loop must not turn into a webhook flood.
 */
export const MAX_DENIAL_EVENTS_PER_BATCH = 20;

const RANK: Record<CoverageLevel, number> = { enforcing: 3, partial: 2, observe: 1, ungoverned: 0 };

export interface CoverageDegradation {
  vendor: string;
  /** Null when the harness was not in the previous report (or there was none). */
  from: CoverageLevel | null;
  to: CoverageLevel;
  reasons: string[];
}

/**
 * What got worse between two coverage reports.
 *
 * - A harness at a lower level than before is a degradation.
 * - A harness that appears *ungoverned* without a previous level is one too —
 *   including on a host's very first report: "Cursor is on this laptop and
 *   nothing governs it" is exactly the news, not a baseline to stay quiet on.
 * - A harness that disappears from the report is not: it was uninstalled from
 *   the host, which removes what there was to govern.
 * - Host-wide: enforce → observe, and machine → user scope.
 */
export function coverageDegradations(
  before: HookCoverageInput | null,
  after: HookCoverageInput
): { vendors: CoverageDegradation[]; host: string[] } {
  const prev = new Map((before?.vendors ?? []).map((v) => [v.vendor, v.level]));
  const vendors: CoverageDegradation[] = [];
  for (const v of after.vendors) {
    const from = prev.get(v.vendor) ?? null;
    const worse = from === null ? v.level === "ungoverned" : RANK[v.level] < RANK[from];
    if (worse) vendors.push({ vendor: v.vendor, from, to: v.level, reasons: v.reasons });
  }
  const host: string[] = [];
  if (before?.mode === "enforce" && after.mode !== "enforce") host.push(`mode changed from enforce to ${after.mode}`);
  if (before?.tamperResistant && !after.tamperResistant) {
    host.push("hooks are no longer installed at machine scope; the governed user can remove them");
  }
  return { vendors, host };
}

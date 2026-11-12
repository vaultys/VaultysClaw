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

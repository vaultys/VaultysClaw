/**
 * Explicit, sanitized payload builders for webhook events — mirrors
 * packages/control-plane/lib/webhook-payloads.ts's approach, rebuilt for this
 * package's actual domain (Actor/CapabilityCertificate/Workspace instead of
 * Agent/Model/Knowledge/Skill/Workflow).
 *
 * Every builder lists only the fields safe to send to an external endpoint —
 * never a certificate's raw bytes, a kind's `kindConfig` blob, or an Actor's
 * location. `stripSensitive` is a recursive defence-in-depth pass applied by
 * `enqueueWebhook` on top of these, never the primary protection.
 */
import { encodeDidParam } from "./actor-route";

/**
 * Who actually did this — attached at each emission site (call sites know their own admin
 * session; the payload builders below don't), not derived here. Absent for events with no human
 * origin (e.g. an agent's own `actor.registration_requested`).
 */
export interface PerformedBy {
  did: string;
  name: string;
}

/**
 * An absolute deep link back into this admin console, for a human reading a rendered Notification
 * Channel message (packages/webhook-dispatcher/src/render.ts appends it to the body) — and,
 * incidentally, also included on the raw Webhook payload, where an external system integration
 * may find it just as useful. `null` when neither `APP_URL` nor `NEXTAUTH_URL` is configured,
 * rather than emitting a link that can't actually resolve to anything.
 */
export function buildAdminUrl(path: string): string | null {
  const base = process.env.APP_URL || process.env.NEXTAUTH_URL;
  if (!base) return null;
  return `${base.replace(/\/+$/, "")}${path}`;
}

/** `/admin/actors/<did>` only resolves once the Actor row actually exists (i.e. after approval) —
 *  call sites for events where it doesn't yet (registration_requested, denied) should link to the
 *  Actors list instead. */
export function actorAdminUrl(did: string): string | null {
  return buildAdminUrl(`/admin/actors/${encodeDidParam(did)}`);
}

export interface FieldChange {
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * What actually changed on an update — attached as `changes: FieldChange[]` alongside
 * `performedBy`/`adminUrl` at the emission site, which is the only place that has both the
 * before and after row (payload builders above only ever see one snapshot). Only meaningful for
 * *.updated events; a *.created/*.approved event has no "before" to diff against, and
 * certificate.revoked already carries its own `revokedReason` instead. Dates compare by value
 * (`toISOString()`), not object identity, so an unrelated `updatedAt` bump alone isn't reported
 * as every field having "changed."
 */
export function diffFields(before: AnyRecord, after: AnyRecord, fields: string[]): FieldChange[] {
  const normalize = (v: unknown) => (v instanceof Date ? v.toISOString() : (v ?? null));
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
  }
  return changes;
}

const SENSITIVE_KEY =
  /secret|password|passwd|apikey|api_key|keyhash|token|privatekey|private_key|credential|virtualkey|enc$/i;

/** Recursively remove keys whose name looks sensitive. */
export function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitive);
  // A Date has no enumerable own properties — recursing into it like a plain
  // object below would silently collapse it to `{}`. Passed through
  // unchanged, JSON.stringify still serializes it correctly via Date's own
  // toJSON (an ISO string), which is what every payload builder here expects.
  if (value instanceof Date) return value;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(k)) continue;
      out[k] = stripSensitive(v);
    }
    return out;
  }
  return value;
}

type AnyRecord = Record<string, unknown>;

export function actorPayload(a: AnyRecord): AnyRecord {
  return {
    did: a.did,
    name: a.name,
    kind: a.kind,
    workspaceId: a.workspaceId ?? null,
    ownerDid: a.ownerDid ?? null,
    registeredAt: a.registeredAt ?? null,
    lastSeen: a.lastSeen ?? null,
  };
}

export function certificatePayload(c: AnyRecord): AnyRecord {
  return {
    id: c.id,
    agentDid: c.agentDid,
    workspaceId: c.workspaceId ?? null,
    capabilities: c.capabilities ?? [],
    certFormat: c.certFormat,
    status: c.status,
    issuedBy: c.issuedBy ?? null,
    issuedAt: c.issuedAt ?? null,
    expiresAt: c.expiresAt ?? null,
    revokedAt: c.revokedAt ?? null,
    revokedBy: c.revokedBy ?? null,
    revokedReason: c.revokedReason ?? null,
  };
}

export function workspacePayload(ws: AnyRecord): AnyRecord {
  return {
    id: ws.id,
    name: ws.name,
    slug: ws.slug,
    description: ws.description ?? null,
    color: ws.color ?? null,
    isDefault: ws.isDefault ?? false,
    createdAt: ws.createdAt ?? null,
  };
}

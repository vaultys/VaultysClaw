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
export function diffFields(
  before: AnyRecord,
  after: AnyRecord,
  fields: string[]
): FieldChange[] {
  const normalize = (v: unknown) =>
    v instanceof Date ? v.toISOString() : (v ?? null);
  const changes: FieldChange[] = [];
  for (const field of fields) {
    const from = normalize(before[field]);
    const to = normalize(after[field]);
    if (JSON.stringify(from) !== JSON.stringify(to))
      changes.push({ field, from, to });
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

export function modelAdminUrl(id: string): string | null {
  return buildAdminUrl(`/admin/integrations/models/${id}`);
}

/**
 * A Model Registry entry (`model.*` events). `apiKeyEnc` is never included —
 * it isn't even selected by the read path these call sites use
 * (`db/model.dao.ts`'s `SafeModel`), and `stripSensitive` would drop it anyway
 * on both its `apikey` and `enc$` rules.
 *
 * `hasProviderKey` is deliberately named around `stripSensitive` rather than the
 * DAO's own `hasApiKey`: that recursive pass matches the substring `apikey`
 * case-insensitively, so a field called `hasApiKey` — a boolean carrying no
 * secret at all — would be silently deleted from the delivered payload. Renaming
 * it here is cheaper and more visible than adding an exception to the blacklist.
 */
export function modelPayload(m: AnyRecord): AnyRecord {
  const access = Array.isArray(m.workspaceAccess) ? (m.workspaceAccess as AnyRecord[]) : [];
  return {
    id: m.id,
    name: m.name,
    description: m.description ?? null,
    provider: m.provider,
    modelId: m.modelId,
    baseUrl: m.baseUrl,
    litellmModelName: m.litellmModelName ?? null,
    isActive: m.isActive ?? true,
    hasProviderKey: !!m.hasApiKey,
    workspaceIds: access.map((a) => a.workspaceId).filter(Boolean),
    createdBy: m.createdBy ?? null,
    createdAt: m.createdAt ?? null,
  };
}

/** Deep link to a custom capability's detail page. */
export function capabilityAdminUrl(id: string): string | null {
  return buildAdminUrl(`/admin/integrations/capabilities/${id}`);
}

/**
 * A custom-capability registry entry (docs/CUSTOM_CAPABILITIES.md).
 *
 * Everything here is already public within the org — a capability name and its label are what an
 * admin picks from a list — so there is no secret to omit. It stays an explicit allow-list anyway,
 * for the same reason the others do: a field added to the model shouldn't start being delivered to
 * external endpoints just because it exists.
 */
export function customCapabilityPayload(c: AnyRecord): AnyRecord {
  return {
    id: c.id,
    name: c.name,
    vendor: c.vendor,
    action: c.action,
    label: c.label,
    description: c.description ?? null,
    group: c.group ?? null,
    createdBy: c.createdBy ?? null,
    createdAt: c.createdAt ?? null,
  };
}

/**
 * A `kind: "proxy"` Actor's enforcement configuration, for
 * `proxy.config_updated` (docs/PROXY_ARCHITECTURE.md §12).
 *
 * Unlike {@link actorPayload}, this one *does* include `kindConfig` content —
 * a deliberate exception, not an oversight. `actorPayload` excludes it because a
 * kind's config is arbitrary and not guaranteed safe to publish; here the shape
 * is known (`lib/proxy-kind.ts`), contains only hostnames, ports, and effects,
 * and is the entire point of the event. A rule change with the rules withheld
 * would be an audit entry that records nothing useful.
 *
 * `ruleChanges` is a rule-level diff rather than a before/after blob, because
 * "which rule was added or removed" is the question an auditor actually asks,
 * and a whole-config diff of a thirty-rule set answers it very badly.
 */
/** The rule fields this builder reads. Structural rather than an import of
 *  `lib/proxy-rules.ts`'s `ProxyRule`, keeping this module free of a dependency
 *  on a single kind's types — the same reason it takes `AnyRecord` elsewhere. */
interface RuleLike {
  id: unknown;
  effect?: unknown;
  subject?: unknown;
  workloadId?: unknown;
  hosts?: unknown;
  ports?: unknown;
}

/**
 * The harness twin of {@link proxyConfigPayload}.
 *
 * Separate rather than shared: the two kinds summarise different rules (hosts
 * and ports vs. resource URIs) and carry different settings, and a builder
 * branching on kind would end up emitting half-null objects for whichever kind
 * it was not. Allow-list only, as everywhere in this file — a resource pattern
 * is authored policy and safe to send; nothing else from the config is.
 */
export function harnessConfigPayload(
  actor: AnyRecord,
  before: { resourceRules?: readonly ResourceRuleLike[] } | null,
  after: {
    mode?: unknown;
    sandbox?: unknown;
    maxStatusAgeSeconds?: unknown;
    resourceRules?: readonly ResourceRuleLike[];
  }
): AnyRecord {
  const beforeRules = before?.resourceRules ?? [];
  const afterRules = after.resourceRules ?? [];
  const beforeIds = new Set(beforeRules.map((r) => String(r.id)));
  const afterIds = new Set(afterRules.map((r) => String(r.id)));

  const summarise = (r: ResourceRuleLike) =>
    `${r.effect} ${r.subject} ${Array.isArray(r.resources) ? r.resources.join(",") : ""}`;

  return {
    did: actor.did,
    name: actor.name,
    kind: actor.kind,
    mode: after.mode ?? null,
    sandbox: after.sandbox ?? null,
    maxStatusAgeSeconds: after.maxStatusAgeSeconds ?? null,
    resourceRuleCount: afterRules.length,
    resourceRules: afterRules.map((r) => ({ id: r.id, summary: summarise(r) })),
    ruleChanges: {
      added: afterRules.filter((r) => !beforeIds.has(String(r.id))).map((r) => ({ id: r.id, summary: summarise(r) })),
      removed: beforeRules.filter((r) => !afterIds.has(String(r.id))).map((r) => ({ id: r.id, summary: summarise(r) })),
    },
  };
}

interface ResourceRuleLike {
  id: unknown;
  subject: unknown;
  effect: unknown;
  resources?: unknown;
}

/**
 * What an Actor deletion destroyed.
 *
 * The revoked certificate ids matter more here than anywhere else: those rows
 * cascade away with the Actor, so after this event nothing in the database
 * records that they existed. The audit entry this payload lands in is the only
 * remaining answer to "what did that Actor hold".
 */
export function actorDeletedPayload(
  actor: AnyRecord,
  revokedCertIds: readonly string[]
): AnyRecord {
  return {
    did: actor.did,
    name: actor.name,
    kind: actor.kind,
    workspaceId: actor.workspaceId ?? null,
    revokedCertificateCount: revokedCertIds.length,
    revokedCertificateIds: [...revokedCertIds],
  };
}

export function proxyConfigPayload(
  actor: AnyRecord,
  before: { rules?: readonly RuleLike[] } | null,
  after: {
    mode?: unknown;
    maxStatusAgeSeconds?: unknown;
    rules?: readonly RuleLike[];
  }
): AnyRecord {
  const beforeRules = before?.rules ?? [];
  const afterRules = after.rules ?? [];
  const beforeIds = new Set(beforeRules.map((r) => String(r.id)));
  const afterIds = new Set(afterRules.map((r) => String(r.id)));

  const summarise = (r: RuleLike) =>
    `${r.effect} ${r.subject}${r.workloadId ? `:${r.workloadId}` : ""} ${
      Array.isArray(r.hosts) ? r.hosts.join(",") : ""
    }${Array.isArray(r.ports) && r.ports.length > 0 ? `:${r.ports.join(",")}` : ""}`;

  return {
    did: actor.did,
    name: actor.name,
    kind: actor.kind,
    mode: after.mode ?? null,
    maxStatusAgeSeconds: after.maxStatusAgeSeconds ?? null,
    ruleCount: afterRules.length,
    rules: afterRules.map((r) => ({ id: r.id, summary: summarise(r) })),
    ruleChanges: {
      added: afterRules
        .filter((r) => !beforeIds.has(String(r.id)))
        .map((r) => ({ id: r.id, summary: summarise(r) })),
      removed: beforeRules
        .filter((r) => !afterIds.has(String(r.id)))
        .map((r) => ({ id: r.id, summary: summarise(r) })),
    },
  };
}

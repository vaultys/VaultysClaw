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

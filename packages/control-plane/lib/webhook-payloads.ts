/**
 * Explicit, sanitized payload builders for webhook events.
 *
 * Every builder lists only the fields that are safe to send to an external
 * endpoint. Secret material (signing secrets, encrypted API keys, LiteLLM
 * virtual keys, private keys, tokens, arbitrary `config`/`metadata` blobs that
 * may embed credentials) is deliberately NOT included. `stripSensitive` is a
 * recursive defence-in-depth pass applied by `enqueueWebhook` on top of these.
 */

const SENSITIVE_KEY = /secret|password|passwd|apikey|api_key|keyhash|token|privatekey|private_key|credential|virtualkey|enc$/i;

/**
 * Recursively remove keys whose name looks sensitive. Defence-in-depth on top
 * of the explicit builders below — never the primary protection.
 */
export function stripSensitive(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSensitive);
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

export function agentPayload(a: AnyRecord): AnyRecord {
  return {
    did: a.did,
    name: a.name,
    capabilities: a.capabilities ?? [],
    status: a.status ?? null,
    registeredAt: a.registeredAt ?? null,
    lastSeen: a.lastSeen ?? null,
  };
}

export function modelPayload(m: AnyRecord): AnyRecord {
  return {
    id: m.id,
    name: m.name,
    description: m.description ?? null,
    provider: m.provider,
    modelId: m.modelId,
    baseUrl: m.baseUrl,
    status: m.status ?? null,
    createdAt: m.createdAt ?? null,
    updatedAt: m.updatedAt ?? null,
  };
}

export function userPayload(u: AnyRecord): AnyRecord {
  return {
    id: u.id,
    did: u.did ?? null,
    name: u.name ?? null,
    email: u.email ?? null,
    role: u.role ?? null,
    reportsTo: u.reportsTo ?? null,
    description: u.description ?? null,
  };
}

export function knowledgePayload(k: AnyRecord): AnyRecord {
  return {
    id: k.id,
    name: k.name,
    workspaceId: k.workspaceId,
    agentDid: k.agentDid,
    sourceType: k.sourceType,
    status: k.status ?? null,
    createdAt: k.createdAt ?? null,
  };
}

export function skillPayload(s: AnyRecord): AnyRecord {
  return {
    id: s.id,
    name: s.name,
    description: s.description ?? null,
    version: s.version ?? null,
    icon: s.icon ?? null,
    createdAt: s.createdAt ?? null,
    updatedAt: s.updatedAt ?? null,
  };
}

export function workflowPayload(data: AnyRecord): AnyRecord {
  return {
    workflowId: data.workflowId ?? null,
    workflowName: data.workflowName ?? null,
    runId: data.runId ?? null,
    error: data.error ?? null,
  };
}

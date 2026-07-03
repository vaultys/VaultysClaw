import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getLiteLLMSettings, setLiteLLMSettings } from "@/db/settings.dao";
import {
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
  listModels,
} from "@/lib/litellm-client";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  reconnectLiteLLMService,
  disconnectLiteLLMService,
  getLiteLLMServiceState,
} from "@/lib/litellm-service";

/** Proxy a LiteLLM API call and return parsed JSON or null on failure. */
async function litellmFetch<T>(path: string): Promise<T | null> {
  if (!isLiteLLMConfigured()) return null;
  const base = getLiteLLMBaseUrl();
  const { masterKey } = await getLiteLLMSettings().catch(() => ({
    masterKey: null,
  }));
  const key = masterKey ?? process.env.LITELLM_MASTER_KEY ?? "";
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

const handlers = createNextRoute(adminContract.settings, {
  // ── GET /api/admin/settings/litellm ─────────────────────────────────────────────
  getLitellm: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { baseUrl, masterKey } = await getLiteLLMSettings().catch(() => ({
      baseUrl: null,
      masterKey: null,
    }));
    const svcState = getLiteLLMServiceState();

    const effectiveBaseUrl = baseUrl ?? process.env.LITELLM_BASE_URL ?? null;
    const effectiveMasterKey =
      masterKey ?? process.env.LITELLM_MASTER_KEY ?? null;
    const configured = Boolean(effectiveBaseUrl && effectiveMasterKey);
    const healthy = svcState.status === "connected";

    let modelCount = 0;
    let totalSpend: number | null = null;
    let keyCount: number | null = null;

    if (healthy) {
      const models = await listModels().catch(() => []);
      modelCount = models.length;
      const spendData = await litellmFetch<{ spend: number }>("/global/spend");
      if (spendData?.spend != null) totalSpend = spendData.spend;
      const keyData = await litellmFetch<{ keys: unknown[] }>(
        "/key/list?include_team_keys=true"
      );
      if (Array.isArray(keyData?.keys)) keyCount = keyData!.keys.length;
    }

    return {
      status: 200,
      body: {
        configured,
        healthy,
        status: svcState.status,
        baseUrl: effectiveBaseUrl,
        masterKeySet: Boolean(effectiveMasterKey),
        source: baseUrl ? ("db" as const) : ("env" as const),
        lastError: svcState.lastError,
        checkedAt: svcState.checkedAt?.toISOString() ?? null,
        stats: { modelCount, totalSpend, keyCount },
      },
    };
  },

  // ── PUT /api/admin/settings/litellm ─────────────────────────────────────────────
  saveLitellm: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    await setLiteLLMSettings({
      baseUrl: body.baseUrl,
      masterKey: body.masterKey ?? undefined,
    });

    const { ok, status, baseUrl } = await reconnectLiteLLMService();
    return { status: 200, body: { ok, status, baseUrl } };
  },

  // ── POST /api/admin/settings/litellm — reconnect without changing config ────────
  reconnectLitellm: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { ok, status, baseUrl } = await reconnectLiteLLMService();
    return { status: 200, body: { ok, status, baseUrl } };
  },

  // ── DELETE /api/admin/settings/litellm ──────────────────────────────────────────
  disconnectLitellm: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    await setLiteLLMSettings({ baseUrl: null, masterKey: null });
    disconnectLiteLLMService();
    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;
export const POST = handlers.POST!;
export const DELETE = handlers.DELETE!;

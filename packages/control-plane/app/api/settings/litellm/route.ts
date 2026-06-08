import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { getLiteLLMSettings, setLiteLLMSettings } from "@/db/settings.dao";
import { isLiteLLMConfigured, getLiteLLMBaseUrl, listModels } from "@/lib/litellm-client";
import {
  reconnectLiteLLMService,
  disconnectLiteLLMService,
  getLiteLLMServiceState,
} from "@/lib/litellm-service";

/** Proxy a LiteLLM API call and return parsed JSON or null on failure. */
async function litellmFetch<T>(path: string): Promise<T | null> {
  if (!isLiteLLMConfigured()) return null;
  const base = getLiteLLMBaseUrl();
  const { masterKey } = await getLiteLLMSettings().catch(() => ({ masterKey: null }));
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

/**
 * GET /api/settings/litellm
 * Returns configuration status + live stats from the LiteLLM proxy.
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { baseUrl, masterKey } = await getLiteLLMSettings().catch(() => ({ baseUrl: null, masterKey: null }));
  const svcState = getLiteLLMServiceState();

  const effectiveBaseUrl = baseUrl ?? process.env.LITELLM_BASE_URL ?? null;
  const effectiveMasterKey = masterKey ?? process.env.LITELLM_MASTER_KEY ?? null;
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
    const keyData = await litellmFetch<{ keys: unknown[] }>("/key/list?include_team_keys=true");
    if (Array.isArray(keyData?.keys)) keyCount = keyData!.keys.length;
  }

  return NextResponse.json({
    configured,
    healthy,
    status: svcState.status,
    baseUrl: effectiveBaseUrl,
    masterKeySet: Boolean(effectiveMasterKey),
    source: baseUrl ? "db" : "env",
    lastError: svcState.lastError,
    checkedAt: svcState.checkedAt,
    stats: { modelCount, totalSpend, keyCount },
  });
}

/**
 * PUT /api/settings/litellm
 * Save LiteLLM connection settings and reconnect the service.
 */
export async function PUT(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as { baseUrl?: string; masterKey?: string };
  if (!body.baseUrl) return NextResponse.json({ error: "baseUrl is required" }, { status: 400 });

  await setLiteLLMSettings({
    baseUrl: body.baseUrl,
    masterKey: body.masterKey ?? undefined,
  });

  const { ok, status, baseUrl } = await reconnectLiteLLMService();
  return NextResponse.json({ ok, status, baseUrl });
}

/**
 * POST /api/settings/litellm — reconnect without changing stored config
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { ok, status, baseUrl } = await reconnectLiteLLMService();
  return NextResponse.json({ ok, status, baseUrl });
}

/**
 * DELETE /api/settings/litellm
 * Disconnect and remove stored settings (falls back to env vars on next reconnect).
 */
export async function DELETE(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  await setLiteLLMSettings({ baseUrl: null, masterKey: null });
  disconnectLiteLLMService();
  return NextResponse.json({ ok: true });
}

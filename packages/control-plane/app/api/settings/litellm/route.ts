import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { getLiteLLMSettings, setLiteLLMSettings } from "@/db/settings.dao";
import {
  setLiteLLMConfig,
  isLiteLLMConfigured,
  getLiteLLMBaseUrl,
  healthCheck,
  listModels,
} from "@/lib/litellm-client";

/** Proxy a LiteLLM API call and return parsed JSON or null on failure. */
async function litellmFetch<T>(path: string): Promise<T | null> {
  const base = getLiteLLMBaseUrl();
  const key = process.env.LITELLM_MASTER_KEY || "";
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

  const { baseUrl, masterKey } = await getLiteLLMSettings();

  // Effective values (DB takes precedence over env)
  const effectiveBaseUrl = baseUrl ?? process.env.LITELLM_BASE_URL ?? null;
  const effectiveMasterKey = masterKey ?? process.env.LITELLM_MASTER_KEY ?? null;
  const configured = Boolean(effectiveBaseUrl && effectiveMasterKey);

  let healthy = false;
  let modelCount = 0;
  let totalSpend: number | null = null;
  let keyCount: number | null = null;

  if (configured) {
    healthy = await healthCheck();

    if (healthy) {
      // Model count
      const models = await listModels();
      modelCount = models.length;

      // Total spend
      const spendData = await litellmFetch<{ spend: number }>("/global/spend");
      if (spendData?.spend != null) totalSpend = spendData.spend;

      // Key count
      const keyData = await litellmFetch<{ keys: unknown[] }>("/key/list?include_team_keys=true");
      if (Array.isArray(keyData?.keys)) keyCount = keyData!.keys.length;
    }
  }

  return NextResponse.json({
    configured,
    healthy,
    // Return URL but never the master key
    baseUrl: effectiveBaseUrl,
    masterKeySet: Boolean(effectiveMasterKey),
    // Source: "db" means editable via this API; "env" means read-only from env
    source: baseUrl ? "db" : "env",
    stats: { modelCount, totalSpend, keyCount },
  });
}

/**
 * PUT /api/settings/litellm
 * Save LiteLLM connection settings. Accepts { baseUrl, masterKey? }.
 * masterKey is optional — omit to keep the existing key.
 */
export async function PUT(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as { baseUrl?: string; masterKey?: string };

  if (!body.baseUrl && body.masterKey === undefined) {
    return NextResponse.json({ error: "baseUrl is required" }, { status: 400 });
  }

  await setLiteLLMSettings({
    baseUrl: body.baseUrl ?? undefined,
    masterKey: body.masterKey ?? undefined,
  });

  // Update the in-process runtime cache so changes take effect immediately
  const fresh = await getLiteLLMSettings();
  setLiteLLMConfig(fresh.baseUrl, fresh.masterKey);

  const healthy = isLiteLLMConfigured() ? await healthCheck() : false;

  return NextResponse.json({ ok: true, healthy });
}

/**
 * DELETE /api/settings/litellm
 * Remove stored LiteLLM settings (falls back to env vars).
 */
export async function DELETE(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  await setLiteLLMSettings({ baseUrl: null, masterKey: null });
  setLiteLLMConfig(null, null);

  return NextResponse.json({ ok: true });
}

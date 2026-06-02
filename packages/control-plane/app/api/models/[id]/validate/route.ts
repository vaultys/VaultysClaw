import { NextRequest, NextResponse } from "next/server";
import { getModelRegistryEntry } from "@/lib/db";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/models/[id]/validate — test connectivity to the model's endpoint */
export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id } = await params;
    const entry = getModelRegistryEntry(id);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Normalise: strip trailing slash and any trailing /v1 so both
    // 'https://api.openai.com' and 'https://api.openai.com/v1' resolve correctly.
    const baseUrl = entry.base_url.replace(/\/+$/, "").replace(/\/v1$/, "");
    const headers: Record<string, string> = entry.api_key_enc
      ? { Authorization: `Bearer ${entry.api_key_enc}` }
      : {};

    // Try /v1/models (OpenAI / OpenAI-compatible — returns available model list)
    try {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as { data?: { id: string }[] };
        const modelIds = data.data?.map((m) => m.id) ?? [];
        return NextResponse.json({ ok: true, models: modelIds });
      }
      // Non-OK but reachable (e.g. 401 bad key, 403 insufficient scope) — still reachable
      if (res.status !== 404) {
        return NextResponse.json({ ok: false, error: `HTTP ${res.status}`, models: [] });
      }
    } catch {
      // fall through to /health check
    }

    // Fallback: /health (Ollama, vLLM, etc.)
    try {
      const res = await fetch(`${baseUrl}/health`, { headers, signal: AbortSignal.timeout(5000) });
      return NextResponse.json({ ok: res.ok, models: [] });
    } catch {
      return NextResponse.json({ ok: false, error: "Endpoint unreachable" });
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}

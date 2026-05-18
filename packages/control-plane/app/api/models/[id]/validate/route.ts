import { NextRequest, NextResponse } from "next/server";
import { getModelRegistryEntry } from "@/lib/db";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/models/[id]/validate — test connectivity to the model's endpoint */
export async function POST(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await params;
    const entry = getModelRegistryEntry(id);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const baseUrl = entry.base_url.replace(/\/$/, "");

    // Try /v1/models first (vLLM / OpenAI-compatible)
    try {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: entry.api_key_enc
          ? { Authorization: `Bearer ${entry.api_key_enc}` }
          : {},
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = await res.json() as { data?: { id: string }[] };
        const modelIds = data.data?.map((m) => m.id) ?? [];
        return NextResponse.json({ ok: true, models: modelIds });
      }
    } catch {
      // fall through to /health check
    }

    // Fallback: /health
    try {
      const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5000) });
      return NextResponse.json({ ok: res.ok, models: [] });
    } catch {
      return NextResponse.json({ ok: false, error: "Endpoint unreachable" });
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Validation failed" }, { status: 500 });
  }
}

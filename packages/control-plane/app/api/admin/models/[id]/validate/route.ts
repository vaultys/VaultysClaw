import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ModelDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.models, {
  // ── POST /api/admin/models/:id/validate — probe the stored endpoint ─────────────
  validate: async ({ params, request }) => {
    await getAuthContext(request);

    const entry = await ModelDAO.findByIdUnsafe(params.id);
    if (!entry) throw new APIException("NOT_FOUND", "Model not found");

    // Normalise: strip trailing slash and any trailing /v1 so both
    // 'https://api.openai.com' and 'https://api.openai.com/v1' resolve correctly.
    const baseUrl = entry.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
    const headers: Record<string, string> = entry.apiKeyEnc
      ? { Authorization: `Bearer ${entry.apiKeyEnc}` }
      : {};

    // Try /v1/models (OpenAI / OpenAI-compatible — returns available model list)
    try {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: { id: string }[] };
        const models = data.data?.map((m) => m.id) ?? [];
        return { status: 200, body: { ok: true, models } };
      }
      // Non-OK but reachable (e.g. 401 bad key) — still reachable.
      if (res.status !== 404) {
        return {
          status: 200,
          body: { ok: false, models: [], error: `HTTP ${res.status}` },
        };
      }
    } catch {
      // fall through to /health check
    }

    // Fallback: /health (Ollama, vLLM, etc.)
    const res = await fetch(`${baseUrl}/health`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    return { status: 200, body: { ok: res.ok, models: [] } };
  },
});

export const POST = handlers.POST!;

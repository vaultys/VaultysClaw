import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.models, {
  // ── POST /api/models/test — probe an endpoint and list its models ─────────
  test: async ({ body, request }) => {
    await getAuthContext(request);

    if (!body.baseUrl.trim())
      throw new APIException("MALFORMED", "Base URL is required");

    const url = body.baseUrl.replace(/\/$/, "");
    const apiKey = body.apiKey ?? undefined;

    // Try /v1/models first (vLLM / OpenAI-compatible)
    try {
      const res = await fetch(`${url}/v1/models`, {
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as { data?: { id: string }[] };
        const models = data.data?.map((m) => m.id) ?? [];
        return { status: 200, body: { ok: true, models } };
      }
    } catch {
      // fall through to /health check
    }

    // Fallback: /health
    try {
      const res = await fetch(`${url}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return { status: 200, body: { ok: true, models: [] } };
    } catch {
      // fall through
    }

    return {
      status: 200,
      body: {
        ok: false,
        models: [],
        error: "Could not verify connection to endpoint",
      },
    };
  },
});

export const POST = handlers.POST!;

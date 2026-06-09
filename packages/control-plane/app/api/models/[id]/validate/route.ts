import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { notFound, unauthorized } from "@/lib/api/utils/api-utils";
import { ModelDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/models/[id]/validate — test connectivity to the model's endpoint */
/**
 * @openapi
 * /api/models/{id}/validate:
 *   post:
 *     summary: Validate connectivity to a model's endpoint.
 *     tags: [Models]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the model to validate.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Validation result with model IDs if reachable.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 models:
 *                   type: array
 *                   items:
 *                     type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         description: Validation failed due to server error.
 */
export const POST = withError(async (_req: NextRequest, { params }: Ctx) => {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await params;
  const entry = await ModelDAO.findById(id);
  if (!entry) return notFound("Model not found");

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
      const modelIds = data.data?.map((m) => m.id) ?? [];
      return NextResponse.json({ ok: true, models: modelIds });
    }
    // Non-OK but reachable (e.g. 401 bad key, 403 insufficient scope) — still reachable
    if (res.status !== 404) {
      return NextResponse.json({
        ok: false,
        error: `HTTP ${res.status}`,
        models: [],
      });
    }
  } catch {
    // fall through to /health check
  }

  // Fallback: /health (Ollama, vLLM, etc.)

  const res = await fetch(`${baseUrl}/health`, {
    headers,
    signal: AbortSignal.timeout(5000),
  });
  return NextResponse.json({ ok: res.ok, models: [] });
});

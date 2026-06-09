import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { malformed, unauthorized } from "@/lib/api-utils";

/** POST /api/models/test — test connectivity to a model endpoint and fetch available models */
/**
 * @openapi
 * /api/models/test:
 *   post:
 *     summary: Test connectivity to a model endpoint and fetch available models.
 *     tags: [Models]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               provider:
 *                 type: string
 *               modelId:
 *                 type: string
 *               baseUrl:
 *                 type: string
 *               apiKey:
 *                 type: string
 *                 nullable: true
 *             required:
 *               - provider
 *               - modelId
 *               - baseUrl
 *     responses:
 *       200:
 *         description: Successful response with available models.
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
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Validation failed.
 */
export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const body = (await req.json()) as {
    provider: string;
    modelId: string;
    baseUrl: string;
    apiKey?: string;
  };

  const { baseUrl, apiKey } = body;

  if (!baseUrl?.trim()) {
    return malformed("Base URL is required");
  }

  const url = baseUrl.replace(/\/$/, "");

  // Try /v1/models first (vLLM / OpenAI-compatible)
  try {
    const res = await fetch(`${url}/v1/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { data?: { id: string }[] };
      const models = data.data?.map((m) => m.id) ?? [];
      return NextResponse.json({ ok: true, models });
    }
  } catch {
    // fall through to /health check
  }

  // Fallback: /health
  try {
    const res = await fetch(`${url}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      return NextResponse.json({ ok: true, models: [] });
    }
  } catch {
    // fall through
  }

  return NextResponse.json({
    ok: false,
    error: "Could not verify connection to endpoint",
  });
}

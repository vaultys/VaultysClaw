import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';
import { setDoclingEndpoints } from '@/lib/db';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface OpenApiSpec {
  paths?: Record<string, Record<string, unknown>>;
}

/**
 * Fetch /openapi.json and return the best-matching POST paths for:
 *   - URL source conversion  (e.g. /v1/convert/source)
 *   - File upload conversion (e.g. /v1/convert/file)
 *
 * Falls back to v1alpha defaults if the spec cannot be read.
 */
async function discoverEndpoints(baseUrl: string): Promise<{
  sourceEndpoint: string;
  fileEndpoint: string;
}> {
  const defaults = {
    sourceEndpoint: '/v1alpha/convert/source',
    fileEndpoint:   '/v1alpha/convert/file',
  };

  try {
    const res = await fetch(`${baseUrl}/openapi.json`, {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return defaults;

    const spec = await res.json() as OpenApiSpec;
    const paths = Object.keys(spec.paths ?? {});

    // POST paths only
    const postPaths = paths.filter(p => spec.paths![p].post !== undefined);

    // Source / URL conversion — prefer paths containing both "convert" and "source"
    const sourceEndpoint =
      postPaths.find(p => /convert/.test(p) && /source/.test(p)) ??
      postPaths.find(p => /convert/.test(p) && !/file/.test(p)) ??
      defaults.sourceEndpoint;

    // File conversion — prefer paths containing both "convert" and "file"
    const fileEndpoint =
      postPaths.find(p => /convert/.test(p) && /file/.test(p)) ??
      sourceEndpoint; // fall back to same path if no dedicated file endpoint

    return { sourceEndpoint, fileEndpoint };
  } catch {
    return defaults;
  }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

// POST /api/settings/docling/test
// Body: { url: string }
/**
 * @openapi
 * /api/settings/docling/test:
 *   post:
 *     summary: Test and discover Docling endpoints.
 *     tags: [Settings]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               url:
 *                 type: string
 *                 description: The base URL to test and discover endpoints from.
 *     responses:
 *       200:
 *         description: Successfully discovered endpoints.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 latency:
 *                   type: integer
 *                 version:
 *                   type: string
 *                 sourceEndpoint:
 *                   type: string
 *                 fileEndpoint:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = await request.json() as { url?: string };
  const rawUrl = (body.url ?? '').trim().replace(/\/$/, '');

  if (!rawUrl) {
    return NextResponse.json({ ok: false, error: 'No URL provided' }, { status: 400 });
  }

  const start = Date.now();
  try {
    // 1. Health check
    const healthRes = await fetch(`${rawUrl}/health`, {
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: 'application/json' },
    });

    const latency = Date.now() - start;

    if (!healthRes.ok) {
      return NextResponse.json({
        ok: false,
        error: `Health check returned HTTP ${healthRes.status}`,
        latency,
      });
    }

    let version: string | undefined;
    try {
      const data = await healthRes.json() as { version?: string; docling_version?: string };
      version = data.version ?? data.docling_version;
    } catch { /* non-JSON health response — fine */ }

    // 2. Discover real API endpoints from OpenAPI spec
    const { sourceEndpoint, fileEndpoint } = await discoverEndpoints(rawUrl);

    // 3. Persist the discovered endpoints so syncs use the right paths
    setDoclingEndpoints(sourceEndpoint, fileEndpoint);

    return NextResponse.json({
      ok: true,
      latency,
      version,
      sourceEndpoint,
      fileEndpoint,
    });
  } catch (err) {
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg, latency });
  }
}

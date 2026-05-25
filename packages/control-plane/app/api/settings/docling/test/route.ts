import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';

// POST /api/settings/docling/test
// Body: { url: string }
export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = await request.json() as { url?: string };
  const rawUrl = (body.url ?? '').trim().replace(/\/$/, '');

  if (!rawUrl) {
    return NextResponse.json({ ok: false, error: 'No URL provided' }, { status: 400 });
  }

  const start = Date.now();
  try {
    const healthUrl = `${rawUrl}/health`;
    const res = await fetch(healthUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });

    const latency = Date.now() - start;

    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        error: `Health check returned HTTP ${res.status}`,
        latency,
      });
    }

    let version: string | undefined;
    try {
      const data = await res.json() as { version?: string; docling_version?: string; status?: string };
      version = data.version ?? data.docling_version;
    } catch { /* not JSON — fine */ }

    return NextResponse.json({ ok: true, latency, version });
  } catch (err) {
    const latency = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg, latency });
  }
}

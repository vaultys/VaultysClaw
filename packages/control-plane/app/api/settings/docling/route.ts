import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';
import { getDoclingConfig, setDoclingConfig } from '@/lib/db';

// GET /api/settings/docling
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const cfg = getDoclingConfig();
  return NextResponse.json({
    url: cfg?.url ?? '',
    enabled: cfg?.enabled ?? false,
    configured: !!cfg?.url,
    sourceEndpoint: cfg?.sourceEndpoint ?? null,
    fileEndpoint:   cfg?.fileEndpoint   ?? null,
  });
}

// PUT /api/settings/docling
export async function PUT(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = await request.json() as { url?: string; enabled?: boolean };
  const url = (body.url ?? '').trim().replace(/\/$/, '');
  const enabled = body.enabled ?? false;

  if (enabled && !url) {
    return NextResponse.json({ error: 'URL is required when enabling Docling' }, { status: 400 });
  }

  setDoclingConfig({ url, enabled });
  return NextResponse.json({ ok: true });
}

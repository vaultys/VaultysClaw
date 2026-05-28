import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';
import { getKnowledgeSource, deleteKnowledgeSource } from '@/lib/db';

// GET /api/knowledge/:id
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const { id } = await params;
  const source = getKnowledgeSource(id);
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (!auth.isGlobalAdmin && !auth.canAccessRealm(source.realm_id)) {
    return forbidden();
  }

  return NextResponse.json({ source });
}

// DELETE /api/knowledge/:id
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const source = getKnowledgeSource(id);
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteKnowledgeSource(id);
  return NextResponse.json({ success: true });
}

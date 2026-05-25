import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';
import { getKnowledgeFileContent, deleteKnowledgeFile, getKnowledgeSource } from '@/lib/db';

// DELETE /api/knowledge/files/:fileId
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { fileId } = await params;
  const file = getKnowledgeFileContent(fileId);
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  // Verify the parent source exists (for logging context)
  const source = getKnowledgeSource(file.source_id);
  if (source && !auth.isGlobalAdmin && !auth.canAccessRealm(source.realm_id)) {
    return forbidden();
  }

  deleteKnowledgeFile(fileId);
  return NextResponse.json({ success: true });
}

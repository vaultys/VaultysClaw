import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';
import { getKnowledgeFileContent, deleteKnowledgeFile, getKnowledgeSource } from '@/lib/db';

// DELETE /api/knowledge/files/:fileId
/**
 * @openapi
 * /api/knowledge/files/{fileId}:
 *   delete:
 *     summary: Delete a knowledge file by ID.
 *     tags: [Knowledge]
 *     parameters:
 *       - name: fileId
 *         in: path
 *         required: true
 *         description: The ID of the knowledge file to delete.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Knowledge file successfully deleted.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const auth = await getAuthContext(_request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { fileId } = await params;
  const file = await getKnowledgeFileContent(fileId);
  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  // Verify the parent source exists (for logging context)
  const source = getKnowledgeSource(file.source_id);
  if (source && !auth.isGlobalAdmin && !auth.canAccessRealm(source.realm_id)) {
    return forbidden();
  }

  await deleteKnowledgeFile(fileId);
  return NextResponse.json({ success: true });
}

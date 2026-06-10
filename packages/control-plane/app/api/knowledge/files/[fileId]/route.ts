import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden, notFound } from "@/lib/api/utils/api-utils";
import { KnowledgeDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

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
export const DELETE = withError(async (
  _request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) => {
  const auth = await getAuthContext(_request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { fileId } = await params;
  const file = await KnowledgeDAO.findFile(fileId);
  if (!file) return notFound("File not found");

  // Verify the parent source exists (for logging context)
  const source = await KnowledgeDAO.findSource(file.sourceId);
  if (
    source &&
    !auth.isGlobalAdmin &&
    !(await auth.canAccessRealm(source.realmId))
  ) {
    return forbidden();
  }

  await KnowledgeDAO.deleteFile(fileId);
  return NextResponse.json({ success: true });
});

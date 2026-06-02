import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';
import { getKnowledgeSource, deleteKnowledgeSource } from '@/lib/db';

// GET /api/knowledge/:id
/**
 * @openapi
 * /api/knowledge/{id}:
 *   get:
 *     summary: Retrieve a knowledge source by ID.
 *     tags: [Knowledge]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the knowledge source.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Knowledge source retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 source:
 *                   type: object
 *                   description: The knowledge source object.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(request);
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
/**
 * @openapi
 * /api/knowledge/{id}:
 *   delete:
 *     summary: Delete a knowledge source by ID.
 *     tags: [Knowledge]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: The ID of the knowledge source to delete.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Knowledge source deleted successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await params;
  const source = getKnowledgeSource(id);
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await deleteKnowledgeSource(id);
  return NextResponse.json({ success: true });
}

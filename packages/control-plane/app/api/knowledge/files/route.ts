import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';
import { createKnowledgeFile, listKnowledgeFiles, getKnowledgeSource } from '@/lib/db';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// GET /api/knowledge/files?sourceId=xxx — list file metadata (no content)
/**
 * @openapi
 * /api/knowledge/files:
 *   get:
 *     summary: List file metadata for a knowledge source.
 *     tags: [Knowledge]
 *     parameters:
 *       - in: query
 *         name: sourceId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the knowledge source.
 *     responses:
 *       200:
 *         description: A list of file metadata.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 files:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       mimeType:
 *                         type: string
 *                       size:
 *                         type: integer
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const sourceId = request.nextUrl.searchParams.get('sourceId');
  if (!sourceId) return NextResponse.json({ error: 'sourceId required' }, { status: 400 });

  const source = getKnowledgeSource(sourceId);
  if (!source) return NextResponse.json({ error: 'Source not found' }, { status: 404 });

  if (!auth.isGlobalAdmin && !auth.canAccessRealm(source.realm_id)) {
    return forbidden();
  }

  const files = listKnowledgeFiles(sourceId);
  return NextResponse.json({ files });
}

// POST /api/knowledge/files — upload a file attached to a knowledge source
// Body: multipart/form-data  { sourceId: string, file: File }
/**
 * @openapi
 * /api/knowledge/files:
 *   post:
 *     summary: Upload a file attached to a knowledge source.
 *     tags: [Knowledge]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               sourceId:
 *                 type: string
 *                 description: The ID of the knowledge source.
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The file to upload.
 *     responses:
 *       201:
 *         description: File uploaded successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 file:
 *                   $ref: '#/components/schemas/KnowledgeFile'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       413:
 *         description: File exceeds maximum size of 20MB.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const sourceId = formData.get('sourceId') as string | null;
  const file = formData.get('file') as File | null;

  if (!sourceId || !file) {
    return NextResponse.json({ error: 'sourceId and file are required' }, { status: 400 });
  }

  const source = getKnowledgeSource(sourceId);
  if (!source) return NextResponse.json({ error: 'Source not found' }, { status: 404 });

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 413 },
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const content = Buffer.from(arrayBuffer);
  const mimeType = file.type || 'application/octet-stream';

  const meta = await createKnowledgeFile(sourceId, file.name, mimeType, content);
  return NextResponse.json({ file: meta }, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api/utils/api-utils";
import { generateFileKey } from "@/lib/file-storage";
import { prisma } from "@/db/client";
import { getFileStorage } from "@/lib/file-storage-manager";

// POST /api/settings/storage/migrate
// Migrate files from SQLite BLOB storage to filesystem/S3 storage
/**
 * @openapi
 * /api/settings/storage/migrate:
 *   post:
 *     summary: Migrate files from SQLite BLOB storage to filesystem/S3 storage.
 *     tags: [Settings]
 *     responses:
 *       200:
 *         description: Migration completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 migratedCount:
 *                   type: integer
 *                 errorCount:
 *                   type: integer
 *                 message:
 *                   type: string
 *                 hasMore:
 *                   type: boolean
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: Migration failed due to server error.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const storage = await getFileStorage();

  // Find all files with content BLOB but no file_path
  const rows = await prisma.knowledgeFile.findMany({
    where: {
      content: { not: null },
      filePath: null,
    },
    select: {
      id: true,
      sourceId: true,
      name: true,
      content: true,
    },
    take: 100,
  });

  if (rows.length === 0) {
    return NextResponse.json({
      success: true,
      migratedCount: 0,
      message: "No files to migrate",
    });
  }

  // Migrate each file
  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    try {
      // Generate file key
      const fileKey = generateFileKey(row.sourceId, row.id, row.name);

      // Write to storage
      await storage.write(fileKey, row.content as Buffer);

      // Update database with file_path and clear content
      await prisma.knowledgeFile.update({
        where: { id: row.id },
        data: { filePath: fileKey, content: null },
      });

      successCount++;
    } catch (err) {
      console.error(`Failed to migrate file ${row.id}:`, err);
      errorCount++;
    }
  }

  return NextResponse.json({
    success: true,
    migratedCount: successCount,
    errorCount,
    message: `Migrated ${successCount} file(s)${errorCount > 0 ? `, ${errorCount} error(s)` : ""}`,
    hasMore: rows.length === 100, // If we hit the limit, there may be more
  });
}

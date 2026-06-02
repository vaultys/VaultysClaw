import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, unauthorized, forbidden } from '@/lib/auth-utils';
import { getDb, getFileStorage } from '@/lib/db';
import { generateFileKey } from '@/lib/file-storage';

// POST /api/settings/storage/migrate
// Migrate files from SQLite BLOB storage to filesystem/S3 storage
export async function POST(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  try {
    const d = getDb();
    const storage = await getFileStorage();

    // Find all files with content BLOB but no file_path
    const rows = d.prepare(`
      SELECT id, source_id, name, content FROM knowledge_files
      WHERE content IS NOT NULL AND file_path IS NULL
      LIMIT 100
    `).all() as Array<{ id: string; source_id: string; name: string; content: Buffer }>;

    if (rows.length === 0) {
      return NextResponse.json({
        success: true,
        migratedCount: 0,
        message: 'No files to migrate',
      });
    }

    // Migrate each file
    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      try {
        // Generate file key
        const fileKey = generateFileKey(row.source_id, row.id, row.name);

        // Write to storage
        await storage.write(fileKey, row.content);

        // Update database with file_path and clear content
        d.prepare(`
          UPDATE knowledge_files
          SET file_path = ?, content = NULL
          WHERE id = ?
        `).run(fileKey, row.id);

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
      message: `Migrated ${successCount} file(s)${errorCount > 0 ? `, ${errorCount} error(s)` : ''}`,
      hasMore: rows.length === 100, // If we hit the limit, there may be more
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    );
  }
}

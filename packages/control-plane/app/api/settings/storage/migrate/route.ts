import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { generateFileKey } from "@/lib/file-storage";
import { prisma } from "@/db/client";
import { getFileStorage } from "@/lib/file-storage-manager";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

// Migrate files from legacy BLOB storage to filesystem/S3 storage
const handlers = createNextRoute(adminContract.settings, {
  migrateStorage: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const storage = await getFileStorage();

    // Find all files with content BLOB but no file_path
    const rows = await prisma.knowledgeFile.findMany({
      where: { content: { not: null }, filePath: null },
      select: { id: true, sourceId: true, name: true, content: true },
      take: 100,
    });

    if (rows.length === 0) {
      return {
        status: 200,
        body: {
          success: true,
          migratedCount: 0,
          message: "No files to migrate",
        },
      };
    }

    let successCount = 0;
    let errorCount = 0;

    for (const row of rows) {
      try {
        const fileKey = generateFileKey(row.sourceId, row.id, row.name);
        await storage.write(fileKey, row.content as Buffer);
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

    return {
      status: 200,
      body: {
        success: true,
        migratedCount: successCount,
        errorCount,
        message: `Migrated ${successCount} file(s)${errorCount > 0 ? `, ${errorCount} error(s)` : ""}`,
        hasMore: rows.length === 100, // If we hit the limit, there may be more
      },
    };
  },
});

export const POST = handlers.POST!;

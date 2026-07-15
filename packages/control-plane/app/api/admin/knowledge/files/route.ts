import { APIException } from "@/lib/api/utils/api-utils";
import { KnowledgeDAO } from "@/db";
import { adminContract, type KnowledgeFileMeta } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

const handlers = createNextRoute(adminContract.knowledge, {
  // ── POST /api/admin/knowledge/files — upload a file (multipart/form-data) ──
  // The contract body is opaque so createNextRoute leaves the request stream
  // intact — we read the multipart FormData directly here.
  uploadFile: async ({ request }) => {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      throw new APIException("MALFORMED", "Invalid multipart form data");
    }

    const sourceId = formData.get("sourceId") as string | null;
    const file = formData.get("file") as File | null;
    if (!sourceId || !file)
      throw new APIException("MALFORMED", "sourceId and file are required");

    const source = await KnowledgeDAO.findSource(sourceId);
    if (!source) throw new APIException("NOT_FOUND", "Source not found");

    if (file.size > MAX_FILE_SIZE)
      throw new APIException(
        "CONTENT_TOO_LARGE",
        `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`
      );

    const content = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";

    const meta = await KnowledgeDAO.createFile(
      sourceId,
      file.name,
      mimeType,
      content.length,
      ""
    );
    // The DAO's declared return type narrows away `filePath`, but the row has
    // it at runtime; the contract expects the full KnowledgeFileMeta.
    return { status: 201, body: { file: meta as unknown as KnowledgeFileMeta } };
  },
});

export const POST = handlers.POST!;

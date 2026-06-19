import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import {
  APIException,
  unauthorized,
  forbidden,
  malformed,
  notFound,
  contentTooLarge,
} from "@/lib/api/utils/api-utils";
import { KnowledgeDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";
import { knowledgeContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ── GET /api/knowledge/files?sourceId= — list file metadata (no content) ─────
const handlers = createNextRoute(knowledgeContract, {
  listFiles: async ({ query, request }) => {
    const auth = await getAuthContext(request);

    const source = await KnowledgeDAO.findSource(query.sourceId);
    if (!source) throw new APIException("NOT_FOUND", "Source not found");

    if (!auth.isGlobalAdmin && !(await auth.canAccessRealm(source.realmId))) {
      throw new APIException("FORBIDDEN");
    }

    const files = await KnowledgeDAO.listFiles(query.sourceId);
    return { status: 200, body: { files } };
  },
});

export const GET = handlers.GET!;

// POST /api/knowledge/files — upload a file attached to a knowledge source.
// Body: multipart/form-data { sourceId: string, file: File }.
//
// Multipart uploads don't fit the ts-rest/createNextRoute JSON model (it parses
// `request.json()`), so this stays a raw `withError` handler reading the
// FormData directly — the same exception the API guide carves out for streaming.
export const POST = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data" },
      { status: 400 }
    );
  }

  const sourceId = formData.get("sourceId") as string | null;
  const file = formData.get("file") as File | null;

  if (!sourceId || !file) {
    return malformed("sourceId and file are required");
  }

  const source = await KnowledgeDAO.findSource(sourceId);
  if (!source) return notFound("Source not found");

  if (file.size > MAX_FILE_SIZE) {
    return contentTooLarge(
      `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const content = Buffer.from(arrayBuffer);
  const mimeType = file.type || "application/octet-stream";

  const meta = await KnowledgeDAO.createFile(
    sourceId,
    file.name,
    mimeType,
    content.length,
    ""
  );
  return NextResponse.json({ file: meta }, { status: 201 });
});

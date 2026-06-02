import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import fs from "fs";
import path from "path";

const DOCS: Record<string, string[]> = {
  readme: [
    "README.md",
    "../../README.md",
    "../../../README.md",
  ],
  zerotrust: [
    "ZERO_TRUST_COMPLIANCE.md",
    "../../ZERO_TRUST_COMPLIANCE.md",
    "../../../ZERO_TRUST_COMPLIANCE.md",
  ],
};

function resolveDoc(candidates: string[]): string | null {
  for (const rel of candidates) {
    const abs = path.resolve(process.cwd(), rel);
    if (fs.existsSync(abs)) {
      return fs.readFileSync(abs, "utf-8");
    }
  }
  return null;
}

/**
 * @openapi
 * /api/about:
 *   get:
 *     summary: Retrieve documentation content.
 *     tags: [About]
 *     parameters:
 *       - in: query
 *         name: doc
 *         schema:
 *           type: string
 *         description: The document to retrieve (e.g., 'readme', 'zerotrust').
 *     responses:
 *       200:
 *         description: Successful response with the document content.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const doc = new URL(req.url).searchParams.get("doc") ?? "readme";
  const candidates = DOCS[doc];
  if (!candidates) {
    return NextResponse.json({ error: "Unknown document" }, { status: 400 });
  }

  const content = resolveDoc(candidates);
  if (content === null) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({ content });
}

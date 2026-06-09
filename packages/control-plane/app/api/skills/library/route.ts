import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized } from "@/lib/api/utils/api-utils";
import { OrgSkillDAO } from "@/db";

/**
 * GET /api/skills/library
 *
 * Returns the organisation's skill catalog.
 * Consumed by the BrowseLibraryModal in the skills page — the response is
 * mapped to the LibrarySkill shape expected by that component.
 */
/**
 * @openapi
 * /api/skills/library:
 *   get:
 *     summary: Retrieve the organisation's skill catalog.
 *     tags: [Skills]
 *     responses:
 *       200:
 *         description: A list of skills in the organisation's catalog.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/LibrarySkill'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const skills = await OrgSkillDAO.findAll();

  // Map to the LibrarySkill interface used by the frontend modal
  const payload = skills.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description ?? "",
    source: "built-in",
    skillId: s.name,
    installs: 0,
    githubStars: 0,
    repoUrl: "",
    standalone: false,
    icon: s.icon ?? null,
    version: s.version,
    content: s.content ?? null,
    contentType: {
      hasInstructions: Boolean(s.content),
      hasScripts: false,
      hasReferences: false,
      hasAssets: false,
    },
  }));

  return NextResponse.json(payload);
}

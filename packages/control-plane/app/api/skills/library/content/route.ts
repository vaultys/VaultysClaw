import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized } from "@/lib/api-utils";
import { OrgSkillDAO } from "@/db";

/**
 * GET /api/skills/library/content?skillId=<name>
 *
 * Returns the markdown instructions (content) for an org skill by name.
 * Used by the EditSkillModal to pre-fill the instructions textarea.
 */
/**
 * @openapi
 * /api/skills/library/content:
 *   get:
 *     summary: Retrieve markdown instructions for an organization skill by name.
 *     tags: [Skills]
 *     parameters:
 *       - in: query
 *         name: skillId
 *         required: true
 *         schema:
 *           type: string
 *         description: The name of the skill to retrieve content for.
 *     responses:
 *       200:
 *         description: Successfully retrieved skill content.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content:
 *                   type: string
 *                   description: The markdown content of the skill.
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { searchParams } = new URL(request.url);
  const skillId = searchParams.get("skillId");

  if (!skillId) {
    return NextResponse.json({ error: "skillId is required" }, { status: 400 });
  }

  const skill = await OrgSkillDAO.findByName(skillId);
  if (!skill || !skill.content) {
    return NextResponse.json(
      { error: "Skill content not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({ content: skill.content });
}

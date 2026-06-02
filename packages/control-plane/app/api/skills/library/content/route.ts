import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { getOrgSkillByName } from "@/lib/db";

/**
 * GET /api/skills/library/content?skillId=<name>
 *
 * Returns the markdown instructions (content) for an org skill by name.
 * Used by the EditSkillModal to pre-fill the instructions textarea.
 */
export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  const { searchParams } = new URL(request.url);
  const skillId = searchParams.get("skillId");

  if (!skillId) {
    return NextResponse.json({ error: "skillId is required" }, { status: 400 });
  }

  const skill = getOrgSkillByName(skillId);
  if (!skill || !skill.content) {
    return NextResponse.json({ error: "Skill content not found" }, { status: 404 });
  }

  return NextResponse.json({ content: skill.content });
}

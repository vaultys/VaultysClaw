import { NextResponse } from "next/server";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";
import { getOrgSkills } from "@/lib/db";

/**
 * GET /api/skills/library
 *
 * Returns the organisation's skill catalog.
 * Consumed by the BrowseLibraryModal in the skills page — the response is
 * mapped to the LibrarySkill shape expected by that component.
 */
export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const skills = getOrgSkills();

  // Map to the LibrarySkill interface used by the frontend modal
  const payload = skills.map((s) => ({
    id:          s.id,
    name:        s.name,
    description: s.description ?? "",
    source:      "built-in",
    skillId:     s.name,
    installs:    0,
    githubStars: 0,
    repoUrl:     "",
    standalone:  false,
    icon:        s.icon ?? null,
    version:     s.version,
    content:     s.content ?? null,
    contentType: {
      hasInstructions: Boolean(s.content),
      hasScripts:      false,
      hasReferences:   false,
      hasAssets:       false,
    },
  }));

  return NextResponse.json(payload);
}

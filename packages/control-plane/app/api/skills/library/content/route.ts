import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

// Strip YAML frontmatter (--- ... ---) from SKILL.md content
function stripFrontmatter(md: string): string {
  const trimmed = md.trimStart();
  if (!trimmed.startsWith("---")) return md;
  const end = trimmed.indexOf("\n---", 3);
  if (end === -1) return md;
  return trimmed.slice(end + 4).trimStart();
}

async function tryFetch(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (res.ok) return await res.text();
  } catch {
    // ignore
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { searchParams } = new URL(request.url);
  const source = searchParams.get("source"); // e.g. "anthropics/skills"
  const skillId = searchParams.get("skillId"); // e.g. "frontend-design"

  if (!source || !skillId) {
    return NextResponse.json({ error: "source and skillId are required" }, { status: 400 });
  }

  // Try common paths in order: skills/{skillId}/SKILL.md, {skillId}/SKILL.md, {skillId}.md
  const branches = ["main", "master"];
  const paths = [
    `skills/${skillId}/SKILL.md`,
    `${skillId}/SKILL.md`,
    `${skillId}.md`,
  ];

  for (const branch of branches) {
    for (const path of paths) {
      const url = `https://github.com/${source}/raw/refs/heads/${branch}/${path}`;
      const text = await tryFetch(url);
      if (text) {
        return NextResponse.json({ content: stripFrontmatter(text), url });
      }
    }
  }

  return NextResponse.json({ error: "Skill content not found in repository" }, { status: 404 });
}

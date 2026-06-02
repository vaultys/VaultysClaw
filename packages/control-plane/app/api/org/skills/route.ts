/**
 * GET  /api/org/skills   — list the org skill catalog
 * POST /api/org/skills   — add a new skill to the catalog (global admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { getOrgSkills, createOrgSkill } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();

  return NextResponse.json({ skills: getOrgSkills() });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = await req.json() as {
    name?: string;
    description?: string;
    version?: string;
    icon?: string;
    content?: string;
    configSchema?: Record<string, unknown>;
  };

  if (!body.name?.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const skill = createOrgSkill({
      name:         body.name.trim(),
      description:  body.description?.trim(),
      version:      body.version?.trim(),
      icon:         body.icon?.trim(),
      content:      body.content ?? undefined,
      configSchema: body.configSchema,
    });
    return NextResponse.json({ skill }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE")) {
      return NextResponse.json({ error: `Skill "${body.name}" already exists in the catalog` }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create skill" }, { status: 500 });
  }
}

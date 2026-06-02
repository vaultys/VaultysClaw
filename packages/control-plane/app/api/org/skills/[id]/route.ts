/**
 * GET    /api/org/skills/[id]   — get one org skill
 * PATCH  /api/org/skills/[id]   — update an org skill (global admin only)
 * DELETE /api/org/skills/[id]   — remove from catalog (global admin only)
 */

import { NextRequest, NextResponse } from "next/server";
import { getOrgSkillById, updateOrgSkill, deleteOrgSkill } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();

  const { id } = await ctx.params;
  const skill = getOrgSkillById(id);
  if (!skill) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ skill });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await ctx.params;
  if (!getOrgSkillById(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json() as {
    description?: string | null;
    version?: string;
    icon?: string | null;
    content?: string | null;
    configSchema?: Record<string, unknown>;
  };

  updateOrgSkill(id, {
    description:  body.description,
    version:      body.version,
    icon:         body.icon,
    content:      body.content,
    configSchema: body.configSchema,
  });

  return NextResponse.json({ skill: getOrgSkillById(id) });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { id } = await ctx.params;
  if (!getOrgSkillById(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  deleteOrgSkill(id);
  return NextResponse.json({ success: true });
}

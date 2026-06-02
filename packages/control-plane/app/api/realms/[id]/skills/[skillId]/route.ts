import { NextRequest, NextResponse } from "next/server";
import {
  getRealmSkillById,
  updateRealmSkill,
  deleteRealmSkill,
} from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { broadcastSkillsConfig } from "@/lib/ws-server";

type Ctx = { params: Promise<{ id: string; skillId: string }> };

/**
 * GET /api/realms/[id]/skills/[skillId] — get skill detail.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id, skillId } = await ctx.params;
    if (!auth.canAccessRealm(id)) return forbidden();

    const skill = getRealmSkillById(skillId);
    if (!skill || skill.realm_id !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      skill: {
        id: skill.id,
        realmId: skill.realm_id,
        name: skill.name,
        description: skill.description,
        version: skill.version,
        isRequired: skill.is_required === 1,
        config: JSON.parse(skill.config || "{}"),
        createdAt: skill.created_at,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch skill" }, { status: 500 });
  }
}

/**
 * PATCH /api/realms/[id]/skills/[skillId] — update skill metadata.
 * Requires realm admin or global admin.
 * Body: { description?, version?, isRequired?, config? }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();

    const { id, skillId } = await ctx.params;
    if (!auth.canAdminRealm(id)) return forbidden();

    const skill = getRealmSkillById(skillId);
    if (!skill || skill.realm_id !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json() as {
      description?: string | null;
      version?: string | null;
      isRequired?: boolean;
      config?: Record<string, unknown>;
      content?: string | null;
    };

    const updates: Parameters<typeof updateRealmSkill>[1] = {};
    if ("description" in body) updates.description = body.description ?? null;
    if ("version" in body) updates.version = body.version ?? null;
    if ("isRequired" in body) updates.isRequired = body.isRequired;
    if ("config" in body) updates.config = body.config;
    if ("content" in body) updates.content = body.content ?? null;

    updateRealmSkill(skillId, updates);

    broadcastSkillsConfig(id);

    const updated = getRealmSkillById(skillId)!;
    return NextResponse.json({
      skill: {
        id: updated.id,
        realmId: updated.realm_id,
        name: updated.name,
        description: updated.description,
        version: updated.version,
        isRequired: updated.is_required === 1,
        config: JSON.parse(updated.config || "{}"),
        createdAt: updated.created_at,
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update skill" }, { status: 500 });
  }
}

/**
 * DELETE /api/realms/[id]/skills/[skillId] — remove a skill from the realm.
 * Requires realm admin or global admin.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id, skillId } = await ctx.params;
    if (!auth.canAdminRealm(id)) return forbidden();

    const skill = getRealmSkillById(skillId);
    if (!skill || skill.realm_id !== id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    deleteRealmSkill(skillId);
    broadcastSkillsConfig(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete skill" }, { status: 500 });
  }
}

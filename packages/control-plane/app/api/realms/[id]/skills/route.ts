import { NextRequest, NextResponse } from "next/server";
import {
  getRealmById,
  getRealmSkills,
  createRealmSkill,
} from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { broadcastSkillsConfig } from "@/lib/ws-server";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/realms/[id]/skills — list all skills defined for a realm.
 * Requires realm membership.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    if (!auth.canAccessRealm(id)) return forbidden();

    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const skills = getRealmSkills(id).map((s) => ({
      id: s.id,
      realmId: s.realm_id,
      name: s.name,
      description: s.description,
      version: s.version,
      isRequired: s.is_required === 1,
      config: JSON.parse(s.config || "{}"),
      createdAt: s.created_at,
    }));

    return NextResponse.json({ skills });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch realm skills" }, { status: 500 });
  }
}

/**
 * POST /api/realms/[id]/skills — register a skill for this realm.
 * Requires realm admin or global admin.
 * Body: { name, description?, version?, isRequired?, config? }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    if (!auth.canAdminRealm(id)) return forbidden();

    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json() as {
      name?: string;
      description?: string;
      version?: string;
      isRequired?: boolean;
      config?: Record<string, unknown>;
    };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const skill = createRealmSkill({
      realmId: id,
      name: body.name.trim(),
      description: body.description?.trim(),
      version: body.version?.trim(),
      isRequired: body.isRequired ?? false,
      config: body.config ?? {},
    });

    // Push updated skills config to all agents in this realm
    broadcastSkillsConfig(id);

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
    }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message?.includes("UNIQUE")) {
      return NextResponse.json({ error: "A skill with this name already exists in this realm" }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: "Failed to create realm skill" }, { status: 500 });
  }
}

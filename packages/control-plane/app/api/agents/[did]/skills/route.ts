import { NextRequest, NextResponse } from "next/server";
import {
  getAgent,
  getAgentEffectiveSkills,
  getRealmSkillById,
  setAgentSkillOverride,
} from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { sendSkillsConfig } from "@/lib/ws-server";

type Ctx = { params: Promise<{ did: string }> };

/**
 * GET /api/agents/[did]/skills — get effective skill configuration for an agent.
 * Returns realm-defined skills merged with per-agent overrides.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { did } = await ctx.params;
    if (!auth.canAccessAgent(did)) return forbidden();

    const agent = getAgent(did);
    if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const skills = getAgentEffectiveSkills(did);
    return NextResponse.json({ skills });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch agent skills" }, { status: 500 });
  }
}

/**
 * PATCH /api/agents/[did]/skills — update an agent's skill override.
 * Only applicable to non-required skills.
 * Body: { realmSkillId, enabled }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { did } = await ctx.params;
    if (!auth.canAdminAgent(did)) return forbidden();

    const agent = getAgent(did);
    if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json() as { realmSkillId?: string; enabled?: boolean };
    if (!body.realmSkillId) {
      return NextResponse.json({ error: "realmSkillId is required" }, { status: 400 });
    }
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
    }

    const skill = getRealmSkillById(body.realmSkillId);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }
    if (skill.is_required === 1 && !body.enabled) {
      return NextResponse.json({ error: "Cannot disable a required skill" }, { status: 400 });
    }

    setAgentSkillOverride(did, body.realmSkillId, body.enabled);

    // Push updated skills config directly to this agent if connected
    sendSkillsConfig(did);

    return NextResponse.json({ skills: getAgentEffectiveSkills(did) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update agent skill override" }, { status: 500 });
  }
}

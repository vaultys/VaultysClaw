import { NextRequest, NextResponse } from "next/server";
import {
  getRealmById, updateRealm, deleteRealm,
  getRealmAgents, getRealmUsers, getRealmTokenUsage, listWorkflows,
} from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/realms/[id] — realm detail. Requires auth and realm membership.
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (!auth.canAccessRealm(id)) return forbidden();

    const agents = getRealmAgents(id);
    const users = getRealmUsers(id);
    const tokenUsage = getRealmTokenUsage(id);
    const workflows = listWorkflows(undefined, id).map((w) => ({
      id: w.id,
      name: w.name,
      description: w.description,
      createdAt: w.created_at,
      updatedAt: w.updated_at,
    }));

    return NextResponse.json({
      realm,
      agents,
      users,
      workflows,
      tokenUsage: tokenUsage ? {
        promptTokens: tokenUsage.prompt_tokens,
        completionTokens: tokenUsage.completion_tokens,
      } : null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch realm" }, { status: 500 });
  }
}

/**
 * PATCH /api/realms/[id] — update realm metadata or config. Global admin only.
 * Body: { name?, description?, color?, llmConfig?, defaultCapabilities? }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await ctx.params;
    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json() as {
      name?: string;
      description?: string;
      color?: string;
      llmConfig?: object | null;
      defaultCapabilities?: string[];
      tokenBudgetDaily?: number | null;
      tokenBudgetMonthly?: number | null;
      allowedCapabilities?: string[] | null;
    };

    const updates: Parameters<typeof updateRealm>[1] = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.color !== undefined) updates.color = body.color;
    if ("llmConfig" in body) updates.llm_config = body.llmConfig !== null ? JSON.stringify(body.llmConfig) : null;
    if (body.defaultCapabilities !== undefined) updates.default_capabilities = JSON.stringify(body.defaultCapabilities);
    if ("tokenBudgetDaily" in body) updates.token_budget_daily = body.tokenBudgetDaily ?? null;
    if ("tokenBudgetMonthly" in body) updates.token_budget_monthly = body.tokenBudgetMonthly ?? null;
    if ("allowedCapabilities" in body) updates.allowed_capabilities = body.allowedCapabilities !== null && body.allowedCapabilities !== undefined ? JSON.stringify(body.allowedCapabilities) : null;

    updateRealm(id, updates);

    return NextResponse.json({ realm: getRealmById(id) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update realm" }, { status: 500 });
  }
}

/**
 * DELETE /api/realms/[id] — delete realm (not allowed for default realm). Global admin only.
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await ctx.params;
    const ok = deleteRealm(id);
    if (!ok) {
      return NextResponse.json({ error: "Cannot delete the default realm" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to delete realm" }, { status: 500 });
  }
}

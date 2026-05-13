import { NextRequest, NextResponse } from "next/server";
import {
  getRealmById, updateRealm, deleteRealm,
  getRealmAgents, getRealmUsers, getRealmTokenUsage,
} from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/realms/[id] — realm detail with members and token usage
 */
export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const agents = getRealmAgents(id);
    const users = getRealmUsers(id);
    const tokenUsage = getRealmTokenUsage(id);

    return NextResponse.json({
      realm,
      agents,
      users,
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
 * PATCH /api/realms/[id] — update realm metadata or config
 * Body: { name?, description?, color?, llmConfig?, defaultCapabilities? }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json() as {
      name?: string;
      description?: string;
      color?: string;
      llmConfig?: object | null;
      defaultCapabilities?: string[];
    };

    const updates: Parameters<typeof updateRealm>[1] = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.description !== undefined) updates.description = body.description;
    if (body.color !== undefined) updates.color = body.color;
    if ("llmConfig" in body) updates.llm_config = body.llmConfig !== null ? JSON.stringify(body.llmConfig) : null;
    if (body.defaultCapabilities !== undefined) updates.default_capabilities = JSON.stringify(body.defaultCapabilities);

    updateRealm(id, updates);

    return NextResponse.json({ realm: getRealmById(id) });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update realm" }, { status: 500 });
  }
}

/**
 * DELETE /api/realms/[id] — delete realm (not allowed for default realm)
 */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
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

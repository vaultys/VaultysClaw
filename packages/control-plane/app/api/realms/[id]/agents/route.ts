import { NextRequest, NextResponse } from "next/server";
import {
  getRealmById,
  addAgentToRealm,
  removeAgentFromRealm,
  getAgent,
  getRealmRouterKey,
  getModelsByRealm,
  setAgentLlmConfig,
} from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { isLiteLLMConfigured, getLiteLLMBaseUrl } from "@/lib/litellm-client";
import { getWSServer } from "@/lib/ws-server";
import type { LlmConfig } from "@vaultysclaw/shared";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/realms/[id]/agents — add an agent to this realm. Realm admin or global admin.
 * Body: { agentDid, isPrimary? }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    if (!auth.canAdminRealm(id)) return forbidden();

    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Realm not found" }, { status: 404 });

    const body = await req.json() as { agentDid?: string; isPrimary?: boolean };
    if (!body.agentDid) return NextResponse.json({ error: "agentDid is required" }, { status: 400 });

    const agent = getAgent(body.agentDid);
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    addAgentToRealm(body.agentDid, id, body.isPrimary ?? false);

    // Auto-push LiteLLM config if the realm has a virtual key and accessible models
    let llmPushed = false;
    if (isLiteLLMConfigured()) {
      try {
        const routerKey = getRealmRouterKey(id);
        if (routerKey?.litellm_virtual_key) {
          const models = getModelsByRealm(id).filter(
            (m) => m.status === "active" && m.litellm_model_name,
          );
          const firstModel = models[0];
          if (firstModel?.litellm_model_name) {
            const config: LlmConfig = {
              provider: "openai-compatible",
              baseUrl: getLiteLLMBaseUrl(),
              apiKey: routerKey.litellm_virtual_key,
              model: firstModel.litellm_model_name,
            };
            setAgentLlmConfig(body.agentDid, config);
            const wsServer = getWSServer();
            llmPushed = wsServer?.sendLlmConfig(body.agentDid, config) ?? false;
          }
        }
      } catch (e) {
        console.warn("LiteLLM agent config push failed (non-fatal):", e);
      }
    }

    return NextResponse.json({ ok: true, llmPushed });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to add agent to realm" }, { status: 500 });
  }
}

/**
 * DELETE /api/realms/[id]/agents — remove an agent from this realm. Realm admin or global admin.
 * Body: { agentDid }
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    if (!auth.canAdminRealm(id)) return forbidden();

    const body = await req.json() as { agentDid?: string };
    if (!body.agentDid) return NextResponse.json({ error: "agentDid is required" }, { status: 400 });

    const ok = removeAgentFromRealm(body.agentDid, id);
    if (!ok) return NextResponse.json({ error: "Cannot remove agent from the default realm" }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove agent from realm" }, { status: 500 });
  }
}

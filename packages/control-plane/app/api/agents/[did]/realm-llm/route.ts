/**
 * GET /api/agents/[did]/realm-llm
 * Returns the agent's realm LiteLLM routing options:
 * - which realms the agent belongs to
 * - whether each realm has a virtual key
 * - which models are accessible per realm
 * Used by the agent ConfigTab to present "Realm Routing" mode.
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { getAgent, getAgentRealms, getRealmRouterKey, getModelsByRealm } from "@/lib/db";
import { isLiteLLMConfigured, getLiteLLMBaseUrl } from "@/lib/litellm-client";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { did } = await params;
  const agent = getAgent(did);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const litellmConfigured = isLiteLLMConfigured();
  const litellmBaseUrl = getLiteLLMBaseUrl();

  const memberships = getAgentRealms(did);
  const realms = memberships.map((m) => {
    const routerKey = getRealmRouterKey(m.realm_id);
    const models = getModelsByRealm(m.realm_id)
      .filter((model) => model.status === "active" && model.litellm_model_name)
      .map((model) => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        modelId: model.model_id,
        litellmModelName: model.litellm_model_name,
      }));

    return {
      realmId: m.realm_id,
      realmName: m.name,
      isPrimary: Boolean(m.is_primary),
      hasVirtualKey: Boolean(routerKey?.litellm_virtual_key),
      models,
    };
  });

  return NextResponse.json({
    litellmConfigured,
    litellmBaseUrl,
    realms,
  });
}

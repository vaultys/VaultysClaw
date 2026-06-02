/**
 * GET    /api/agents/[did]/llm-config  — Return stored LLM config (key masked). Admin-only.
 * PUT    /api/agents/[did]/llm-config  — Set/update LLM config and push to agent if online. Admin-only.
 * DELETE /api/agents/[did]/llm-config  — Clear LLM config (agent falls back to env vars). Admin-only.
 */

import { NextRequest, NextResponse } from "next/server";
import { getAgent, setAgentLlmConfig, getModelRegistryEntry, getRealmRouterKey, getModelsByRealm } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { getWSServer } from "@/lib/ws-server";
import { getLiteLLMBaseUrl } from "@/lib/litellm-client";
import type { LlmConfig, LlmProviderType } from "@vaultysclaw/shared";

const VALID_PROVIDERS: LlmProviderType[] = [
  "openai",
  "anthropic",
  "google",
  "ollama",
  "openai-compatible",
];

function validateConfig(body: unknown): { config: LlmConfig; error?: never } | { error: string; config?: never } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!VALID_PROVIDERS.includes(b.provider as LlmProviderType)) {
    return { error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` };
  }
  if (typeof b.model !== "string" || b.model.trim() === "") {
    return { error: "model must be a non-empty string" };
  }
  if (b.apiKey !== undefined && typeof b.apiKey !== "string") {
    return { error: "apiKey must be a string" };
  }
  if (b.baseUrl !== undefined && typeof b.baseUrl !== "string") {
    return { error: "baseUrl must be a string" };
  }
  if (b.systemPrompt !== undefined && typeof b.systemPrompt !== "string") {
    return { error: "systemPrompt must be a string" };
  }
  if (b.maxTokens !== undefined && (typeof b.maxTokens !== "number" || b.maxTokens < 1)) {
    return { error: "maxTokens must be a positive number" };
  }

  const config: LlmConfig = {
    provider: b.provider as LlmProviderType,
    model: (b.model as string).trim(),
    apiKey: b.apiKey ? (b.apiKey as string).trim() : undefined,
    baseUrl: b.baseUrl ? (b.baseUrl as string).trim() : undefined,
    systemPrompt: b.systemPrompt ? (b.systemPrompt as string).trim() : undefined,
    maxTokens: b.maxTokens as number | undefined,
  };

  return { config };
}

/** Strip the apiKey from the response — it is write-only */
function safeConfig(config: LlmConfig): Omit<LlmConfig, "apiKey"> & { apiKeySet: boolean } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { apiKey, ...rest } = config;
  return { ...rest, apiKeySet: Boolean(apiKey) };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did } = await params;
  const agent = getAgent(did);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (!agent.llm_config) {
    return NextResponse.json({ config: null });
  }

  try {
    const config = JSON.parse(agent.llm_config) as LlmConfig;
    return NextResponse.json({ config: safeConfig(config) });
  } catch {
    return NextResponse.json({ config: null });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did } = await params;
  const agent = getAgent(did);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null) as Record<string, unknown> | null;

  // Realm routing shortcut — resolve virtual key + litellm model name server-side
  if (body && typeof body.realmId === "string" && typeof body.realmModelId === "string") {
    const routerKey = getRealmRouterKey(body.realmId);
    if (!routerKey?.litellm_virtual_key) {
      return NextResponse.json({ error: "Realm has no LiteLLM virtual key configured" }, { status: 400 });
    }
    const realmModels = getModelsByRealm(body.realmId);
    const model = realmModels.find((m) => m.id === body.realmModelId);
    if (!model?.litellm_model_name) {
      return NextResponse.json({ error: "Model not found in realm or not registered with LiteLLM" }, { status: 404 });
    }
    const config: LlmConfig = {
      provider: "openai-compatible",
      baseUrl: getLiteLLMBaseUrl(),
      apiKey: routerKey.litellm_virtual_key,
      model: model.litellm_model_name,
    };
    setAgentLlmConfig(did, config);
    const wsServer = getWSServer();
    const pushed = wsServer?.sendLlmConfig(did, config) ?? false;
    return NextResponse.json({ ok: true, pushed, config: safeConfig(config) });
  }

  // Registry model shortcut — resolve full config server-side so the API key never touches the client
  if (body && typeof body.registryModelId === "string") {
    const entry = getModelRegistryEntry(body.registryModelId);
    if (!entry) {
      return NextResponse.json({ error: "Registry model not found" }, { status: 404 });
    }
    const config: LlmConfig = {
      provider: VALID_PROVIDERS.includes(entry.provider as LlmProviderType)
        ? (entry.provider as LlmProviderType)
        : "openai-compatible",
      model: entry.model_id,
      baseUrl: entry.base_url,
      apiKey: entry.api_key_enc ?? undefined,
    };
    setAgentLlmConfig(did, config);
    const wsServer = getWSServer();
    const pushed = wsServer?.sendLlmConfig(did, config) ?? false;
    return NextResponse.json({ ok: true, pushed, config: safeConfig(config) });
  }

  const validation = validateConfig(body);
  if (validation.error || !validation.config) {
    return NextResponse.json({ error: validation.error ?? "Invalid config" }, { status: 400 });
  }

  const config: LlmConfig = { ...validation.config };

  // If the user omitted apiKey on an update but one was already stored, preserve it
  if (!config.apiKey) {
    try {
      const existing = agent.llm_config ? (JSON.parse(agent.llm_config) as LlmConfig) : null;
      if (existing?.apiKey) config.apiKey = existing.apiKey;
    } catch {
      // ignore
    }
  }

  setAgentLlmConfig(did, config);

  // Push to agent if currently connected
  const wsServer = getWSServer();
  const pushed = wsServer?.sendLlmConfig(did, config) ?? false;

  return NextResponse.json({
    ok: true,
    pushed,
    config: safeConfig(config),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ did: string }> },
) {
  const auth = await getAuthContext(_req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const { did } = await params;
  const agent = getAgent(did);
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  setAgentLlmConfig(did, null);

  // Push a "clear" message to agent if connected
  const wsServer = getWSServer();
  const pushed = wsServer?.sendLlmConfig(did, null) ?? false;

  return NextResponse.json({ ok: true, pushed });
}

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getWSServer } from "@/lib/ws-server";
import { getLiteLLMBaseUrl } from "@/lib/litellm-client";
import type { LlmConfig, LlmProviderType } from "@vaultysclaw/shared";
import { AgentDAO, ModelDAO, RealmDAO } from "@/db";
import { agentsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const VALID_PROVIDERS: LlmProviderType[] = [
  "openai",
  "anthropic",
  "google",
  "ollama",
  "openai-compatible",
];

function validateConfig(
  body: Record<string, unknown>
): { config: LlmConfig } | { error: string } {
  if (!VALID_PROVIDERS.includes(body.provider as LlmProviderType)) {
    return { error: `provider must be one of: ${VALID_PROVIDERS.join(", ")}` };
  }
  if (typeof body.model !== "string" || body.model.trim() === "") {
    return { error: "model must be a non-empty string" };
  }
  if (body.apiKey !== undefined && typeof body.apiKey !== "string") {
    return { error: "apiKey must be a string" };
  }
  if (body.baseUrl !== undefined && typeof body.baseUrl !== "string") {
    return { error: "baseUrl must be a string" };
  }
  if (
    body.systemPrompt !== undefined &&
    typeof body.systemPrompt !== "string"
  ) {
    return { error: "systemPrompt must be a string" };
  }
  if (
    body.maxTokens !== undefined &&
    (typeof body.maxTokens !== "number" || body.maxTokens < 1)
  ) {
    return { error: "maxTokens must be a positive number" };
  }
  if (
    body.disableStreamingBuffer !== undefined &&
    typeof body.disableStreamingBuffer !== "boolean"
  ) {
    return { error: "disableStreamingBuffer must be a boolean" };
  }
  return {
    config: {
      provider: body.provider as LlmProviderType,
      model: (body.model as string).trim(),
      apiKey: body.apiKey ? (body.apiKey as string).trim() : undefined,
      baseUrl: body.baseUrl ? (body.baseUrl as string).trim() : undefined,
      systemPrompt: body.systemPrompt
        ? (body.systemPrompt as string).trim()
        : undefined,
      maxTokens: body.maxTokens as number | undefined,
      disableStreamingBuffer: body.disableStreamingBuffer as boolean | undefined,
    },
  };
}

function safeConfig(
  config: LlmConfig
): Omit<LlmConfig, "apiKey"> & { apiKeySet: boolean } {
  const { apiKey, ...rest } = config;
  return { ...rest, apiKeySet: Boolean(apiKey) };
}

const handlers = createNextRoute(agentsContract, {
  getLlmConfig: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { did } = params;
    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND");

    if (!agent.llmConfig) return { status: 200, body: { config: null } };

    try {
      const config = agent.llmConfig as unknown as LlmConfig;
      return { status: 200, body: { config: safeConfig(config) } };
    } catch {
      return { status: 200, body: { config: null } };
    }
  },

  setLlmConfig: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { did } = params;
    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND");

    // Realm routing shortcut
    if (
      typeof body.realmId === "string" &&
      typeof body.realmModelId === "string"
    ) {
      const routerKey = await RealmDAO.getRouterKey(body.realmId as string);
      if (!routerKey?.litellmVirtualKey)
        throw new APIException(
          "MALFORMED",
          "Realm has no LiteLLM virtual key configured"
        );
      const realmModels = await ModelDAO.findByRealm(body.realmId as string);
      const model = realmModels.find((m) => m.id === body.realmModelId);
      if (!model?.litellmModelName)
        throw new APIException(
          "NOT_FOUND",
          "Model not found in realm or not registered with LiteLLM"
        );
      const config: LlmConfig = {
        provider: "openai-compatible",
        baseUrl: getLiteLLMBaseUrl(),
        apiKey: routerKey.litellmVirtualKey,
        model: model.litellmModelName,
      };
      await AgentDAO.setLlmConfig(did, config);
      const pushed = getWSServer()
        ? await getWSServer()!.sendLlmConfig(did, config)
        : false;
      return { status: 200, body: { pushed, config: safeConfig(config) } };
    }

    // Registry model shortcut
    if (typeof body.registryModelId === "string") {
      const entry = await ModelDAO.findByIdUnsafe(
        body.registryModelId as string
      );
      if (!entry)
        throw new APIException("NOT_FOUND", "Registry model not found");
      const config: LlmConfig = {
        provider: VALID_PROVIDERS.includes(entry.provider as LlmProviderType)
          ? (entry.provider as LlmProviderType)
          : "openai-compatible",
        model: entry.modelId,
        baseUrl: entry.baseUrl,
        apiKey: entry.apiKeyEnc ?? undefined,
      };
      await AgentDAO.setLlmConfig(did, config);
      const pushed = getWSServer()
        ? await getWSServer()!.sendLlmConfig(did, config)
        : false;
      return { status: 200, body: { pushed, config: safeConfig(config) } };
    }

    const validation = validateConfig(body);
    if ("error" in validation)
      throw new APIException("MALFORMED", validation.error);

    const config: LlmConfig = { ...validation.config };

    // Preserve existing apiKey if omitted on update
    if (!config.apiKey) {
      try {
        const existing = agent.llmConfig
          ? (agent.llmConfig as unknown as LlmConfig)
          : null;
        if (existing?.apiKey) config.apiKey = existing.apiKey;
      } catch {
        // ignore
      }
    }

    await AgentDAO.setLlmConfig(did, config);
    const wsServer = getWSServer();
    const pushed = wsServer ? await wsServer.sendLlmConfig(did, config) : false;

    return { status: 200, body: { pushed, config: safeConfig(config) } };
  },

  deleteLlmConfig: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const { did } = params;
    const agent = await AgentDAO.findByDid(did);
    if (!agent) throw new APIException("NOT_FOUND", "Agent not found");

    await AgentDAO.setLlmConfig(did, null);
    const wsServer = getWSServer();
    const pushed = wsServer ? await wsServer.sendLlmConfig(did, null) : false;

    return { status: 200, body: { pushed } };
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;
export const DELETE = handlers.DELETE!;

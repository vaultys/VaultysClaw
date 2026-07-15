import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { registerModel, isLiteLLMConfigured } from "@/lib/litellm-client";
import { ModelDAO } from "@/db";
import { modelsContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { isSdkAgentProvider, type LlmProviderType } from "@vaultysclaw/shared";

const handlers = createNextRoute(modelsContract, {
  // ── GET /api/models — list registry entries (admin only) ──────────────────
  list: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const models = await ModelDAO.findAll();
    return { status: 200, body: { models } };
  },

  // ── POST /api/models — register a new model (admin only) ──────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (!body.name.trim())
      throw new APIException("MALFORMED", "Name is required");
    if (!body.provider.trim())
      throw new APIException("MALFORMED", "Provider is required");
    if (!body.modelId.trim())
      throw new APIException("MALFORMED", "modelId is required");

    // SDK-agent providers (claude-agent-sdk, cursor-agent-sdk, openai-agent-sdk)
    // run a local vendor harness, not an OpenAI-compatible network endpoint —
    // no baseUrl to speak of, and they can never be proxied through LiteLLM.
    const isSdkAgent = isSdkAgentProvider(body.provider.trim() as LlmProviderType);
    if (!isSdkAgent && !body.baseUrl?.trim())
      throw new APIException("MALFORMED", "baseUrl is required");

    const entry = await ModelDAO.create({
      name: body.name.trim(),
      description: body.description?.trim(),
      provider: body.provider.trim(),
      modelId: body.modelId.trim(),
      baseUrl: isSdkAgent ? "" : body.baseUrl!.trim(),
      apiKeyEnc: body.apiKey?.trim() || undefined,
      createdBy: auth.did,
    });

    // Register with LiteLLM if available and not opted out (never for SDK-agent
    // providers — there is no wire-compatible endpoint to register).
    let litellmRegistered = false;
    if (
      !isSdkAgent &&
      !body.skipLiteLLM &&
      isLiteLLMConfigured() &&
      entry.litellmModelName
    ) {
      try {
        await registerModel({
          modelName: entry.litellmModelName,
          litellmModel: `openai/${entry.modelId}`,
          apiBase: entry.baseUrl,
          apiKey: body.apiKey?.trim() || undefined,
        });
        litellmRegistered = true;
      } catch (litellmErr) {
        console.warn("LiteLLM registration failed (non-fatal):", litellmErr);
      }
    }

    // Never expose the stored (encrypted) API key.
    const { apiKeyEnc: _apiKeyEnc, ...safe } = entry;
    return { status: 201, body: { model: { ...safe, litellmRegistered } } };
  },
});

export const GET = handlers.GET!;
export const POST = handlers.POST!;

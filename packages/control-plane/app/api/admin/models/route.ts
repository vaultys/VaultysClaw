import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { registerModel, isLiteLLMConfigured } from "@/lib/litellm-client";
import { ModelDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(adminContract.models, {
  // ── GET /api/admin/models — list registry entries (admin only) ──────────────────
  list: async () => {
    const models = await ModelDAO.findAll();
    return { status: 200, body: { models } };
  },

  // ── POST /api/admin/models — register a new model (admin only) ──────────────────
  create: async ({ body, request }) => {
    const auth = await getAuthContext(request);

    if (!body.name.trim())
      throw new APIException("MALFORMED", "Name is required");
    if (!body.provider.trim())
      throw new APIException("MALFORMED", "Provider is required");
    if (!body.modelId.trim())
      throw new APIException("MALFORMED", "modelId is required");
    if (!body.baseUrl.trim())
      throw new APIException("MALFORMED", "baseUrl is required");

    const entry = await ModelDAO.create({
      name: body.name.trim(),
      description: body.description?.trim(),
      provider: body.provider.trim(),
      modelId: body.modelId.trim(),
      baseUrl: body.baseUrl.trim(),
      apiKeyEnc: body.apiKey?.trim() || undefined,
      createdBy: auth.did,
    });

    // Register with LiteLLM if available and not opted out.
    let litellmRegistered = false;
    if (!body.skipLiteLLM && isLiteLLMConfigured() && entry.litellmModelName) {
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

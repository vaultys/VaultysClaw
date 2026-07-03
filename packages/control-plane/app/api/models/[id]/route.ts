import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { ModelDAO } from "@/db";
import {
  adminContract,
} from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  registerModel,
  removeModel,
  isLiteLLMConfigured,
} from "@/lib/litellm-client";

const handlers = createNextRoute(adminContract.models, {
  // ── GET /api/models/:id — model detail with workspace access ──────────────────
  getOne: async ({ params, request }) => {
    await getAuthContext(request);

    const entry = await ModelDAO.findById(params.id);
    if (!entry) throw new APIException("NOT_FOUND", "Model not found");
    return {
      status: 200,
      body: { model: { ...entry } },
    };
  },

  // ── PUT /api/models/:id — update an entry (admin only) ────────────────────
  update: async ({ params, body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const entry = await ModelDAO.findById(params.id);
    if (!entry) throw new APIException("NOT_FOUND", "Model not found");

    const updated = await ModelDAO.update(params.id, {
      name: body.name?.trim(),
      description:
        body.description !== undefined
          ? body.description?.trim() || null
          : undefined,
      provider: body.provider?.trim(),
      modelId: body.modelId?.trim(),
      baseUrl: body.baseUrl?.trim(),
      apiKeyEnc:
        body.apiKey !== undefined ? body.apiKey?.trim() || null : undefined,
      status: body.status,
    });
    if (
      updated &&
      isLiteLLMConfigured() &&
      updated.litellmModelName &&
      (body.baseUrl || body.modelId || body.apiKey !== undefined)
    ) {
      try {
        await registerModel({
          modelName: updated.litellmModelName,
          litellmModel: `openai/${updated.modelId}`,
          apiBase: updated.baseUrl,
          apiKey: updated.apiKeyEnc ?? undefined,
        });
      } catch (e) {
        console.warn("LiteLLM sync failed (non-fatal):", e);
      }
    }

    return { status: 200, body: { model: updated } };
  },

  // ── DELETE /api/models/:id — remove an entry (admin only) ─────────────────
  remove: async ({ params, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const entry = await ModelDAO.findById(params.id);
    if (!entry) throw new APIException("NOT_FOUND", "Model not found");

    if (isLiteLLMConfigured() && entry.litellmModelName) {
      try {
        await removeModel(entry.litellmModelName);
      } catch (e) {
        console.warn("LiteLLM removal failed (non-fatal):", e);
      }
    }

    const deleted = await ModelDAO.delete(params.id);
    return { status: 200, body: { model: deleted } };
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;
export const DELETE = handlers.DELETE!;

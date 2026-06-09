import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api/utils/api-utils";
import { isLiteLLMConfigured, listModels } from "@/lib/litellm-client";
import { withError } from "@/lib/api/handlers/with-error";

/** GET /api/litellm/models — list available models in LiteLLM. Admin only. */
export const GET = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  if (!isLiteLLMConfigured()) {
    return NextResponse.json(
      { models: [], configured: false },
      { status: 200 }
    );
  }

  const models = await listModels();
  return NextResponse.json({
    models: models.map((m) => ({
      name: m.model_name,
      params: m.litellm_params,
    })),
    configured: true,
  });
});

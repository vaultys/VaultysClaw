import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api-utils";
import { isLiteLLMConfigured, listModels } from "@/lib/litellm-client";

/** GET /api/litellm/models — list available models in LiteLLM. Admin only. */
export async function GET(request: NextRequest) {
  try {
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
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Failed to fetch LiteLLM models" },
      { status: 500 }
    );
  }
}

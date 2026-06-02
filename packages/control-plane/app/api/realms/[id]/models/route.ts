import { NextRequest, NextResponse } from "next/server";
import { getRealmById, getModelsByRealm, getRealmRouterKey } from "@/lib/db";
import { getAuthContext, unauthorized } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/realms/[id]/models — list models available to a realm + router key info */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();

    const { id } = await params;
    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const models = getModelsByRealm(id).map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      provider: m.provider,
      modelId: m.model_id,
      litellmModelName: m.litellm_model_name,
      status: m.status,
    }));

    const routerKey = getRealmRouterKey(id);

    return NextResponse.json({
      models,
      routerKey: routerKey
        ? {
            hasVirtualKey: Boolean(routerKey.litellm_virtual_key),
            allowedModels: JSON.parse(routerKey.allowed_model_ids),
            monthlyBudgetUsd: routerKey.monthly_budget_usd,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch realm models" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import {
  getModelRegistryEntry,
  getModelRealmAccess,
  grantModelRealmAccess,
  revokeModelRealmAccess,
  getAllRealms,
  getRealmRouterKey,
  upsertRealmRouterKey,
} from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { createRealmKey, isLiteLLMConfigured } from "@/lib/litellm-client";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/models/[id]/realms — list realms with access to this model */
export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    if (!getModelRegistryEntry(id)) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const access = getModelRealmAccess(id);
    const allRealms = getAllRealms();

    return NextResponse.json({
      realms: access.map((ra) => {
        const realm = allRealms.find((r) => r.id === ra.realm_id);
        return { realmId: ra.realm_id, realmName: realm?.name ?? ra.realm_id, grantedAt: ra.granted_at };
      }),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch realm access" }, { status: 500 });
  }
}

/** POST /api/models/[id]/realms — grant realm access. Body: { realmId } */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    const entry = getModelRegistryEntry(id);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json() as { realmId?: string };
    if (!body.realmId) return NextResponse.json({ error: "realmId is required" }, { status: 400 });

    grantModelRealmAccess(id, body.realmId);

    // Update realm router key to include this model
    if (isLiteLLMConfigured() && entry.litellm_model_name) {
      try {
        const existing = getRealmRouterKey(body.realmId);
        const currentModels: string[] = existing ? JSON.parse(existing.allowed_model_ids) : [];
        if (!currentModels.includes(entry.litellm_model_name)) {
          const updatedModels = [...currentModels, entry.litellm_model_name];
          const { virtualKey } = await createRealmKey(body.realmId, updatedModels, existing?.monthly_budget_usd ?? undefined);
          upsertRealmRouterKey(body.realmId, { litellmVirtualKey: virtualKey, allowedModelIds: updatedModels });
        }
      } catch (e) {
        console.warn("LiteLLM realm key update failed (non-fatal):", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to grant realm access" }, { status: 500 });
  }
}

/** DELETE /api/models/[id]/realms/[realmId] is in a sub-route; support via query param here */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const { id } = await params;
    const entry = getModelRegistryEntry(id);
    if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const realmId = searchParams.get("realmId");
    if (!realmId) return NextResponse.json({ error: "realmId query param required" }, { status: 400 });

    revokeModelRealmAccess(id, realmId);

    // Update realm router key to remove this model
    if (isLiteLLMConfigured() && entry.litellm_model_name) {
      try {
        const existing = getRealmRouterKey(realmId);
        if (existing) {
          const currentModels: string[] = JSON.parse(existing.allowed_model_ids);
          const updatedModels = currentModels.filter((m) => m !== entry.litellm_model_name);
          const { virtualKey } = await createRealmKey(realmId, updatedModels, existing.monthly_budget_usd ?? undefined);
          upsertRealmRouterKey(realmId, { litellmVirtualKey: virtualKey, allowedModelIds: updatedModels });
        }
      } catch (e) {
        console.warn("LiteLLM realm key update failed (non-fatal):", e);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to revoke realm access" }, { status: 500 });
  }
}

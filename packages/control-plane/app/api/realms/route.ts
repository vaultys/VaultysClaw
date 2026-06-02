import { NextRequest, NextResponse } from "next/server";
import { getAllRealms, createRealm, getRealmBySlug, getRealmAgents, getRealmUsers, listWorkflows, getUserRealms } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

/**
 * GET /api/realms — list realms. Admins see all; members see only their realms.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthContext(request);
    if (!auth) return unauthorized();

    const allRealms = getAllRealms();
    const userRealmIds = auth.isGlobalAdmin
      ? null
      : new Set(getUserRealms(auth.did).map((r) => r.realm_id));

    const realmsWithCounts = allRealms
      .filter((realm) => userRealmIds === null || userRealmIds.has(realm.id))
      .map((realm) => {
        const agents = getRealmAgents(realm.id);
        const users = getRealmUsers(realm.id);
        const workflows = listWorkflows(undefined, realm.id);
        return {
          ...realm,
          agentCount: agents.length,
          userCount: users.length,
          workflowCount: workflows.length,
        };
      });
    return NextResponse.json({ realms: realmsWithCounts });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch realms" }, { status: 500 });
  }
}

/**
 * POST /api/realms — create a new realm. Global admin only.
 * Body: { name, slug, description?, color? }
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthContext(req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

    const body = await req.json() as { name?: string; slug?: string; description?: string; color?: string };

    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const slug = (body.slug ?? body.name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    if (!slug) {
      return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
    }

    const existing = getRealmBySlug(slug);
    if (existing) {
      return NextResponse.json({ error: "A realm with this slug already exists" }, { status: 409 });
    }

    const realm = createRealm({
      name: body.name.trim(),
      slug,
      description: body.description?.trim() || undefined,
      color: body.color ?? "#6366f1",
    });

    return NextResponse.json({ realm }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create realm" }, { status: 500 });
  }
}

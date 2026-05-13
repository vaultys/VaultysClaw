import { NextRequest, NextResponse } from "next/server";
import { getAllRealms, createRealm, getRealmBySlug, getRealmAgents, getRealmUsers, listWorkflows } from "@/lib/db";

/**
 * GET /api/realms — list all realms with member counts
 */
export async function GET() {
  try {
    const realms = getAllRealms();
    const realmsWithCounts = realms.map((realm) => {
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
 * POST /api/realms — create a new realm
 * Body: { name, slug, description?, color? }
 */
export async function POST(req: NextRequest) {
  try {
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

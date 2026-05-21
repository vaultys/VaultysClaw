import { NextRequest, NextResponse } from "next/server";
import { getAllSkillsWithRealms, createRealmSkill, getAllRealms } from "@/lib/db";
import { broadcastSkillsConfig } from "@/lib/ws-server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

export async function GET() {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const rows = getAllSkillsWithRealms();
  return NextResponse.json(rows);
}

export async function POST(request: NextRequest) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = await request.json();
  const { realmId, name, description, version, isRequired, config } = body;

  if (!realmId || typeof realmId !== "string") {
    return NextResponse.json({ error: "realmId is required" }, { status: 400 });
  }
  if (!name || typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  const realms = getAllRealms();
  if (!realms.find((r) => r.id === realmId)) {
    return NextResponse.json({ error: "Realm not found" }, { status: 404 });
  }

  try {
    const skill = createRealmSkill({
      realmId,
      name: name.trim(),
      description: description?.trim() || undefined,
      version: version?.trim() || undefined,
      isRequired: isRequired === true,
      config: config && typeof config === "object" ? config : {},
      content: typeof body.content === "string" ? body.content || null : undefined,
    });
    broadcastSkillsConfig(realmId);
    return NextResponse.json(skill, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE")) {
      return NextResponse.json({ error: `Skill "${name}" already exists in this realm` }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create skill" }, { status: 500 });
  }
}

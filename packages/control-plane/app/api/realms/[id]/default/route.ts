import { NextRequest, NextResponse } from "next/server";
import { getRealmById, setDefaultRealm } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/realms/[id]/default — make this realm the default
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Realm not found" }, { status: 404 });

    setDefaultRealm(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to set default realm" }, { status: 500 });
  }
}

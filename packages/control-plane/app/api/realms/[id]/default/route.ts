import { NextRequest, NextResponse } from "next/server";
import { getRealmById, setDefaultRealm } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/realms/[id]/default — make this realm the default. Global admin only.
 */
export async function POST(_req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext(_req);
    if (!auth) return unauthorized();
    if (!auth.isGlobalAdmin) return forbidden();

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

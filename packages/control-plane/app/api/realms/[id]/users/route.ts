import { NextRequest, NextResponse } from "next/server";
import { getRealmById, addUserToRealm, removeUserFromRealm } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/realms/[id]/users — add a user to this realm
 * Body: { userDid, isPrimary? }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Realm not found" }, { status: 404 });

    const body = await req.json() as { userDid?: string; isPrimary?: boolean };
    if (!body.userDid) return NextResponse.json({ error: "userDid is required" }, { status: 400 });

    addUserToRealm(body.userDid, id, body.isPrimary ?? false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to add user to realm" }, { status: 500 });
  }
}

/**
 * DELETE /api/realms/[id]/users — remove a user from this realm
 * Body: { userDid }
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const body = await req.json() as { userDid?: string };
    if (!body.userDid) return NextResponse.json({ error: "userDid is required" }, { status: 400 });

    const ok = removeUserFromRealm(body.userDid, id);
    if (!ok) return NextResponse.json({ error: "Cannot remove user from the default realm" }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove user from realm" }, { status: 500 });
  }
}

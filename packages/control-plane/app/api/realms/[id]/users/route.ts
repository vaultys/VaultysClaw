import { NextRequest, NextResponse } from "next/server";
import { getRealmById, addUserToRealm, removeUserFromRealm, setUserRealmAdmin } from "@/lib/db";
import { UserDao } from "@/lib/user-dao";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/realms/[id]/users — add a user to this realm. Realm admin or global admin.
 * Body: { userDid, isPrimary?, isRealmAdmin? }
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    if (!auth.canAdminRealm(id)) return forbidden();

    const realm = getRealmById(id);
    if (!realm) return NextResponse.json({ error: "Realm not found" }, { status: 404 });

    const body = await req.json() as { userDid?: string; isPrimary?: boolean; isRealmAdmin?: boolean };
    if (!body.userDid) return NextResponse.json({ error: "userDid is required" }, { status: 400 });

    const user = UserDao.getByDid(body.userDid) ?? UserDao.getById(body.userDid);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    addUserToRealm(user.id, id, body.isPrimary ?? false, body.isRealmAdmin ?? false);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to add user to realm" }, { status: 500 });
  }
}

/**
 * PATCH /api/realms/[id]/users — update a user's realm admin status. Realm admin or global admin.
 * Body: { userDid, isRealmAdmin }
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    if (!auth.canAdminRealm(id)) return forbidden();

    const body = await req.json() as { userDid?: string; isRealmAdmin?: boolean };
    if (!body.userDid) return NextResponse.json({ error: "userDid is required" }, { status: 400 });
    if (typeof body.isRealmAdmin !== "boolean") return NextResponse.json({ error: "isRealmAdmin (boolean) is required" }, { status: 400 });

    const user = UserDao.getByDid(body.userDid) ?? UserDao.getById(body.userDid);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const changed = setUserRealmAdmin(user.id, id, body.isRealmAdmin);
    if (!changed) return NextResponse.json({ error: "User is not a member of this realm" }, { status: 404 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update realm admin status" }, { status: 500 });
  }
}

/**
 * DELETE /api/realms/[id]/users — remove a user from this realm. Realm admin or global admin.
 * Body: { userDid }
 */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { id } = await ctx.params;
    if (!auth.canAdminRealm(id)) return forbidden();

    const body = await req.json() as { userDid?: string };
    if (!body.userDid) return NextResponse.json({ error: "userDid is required" }, { status: 400 });

    const user = UserDao.getByDid(body.userDid) ?? UserDao.getById(body.userDid);
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const ok = removeUserFromRealm(user.id, id);
    if (!ok) return NextResponse.json({ error: "Cannot remove user from the default realm" }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to remove user from realm" }, { status: 500 });
  }
}

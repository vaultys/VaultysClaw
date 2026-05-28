/**
 * Credential vault endpoints for a realm.
 *
 * GET  /api/realms/[id]/credentials              — list credential metadata (no secrets)
 * POST /api/realms/[id]/credentials              — save or update a credential
 * DELETE /api/realms/[id]/credentials?service=&name= — remove a credential
 */

import { NextRequest, NextResponse } from "next/server";
import { getRealmById, saveCredential, listCredentialsByService, listCredentials, deleteCredentialByKey } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { encryptSecret } from "@/lib/vault";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const { id: realmId } = await ctx.params;
  const realm = getRealmById(realmId);
  if (!realm) return NextResponse.json({ error: "Realm not found" }, { status: 404 });
  if (!auth.canAccessRealm(realmId)) return forbidden();

  const service = req.nextUrl.searchParams.get("service");
  const credentials = service
    ? listCredentialsByService(realmId, service)
    : listCredentials(realmId);

  return NextResponse.json({ credentials });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const { id: realmId } = await ctx.params;
  const realm = getRealmById(realmId);
  if (!realm) return NextResponse.json({ error: "Realm not found" }, { status: 404 });
  if (!auth.canAdminRealm(realmId)) return forbidden();

  const body = await req.json() as {
    service?: string;
    name?: string;
    secret?: string;
    metadata?: Record<string, unknown>;
  };

  if (!body.service || !body.name || !body.secret) {
    return NextResponse.json(
      { error: "service, name, and secret are required" },
      { status: 400 },
    );
  }

  const secretEncrypted = await encryptSecret(body.secret);
  const id = saveCredential(
    realmId,
    body.service,
    body.name,
    secretEncrypted,
    body.metadata,
    auth.did,
  );

  return NextResponse.json({ success: true, id }, { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = await getAuthContext();
  if (!auth) return unauthorized();

  const { id: realmId } = await ctx.params;
  if (!auth.canAdminRealm(realmId)) return forbidden();

  const service = req.nextUrl.searchParams.get("service");
  const name = req.nextUrl.searchParams.get("name");
  if (!service || !name) {
    return NextResponse.json({ error: "service and name query params are required" }, { status: 400 });
  }

  const deleted = deleteCredentialByKey(realmId, service, name);
  return NextResponse.json({ success: deleted });
}

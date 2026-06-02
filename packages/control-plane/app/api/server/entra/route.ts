/**
 * GET  /api/server/entra  — read Entra config (secret redacted)
 * PUT  /api/server/entra  — save Entra config
 * POST /api/server/entra  — test connectivity (list groups)
 */

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, forbidden, unauthorized } from "@/lib/auth-utils";
import { getEntraConfig, saveEntraConfig, listEntraGroups, diagnoseEntraConfig } from "@/lib/entra-sync";

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const config = getEntraConfig();
  if (!config) return NextResponse.json({ configured: false });

  return NextResponse.json({
    configured: true,
    tenantId: config.tenantId,
    clientId: config.clientId,
    clientSecret: "••••••••",
  });
}

export async function PUT(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const body = (await req.json()) as {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
  };

  if (!body.tenantId || !body.clientId || !body.clientSecret) {
    return NextResponse.json({ error: "tenantId, clientId and clientSecret are required" }, { status: 400 });
  }

  // If secret is the redacted placeholder, keep the existing one
  const existing = getEntraConfig();
  const secret =
    body.clientSecret === "••••••••" && existing ? existing.clientSecret : body.clientSecret;

  saveEntraConfig({ tenantId: body.tenantId, clientId: body.clientId, clientSecret: secret });
  return NextResponse.json({ ok: true });
}

export async function POST(req: NextRequest) {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  // Accept an inline config (unsaved) so the UI can test before saving
  const body = (await req.json().catch(() => ({}))) as {
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
  };

  const saved = getEntraConfig();
  const config = {
    tenantId: body.tenantId ?? saved?.tenantId ?? "",
    clientId: body.clientId ?? saved?.clientId ?? "",
    clientSecret:
      body.clientSecret && body.clientSecret !== "••••••••"
        ? body.clientSecret
        : (saved?.clientSecret ?? ""),
  };

  if (!config.tenantId || !config.clientId || !config.clientSecret) {
    return NextResponse.json({ error: "Entra credentials are not configured" }, { status: 400 });
  }

  // Always run diagnostics first
  const checks = await diagnoseEntraConfig(config);
  const allOk = checks.every((c) => c.status === "ok");

  if (!allOk) {
    return NextResponse.json({ ok: false, checks }, { status: 200 });
  }

  // All checks passed — also return the group list so the wizard can use it
  try {
    const groups = await listEntraGroups();
    return NextResponse.json({ ok: true, checks, groups });
  } catch (err) {
    return NextResponse.json(
      { ok: false, checks, error: err instanceof Error ? err.message : "Failed to list groups" },
      { status: 200 },
    );
  }
}

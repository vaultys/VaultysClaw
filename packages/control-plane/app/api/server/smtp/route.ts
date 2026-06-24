/**
 * GET  /api/server/smtp  — read SMTP config (password redacted)
 * PUT  /api/server/smtp  — save SMTP config
 * POST /api/server/smtp  — verify SMTP connection
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { getSmtpConfig, saveSmtpConfig, testSmtpConnection } from "@/lib/smtp";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { serverContract } from "@/lib/contracts";

const handlers = createNextRoute(serverContract, {
  // ── GET /api/server/smtp ──────────────────────────────────────────────────
  getSmtp: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const config = await getSmtpConfig();
    if (!config) return { status: 200, body: { configured: false } };

    return {
      status: 200,
      body: {
        configured: true,
        host: config.host,
        port: config.port,
        secure: config.secure,
        user: config.user,
        password: "••••••••",
        from: config.from,
      },
    };
  },

  // ── PUT /api/server/smtp ──────────────────────────────────────────────────
  saveSmtp: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const existing = await getSmtpConfig();
    const password =
      body.password === "••••••••" && existing
        ? existing.password
        : (body.password ?? "");

    await saveSmtpConfig({
      host: body.host,
      port: body.port,
      secure: body.secure ?? false,
      user: body.user ?? "",
      password,
      from: body.from,
    });

    return { status: 200, body: { ok: true } };
  },

  // ── POST /api/server/smtp ─────────────────────────────────────────────────
  verifySmtp: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const existing = await getSmtpConfig();
    const config = {
      host: body.host ?? existing?.host ?? "",
      port: body.port ?? existing?.port ?? 587,
      secure: body.secure ?? existing?.secure ?? false,
      user: body.user ?? existing?.user ?? "",
      password:
        body.password === "••••••••" || !body.password
          ? (existing?.password ?? "")
          : body.password,
      from: body.from ?? existing?.from ?? "",
    };

    if (!config.host || !config.port)
      throw new APIException(
        "MALFORMED",
        "host and port are required for connectivity test"
      );

    await testSmtpConnection(config);
    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;
export const POST = handlers.POST!;

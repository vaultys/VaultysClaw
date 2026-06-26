import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { remoteControlContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { loadTelegramConfig } from "@/lib/remote-control";
import { TelegramApi } from "@/lib/remote-control/telegram-api";

const handlers = createNextRoute(remoteControlContract, {
  // ── POST /api/remote-control/telegram/test ────────────────────────────────
  testTelegram: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    // Use the supplied token, or fall back to the stored/env one.
    let token = body.botToken;
    if (!token) {
      token = (await loadTelegramConfig()).botToken;
    }
    if (!token) {
      return { status: 200 as const, body: { ok: false, error: "No token configured" } };
    }

    try {
      const me = await new TelegramApi(token).getMe();
      return { status: 200 as const, body: { ok: true, botUsername: me.username } };
    } catch (err) {
      return {
        status: 200 as const,
        body: { ok: false, error: err instanceof Error ? err.message : String(err) },
      };
    }
  },
});

export const POST = handlers.POST!;

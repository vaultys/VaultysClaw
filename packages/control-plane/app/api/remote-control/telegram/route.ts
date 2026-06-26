import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { remoteControlContract } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  getTelegramPublicConfig,
  updateTelegramConfig,
} from "@/lib/remote-control";

const handlers = createNextRoute(remoteControlContract, {
  // ── GET /api/remote-control/telegram ──────────────────────────────────────
  getTelegram: async ({ request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");
    return { status: 200, body: await getTelegramPublicConfig() };
  },

  // ── PUT /api/remote-control/telegram ──────────────────────────────────────
  updateTelegram: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    const updated = await updateTelegramConfig({
      enabled: body.enabled,
      botToken: body.botToken,
      allowedChatIds: body.allowedChatIds,
      defaultAgentDid: body.defaultAgentDid,
      agentByChat: body.agentByChat,
    });
    return { status: 200, body: updated };
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;

/**
 * PUT /api/admin/server/settings — save connection settings (admin only).
 * Reading settings is public, see app/api/public/server/settings/route.ts.
 */

import { SettingsDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { adminContract } from "@/lib/contracts";

const handlers = createNextRoute(adminContract.server, {
  saveSettings: async ({ body }) => {

    if (body.walletUrl !== undefined)
      await SettingsDAO.set("wallet_url", body.walletUrl.trim());
    if (body.peerjsHost !== undefined)
      await SettingsDAO.set("peerjs_host", body.peerjsHost.trim());

    return { status: 200, body: { ok: true } };
  },
});

export const PUT = handlers.PUT!;

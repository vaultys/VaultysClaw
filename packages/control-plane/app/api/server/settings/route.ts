/**
 * GET  /api/server/settings  — read connection settings (wallet URL, PeerJS host)
 * PUT  /api/server/settings  — save connection settings
 *
 * GET is public (wallet URL is needed on the login page). PUT is admin-only.
 */

import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { SettingsDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

const handlers = createNextRoute(adminContract.server, {
  // ── GET /api/server/settings (public) ─────────────────────────────────────
  getSettings: async () => ({
    status: 200,
    body: {
      walletUrl:
        (await SettingsDAO.get("wallet_url")) ?? "https://wallet.vaultys.net",
      peerjsHost: (await SettingsDAO.get("peerjs_host")) ?? "",
      // Dev-only: lets the browser authenticate with a locally stored identity
      // (no mobile VaultysID app). Gated behind an env flag — it weakens
      // security since anyone with browser access can sign in.
      devLogin: process.env.VC_DEV_LOGIN === "true",
    },
  }),

  // ── PUT /api/server/settings (admin) ──────────────────────────────────────
  saveSettings: async ({ body, request }) => {
    const auth = await getAuthContext(request);
    if (!auth.isGlobalAdmin) throw new APIException("FORBIDDEN");

    if (body.walletUrl !== undefined)
      await SettingsDAO.set("wallet_url", body.walletUrl.trim());
    if (body.peerjsHost !== undefined)
      await SettingsDAO.set("peerjs_host", body.peerjsHost.trim());

    return { status: 200, body: { ok: true } };
  },
});

export const GET = handlers.GET!;
export const PUT = handlers.PUT!;

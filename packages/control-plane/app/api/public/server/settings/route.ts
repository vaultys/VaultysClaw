/**
 * GET /api/public/server/settings — read connection settings (wallet URL,
 * PeerJS host, dev-login flag). Public: needed on the login page before auth.
 * Saving settings is admin-only, see app/api/admin/server/settings/route.ts.
 */

import { SettingsDAO } from "@/db";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { publicContract } from "@/lib/contracts";

const handlers = createNextRoute(publicContract.server, {
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
});

export const GET = handlers.GET!;

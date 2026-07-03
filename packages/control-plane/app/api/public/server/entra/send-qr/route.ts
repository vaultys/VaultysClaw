/**
 * POST /api/public/server/entra/send-qr — send a QR code to an Entra ID user.
 * Not implemented yet.
 */

import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { publicContract } from "@/lib/contracts";

const handlers = createNextRoute(publicContract.server, {
  entraSendQr: async () => ({
    status: 501,
    body: { error: "Not implemented" },
  }),
});

export const POST = handlers.POST!;

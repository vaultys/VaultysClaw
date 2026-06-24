/**
 * POST /api/server/entra/send-qr — send a QR code to an Entra ID user.
 * Not implemented yet.
 */

import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { serverContract } from "@/lib/contracts";

const handlers = createNextRoute(serverContract, {
  entraSendQr: async () => ({
    status: 501,
    body: { error: "Not implemented" },
  }),
});

export const POST = handlers.POST!;

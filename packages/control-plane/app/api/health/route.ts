import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import { healthContract } from "@/lib/contracts";

/**
 * Health check endpoint for load balancers and deployment tools.
 * Returns 200 OK if the control plane is running. No authentication required.
 */
const handlers = createNextRoute(healthContract, {
  get: async () => ({
    status: 200,
    body: { status: "ok", timestamp: new Date().toISOString() },
  }),
});

export const GET = handlers.GET!;

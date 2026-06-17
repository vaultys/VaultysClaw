/**
 * Inngest serve endpoint (P1 spike).
 *
 * The Inngest Dev Server / self-hosted server discovers and invokes our durable
 * functions through this route. Runs in the same Next process, so functions have
 * access to getWSServer(), Prisma, etc.
 */

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { runWorkflow } from "@/lib/inngest/functions/run-workflow";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [runWorkflow],
});

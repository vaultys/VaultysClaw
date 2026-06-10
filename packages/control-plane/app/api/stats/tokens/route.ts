import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api/utils/api-utils";
import { prisma } from "@/db/client";
import { withError } from "@/lib/api/handlers/with-error";

async function getFleetHistoryTotals(
  granularity: "day" | "month",
  bucket: string
) {
  const result = await prisma.agentTokenUsageHistory.aggregate({
    _sum: {
      promptTokens: true,
      completionTokens: true,
    },
    where: {
      granularity,
      bucket,
    },
  });
  return {
    promptTokens: result._sum.promptTokens ?? 0,
    completionTokens: result._sum.completionTokens ?? 0,
  };
}

/**
 * @openapi
 * /api/stats/tokens:
 *   get:
 *     summary: Retrieve token usage statistics.
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Successful retrieval of token usage statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allTime:
 *                   type: object
 *                   description: Total token usage.
 *                 daily:
 *                   type: object
 *                   description: Daily token usage.
 *                 monthly:
 *                   type: object
 *                   description: Monthly token usage.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export const GET = withError(async (request: NextRequest) => {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const now = new Date();
  const todayBucket = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const monthBucket = now.toISOString().slice(0, 7); // YYYY-MM

  const allTimeResult = await prisma.agentTokenUsage.aggregate({
    _sum: {
      promptTokens: true,
      completionTokens: true,
    },
  });
  const allTime = {
    promptTokens: allTimeResult._sum.promptTokens ?? 0,
    completionTokens: allTimeResult._sum.completionTokens ?? 0,
  };

  const [daily, monthly] = await Promise.all([
    getFleetHistoryTotals("day", todayBucket),
    getFleetHistoryTotals("month", monthBucket),
  ]);

  return NextResponse.json({ allTime, daily, monthly });
});

import { prisma } from "@/db/client";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";
import {
  adminContract,
} from "@/lib/contracts";

async function getFleetHistoryTotals(
  granularity: "day" | "month",
  bucket: string
) {
  const result = await prisma.agentTokenUsageHistory.aggregate({
    _sum: { promptTokens: true, completionTokens: true },
    where: { granularity, bucket },
  });
  return {
    promptTokens: result._sum.promptTokens ?? 0,
    completionTokens: result._sum.completionTokens ?? 0,
  };
}

const handlers = createNextRoute(adminContract.stats, {
  tokens: async () => {

    const now = new Date();
    const todayBucket = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const monthBucket = now.toISOString().slice(0, 7); // YYYY-MM

    const allTimeResult = await prisma.agentTokenUsage.aggregate({
      _sum: { promptTokens: true, completionTokens: true },
    });
    const allTime = {
      promptTokens: allTimeResult._sum.promptTokens ?? 0,
      completionTokens: allTimeResult._sum.completionTokens ?? 0,
    };

    const [daily, monthly] = await Promise.all([
      getFleetHistoryTotals("day", todayBucket),
      getFleetHistoryTotals("month", monthBucket),
    ]);

    return { status: 200, body: { allTime, daily, monthly } };
  },
});

export const GET = handlers.GET!;

import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";
import { getTotalFleetTokenUsage, getDb } from "@/lib/db";

function getFleetHistoryTotals(granularity: "day" | "month", bucket: string) {
  const d = getDb();
  const result = d.prepare(`
    SELECT
      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
      COALESCE(SUM(completion_tokens), 0) AS completion_tokens
    FROM agent_token_usage_history
    WHERE granularity = ? AND bucket = ?
  `).get(granularity, bucket) as { prompt_tokens: number; completion_tokens: number } | undefined;
  return {
    promptTokens: result?.prompt_tokens ?? 0,
    completionTokens: result?.completion_tokens ?? 0,
  };
}

export async function GET(request: NextRequest) {
  const auth = await getAuthContext(request);
  if (!auth) return unauthorized();
  if (!auth.isGlobalAdmin) return forbidden();

  const now = new Date();
  const todayBucket = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const monthBucket = now.toISOString().slice(0, 7);  // YYYY-MM

  const allTime = getTotalFleetTokenUsage();
  const daily = getFleetHistoryTotals("day", todayBucket);
  const monthly = getFleetHistoryTotals("month", monthBucket);

  return NextResponse.json({ allTime, daily, monthly });
}

import { NextRequest, NextResponse } from "next/server";
import { getAgentTokenUsageHistory } from "@/lib/db";
import { getAuthContext, unauthorized, forbidden } from "@/lib/auth-utils";

type Ctx = { params: Promise<{ did: string }> };

/**
 * GET /api/agents/[did]/token-usage
 * Requires auth and realm membership for the agent.
 *
 * Query params:
 *   granularity = 'day' | 'month'  (default: 'day')
 *   from        = ISO date string   (default: 30 days ago for day, 12 months ago for month)
 *   to          = ISO date string   (default: today)
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    const auth = await getAuthContext();
    if (!auth) return unauthorized();

    const { did } = await ctx.params;
    const agentDid = decodeURIComponent(did);

    // Token usage is only accessible to owner or admin
    if (!auth.isGlobalAdmin) return forbidden();

    if (!auth.canAccessAgent(agentDid)) return forbidden();
    const { searchParams } = req.nextUrl;

    const granularity = (searchParams.get("granularity") ?? "day") as "day" | "month";
    const today = new Date();

    let defaultFrom: string;
    if (granularity === "month") {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 11);
      defaultFrom = d.toISOString().slice(0, 7); // YYYY-MM
    } else {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      defaultFrom = d.toISOString().slice(0, 10); // YYYY-MM-DD
    }

    const defaultTo = granularity === "month"
      ? today.toISOString().slice(0, 7)
      : today.toISOString().slice(0, 10);

    const from = searchParams.get("from") ?? defaultFrom;
    const to = searchParams.get("to") ?? defaultTo;

    const rows = getAgentTokenUsageHistory(agentDid, granularity, from, to);

    // Fill in missing buckets with zeros so the chart always has a complete series
    const filled = fillBuckets(rows, granularity, from, to);

    return NextResponse.json({ granularity, from, to, data: filled });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch token usage" }, { status: 500 });
  }
}

interface BucketPoint {
  bucket: string;
  promptTokens: number;
  completionTokens: number;
}

function fillBuckets(
  rows: { bucket: string; prompt_tokens: number; completion_tokens: number }[],
  granularity: "day" | "month",
  from: string,
  to: string,
): BucketPoint[] {
  const map = new Map(rows.map((r) => [r.bucket, r]));
  const result: BucketPoint[] = [];

  const current = new Date(granularity === "day" ? from : from + "-01");
  const end = new Date(granularity === "day" ? to : to + "-01");

  while (current <= end) {
    const bucket = granularity === "day"
      ? current.toISOString().slice(0, 10)
      : current.toISOString().slice(0, 7);

    const row = map.get(bucket);
    result.push({
      bucket,
      promptTokens: row?.prompt_tokens ?? 0,
      completionTokens: row?.completion_tokens ?? 0,
    });

    if (granularity === "day") {
      current.setDate(current.getDate() + 1);
    } else {
      current.setMonth(current.getMonth() + 1);
    }
  }

  return result;
}

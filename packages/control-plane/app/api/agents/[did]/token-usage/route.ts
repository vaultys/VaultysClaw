import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth-utils";
import { unauthorized, forbidden } from "@/lib/api/utils/api-utils";
import { AgentDAO } from "@/db";
import { withError } from "@/lib/api/handlers/with-error";

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
/**
 * @openapi
 * /api/agent/{did}/token-usage:
 *   get:
 *     summary: Retrieve token usage history for an agent.
 *     tags: [Agents]
 *     parameters:
 *       - name: did
 *         in: path
 *         required: true
 *         description: Decentralized Identifier of the agent.
 *         schema:
 *           type: string
 *       - name: granularity
 *         in: query
 *         required: false
 *         description: Granularity of the data ('day' or 'month').
 *         schema:
 *           type: string
 *           enum: [day, month]
 *           default: day
 *       - name: from
 *         in: query
 *         required: false
 *         description: Start date for the data range (ISO format).
 *         schema:
 *           type: string
 *           format: date
 *       - name: to
 *         in: query
 *         required: false
 *         description: End date for the data range (ISO format).
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Token usage data retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [granularity, from, to, data]
 *               properties:
 *                 granularity:
 *                   type: string
 *                   enum: [day, month]
 *                 from:
 *                   type: string
 *                   format: date
 *                 to:
 *                   type: string
 *                   format: date
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [bucket, promptTokens, completionTokens]
 *                     properties:
 *                       bucket:
 *                         type: string
 *                         description: YYYY-MM-DD for day granularity, YYYY-MM for month granularity.
 *                       promptTokens:
 *                         type: integer
 *                       completionTokens:
 *                         type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
export const GET = withError(async (req: NextRequest, ctx: Ctx) => {
  const auth = await getAuthContext(req);
  if (!auth) return unauthorized();

  const { did } = await ctx.params;
  const agentDid = decodeURIComponent(did);

  // Token usage is only accessible to global admin or the agent's realm members
  if (!auth.isGlobalAdmin && !(await auth.canAccessAgent(agentDid)))
    return forbidden();
  const { searchParams } = req.nextUrl;

  const granularity = (searchParams.get("granularity") ?? "day") as
    | "day"
    | "month";
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

  const defaultTo =
    granularity === "month"
      ? today.toISOString().slice(0, 7)
      : today.toISOString().slice(0, 10);

  const from = searchParams.get("from") ?? defaultFrom;
  const to = searchParams.get("to") ?? defaultTo;

  const rows = await AgentDAO.getTokenUsageHistory(
    agentDid,
    granularity,
    from,
    to
  );

  // Fill in missing buckets with zeros so the chart always has a complete series
  const filled = fillBuckets(
    rows.map((r) => ({
      bucket: r.bucket,
      prompt_tokens: r.promptTokens,
      completion_tokens: r.completionTokens,
    })),
    granularity,
    from,
    to
  );

  return NextResponse.json({ granularity, from, to, data: filled });
});

interface BucketPoint {
  bucket: string;
  promptTokens: number;
  completionTokens: number;
}

function fillBuckets(
  rows: { bucket: string; prompt_tokens: number; completion_tokens: number }[],
  granularity: "day" | "month",
  from: string,
  to: string
): BucketPoint[] {
  const map = new Map(rows.map((r) => [r.bucket, r]));
  const result: BucketPoint[] = [];

  const current = new Date(granularity === "day" ? from : from + "-01");
  const end = new Date(granularity === "day" ? to : to + "-01");

  while (current <= end) {
    const bucket =
      granularity === "day"
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

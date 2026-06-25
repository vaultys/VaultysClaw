import { getAuthContext } from "@/lib/auth-utils";
import { APIException } from "@/lib/api/utils/api-utils";
import { AgentDAO } from "@/db";
import { agentsContract, BucketPoint } from "@/lib/contracts";
import { createNextRoute } from "@/lib/api/ts-rest/next-route";

const handlers = createNextRoute(agentsContract, {
  tokenUsage: async ({ params, query, request }) => {
    const auth = await getAuthContext(request);
    const agentDid = params.did;

    if (!auth.isGlobalAdmin && !(await auth.canAccessAgent(agentDid)))
      throw new APIException("FORBIDDEN");

    const granularity = (query.granularity ?? "day") as "day" | "month";
    const today = new Date();

    let defaultFrom: string;
    if (granularity === "month") {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 11);
      defaultFrom = d.toISOString().slice(0, 7);
    } else {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      defaultFrom = d.toISOString().slice(0, 10);
    }

    const defaultTo =
      granularity === "month"
        ? today.toISOString().slice(0, 7)
        : today.toISOString().slice(0, 10);

    const from = query.from ?? defaultFrom;
    const to = query.to ?? defaultTo;

    const rows = await AgentDAO.getTokenUsageHistory(
      agentDid,
      granularity,
      from,
      to
    );

    const data = fillBuckets(
      rows.map((r) => ({
        bucket: r.bucket,
        prompt_tokens: r.promptTokens,
        completion_tokens: r.completionTokens,
      })),
      granularity,
      from,
      to
    );

    return { status: 200, body: { granularity, from, to, data } };
  },
});

export const GET = handlers.GET!;

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

"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { adminAgentsClient, unwrap } from "@/lib/api/ts-rest/client";
import { TokenUsageBucket } from "@/types";

type TokenGranularity = "day" | "month";
type TokenPeriod = "7d" | "30d" | "3m" | "12m";

export function TokensTab({ agentId }: { agentId: string }) {
  const [granularity, setGranularity] = useState<TokenGranularity>("day");
  const [period, setPeriod] = useState<TokenPeriod>("30d");
  const [data, setData] = useState<TokenUsageBucket[]>([]);
  const [loading, setLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (g: TokenGranularity, p: TokenPeriod) => {
      setLoading(true);
      setTokenError(null);
      try {
        const today = new Date();
        let from: string;
        if (p === "7d") {
          const d = new Date(today);
          d.setDate(d.getDate() - 6);
          from = d.toISOString().slice(0, 10);
        } else if (p === "30d") {
          const d = new Date(today);
          d.setDate(d.getDate() - 29);
          from = d.toISOString().slice(0, 10);
        } else if (p === "3m") {
          const d = new Date(today);
          d.setMonth(d.getMonth() - 2);
          from =
            g === "month"
              ? d.toISOString().slice(0, 7)
              : d.toISOString().slice(0, 10);
        } else {
          const d = new Date(today);
          d.setMonth(d.getMonth() - 11);
          from =
            g === "month"
              ? d.toISOString().slice(0, 7)
              : d.toISOString().slice(0, 10);
        }
        const to =
          g === "month"
            ? today.toISOString().slice(0, 7)
            : today.toISOString().slice(0, 10);
        const { data } = unwrap(
          await adminAgentsClient.tokenUsage({
            params: { did: agentId },
            query: { granularity: g, from, to },
          })
        );
        setData(data ?? []);
      } catch (e) {
        setTokenError((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [agentId]
  );

  useEffect(() => {
    fetchData(granularity, period);
  }, [fetchData, granularity, period]);

  const total = data.reduce(
    (acc, r) => ({
      prompt: acc.prompt + r.promptTokens,
      completion: acc.completion + r.completionTokens,
    }),
    { prompt: 0, completion: 0 }
  );

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-background-100 p-0.5">
          {(["7d", "30d", "3m", "12m"] as TokenPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                if (p === "3m" || p === "12m") setGranularity("month");
                else setGranularity("day");
              }}
              className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                period === p
                  ? "bg-primary text-white"
                  : "text-foreground-500 hover:text-foreground hover:bg-background-100"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-background-100 p-0.5">
          {(["day", "month"] as TokenGranularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 text-xs rounded-md capitalize transition-colors ${
                granularity === g
                  ? "bg-primary text-white"
                  : "text-foreground-500 hover:text-foreground hover:bg-background-100"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-neutral-200 bg-background-100 p-4">
          <p className="text-xs text-foreground-500 mb-1">Input tokens</p>
          <p className="text-xl font-semibold text-foreground">
            {total.prompt.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-background-100 p-4">
          <p className="text-xs text-foreground-500 mb-1">Output tokens</p>
          <p className="text-xl font-semibold text-foreground">
            {total.completion.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-neutral-200 bg-background-100 p-4">
          <p className="text-xs text-foreground-500 mb-1">Total tokens</p>
          <p className="text-xl font-semibold text-foreground">
            {(total.prompt + total.completion).toLocaleString()}
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-foreground-500">
          <Loader2 className="animate-spin w-5 h-5 mr-2" /> Loading…
        </div>
      )}
      {tokenError && <p className="text-danger-600 text-sm">{tokenError}</p>}
      {!loading && !tokenError && data.length > 0 && (
        <div className="rounded-xl border border-neutral-200 bg-background-100 p-4">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={data}
              margin={{ top: 4, right: 8, left: 0, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.07)"
              />
              <XAxis
                dataKey="bucket"
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                tickFormatter={(v: string) =>
                  granularity === "month" ? v.slice(0, 7) : v.slice(5)
                }
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#9ca3af" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  background: "#1a1a1f",
                  border: "1px solid #2d2d35",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "#e5e7eb" }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                dataKey="promptTokens"
                name="Input"
                fill="primary"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="completionTokens"
                name="Output"
                fill="#818cf8"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!loading && !tokenError && data.length === 0 && (
        <div className="text-center py-12 text-foreground-500 text-sm">
          No token data for this period.
        </div>
      )}
    </div>
  );
}

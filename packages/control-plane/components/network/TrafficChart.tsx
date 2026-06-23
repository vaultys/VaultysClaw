import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { TransportStats } from "@/lib/contracts";
import { CHART_TOOLTIP_STYLE } from "./chart";

export function TrafficChart({
  stats,
  color,
}: {
  stats: TransportStats | undefined;
  color: "primary" | "secondary";
}) {
  const palette =
    color === "primary"
      ? "rgb(var(--primary-500))"
      : "rgb(var(--secondary-500))";
  const paletteDim =
    color === "primary"
      ? "rgb(var(--primary-400))"
      : "rgb(var(--secondary-400))";

  const toMB = (bytes: number) => bytes / (1024 * 1024);

  const byteData = [
    { name: "In", value: toMB(stats?.bytesIn ?? 0) },
    { name: "Out", value: toMB(stats?.bytesOut ?? 0) },
  ];

  const msgIn = stats?.messagesIn ?? 0;
  const msgOut = stats?.messagesOut ?? 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Messages — counters instead of a chart (scale would dwarf byte values) */}
      <div className="bg-background border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
          Messages
        </p>
        <div className="flex flex-1 items-center gap-4">
          <div className="flex-1 flex flex-col items-center justify-center gap-1 bg-background-100 border border-neutral-200 rounded-lg py-6">
            <span
              className="text-3xl font-bold tabular-nums"
              style={{ color: palette }}
            >
              {msgIn.toLocaleString()}
            </span>
            <span className="text-xs text-foreground-500">received</span>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center gap-1 bg-background-100 border border-neutral-200 rounded-lg py-6">
            <span
              className="text-3xl font-bold tabular-nums"
              style={{ color: paletteDim }}
            >
              {msgOut.toLocaleString()}
            </span>
            <span className="text-xs text-foreground-500">sent</span>
          </div>
        </div>
      </div>

      {/* Bytes — bar chart scaled to MB */}
      <div className="bg-background border border-neutral-200 rounded-xl p-4">
        <p className="text-xs font-medium text-foreground-500 uppercase tracking-wide mb-3">
          Data transferred (MB)
        </p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart
            data={byteData}
            margin={{ top: 4, right: 8, left: -8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--neutral-200, #334155)"
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: "var(--foreground-500, #94a3b8)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--foreground-500, #94a3b8)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) =>
                v < 1 ? v.toFixed(2) : v.toFixed(1)
              }
            />
            <Tooltip
              contentStyle={CHART_TOOLTIP_STYLE}
              cursor={{ fill: "var(--background-200, #1e293b)", opacity: 0.5 }}
              formatter={(value) => [
                `${(value as number)?.toFixed(3)} MB`,
                "Size",
              ]}
            />
            <Bar
              dataKey="value"
              name="MB"
              fill={paletteDim}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

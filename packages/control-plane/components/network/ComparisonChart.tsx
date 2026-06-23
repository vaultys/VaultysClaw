import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import type { TransportStats } from "@/lib/contracts";
import { CHART_TOOLTIP_STYLE } from "./chart";

export function ComparisonChart({
  ws,
  peerjs,
}: {
  ws: TransportStats | undefined;
  peerjs: TransportStats | undefined;
}) {
  const toMB = (b: number) => b / (1024 * 1024);

  // Messages side — counters per transport
  const msgRows = [
    { label: "Received", ws: ws?.messagesIn ?? 0, pj: peerjs?.messagesIn ?? 0 },
    { label: "Sent", ws: ws?.messagesOut ?? 0, pj: peerjs?.messagesOut ?? 0 },
  ];

  // Bytes side — MB bar chart
  const byteData = [
    {
      name: "In",
      WebSocket: toMB(ws?.bytesIn ?? 0),
      WebRTC: toMB(peerjs?.bytesIn ?? 0),
    },
    {
      name: "Out",
      WebSocket: toMB(ws?.bytesOut ?? 0),
      WebRTC: toMB(peerjs?.bytesOut ?? 0),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Message counters */}
      <div className="bg-background border border-neutral-200 rounded-xl p-4 flex flex-col gap-3">
        <p className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
          Messages
        </p>
        <div className="flex flex-col gap-2">
          {/* Header */}
          <div className="grid grid-cols-3 text-xs text-foreground-400 font-medium px-1">
            <span />
            <span className="text-center text-primary-500">WebSocket</span>
            <span className="text-center text-secondary-500">WebRTC</span>
          </div>
          {msgRows.map(({ label, ws: w, pj }) => (
            <div
              key={label}
              className="grid grid-cols-3 items-center bg-background-100 border border-neutral-200 rounded-lg px-3 py-2"
            >
              <span className="text-xs text-foreground-500">{label}</span>
              <span className="text-center text-lg font-bold tabular-nums text-primary-400">
                {w.toLocaleString()}
              </span>
              <span className="text-center text-lg font-bold tabular-nums text-secondary-400">
                {pj.toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Bytes bar chart in MB */}
      <div className="bg-background border border-neutral-200 rounded-xl p-4">
        <p className="text-xs font-medium text-foreground-500 uppercase tracking-wide mb-3">
          Data transferred (MB)
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={byteData}
            margin={{ top: 4, right: 16, left: -8, bottom: 0 }}
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
            <Legend
              wrapperStyle={{
                fontSize: "12px",
                color: "var(--foreground-500, #94a3b8)",
              }}
            />
            <Bar
              dataKey="WebSocket"
              fill="rgb(var(--primary-500))"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="WebRTC"
              fill="rgb(var(--secondary-500))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

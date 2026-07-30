"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { adminApi, unwrap, ApiError } from "@/lib/api/ts-rest/client";
import type { SensorDeviceDetail } from "@/lib/contracts";
import { timeAgo, shortDid } from "@vaultysclaw/shared";

// Mirrors db/sensor-device.dao.ts's SHADOW_THRESHOLD — duplicated as a plain
// constant rather than imported, since that module pulls in the (server-only)
// Prisma client and must not end up in a client bundle.
const SHADOW_THRESHOLD = 0.75;

export default function SensorDetailPage() {
  const params = useParams();
  const router = useRouter();
  const did = decodeURIComponent(params.did as string);

  const [detail, setDetail] = useState<SensorDeviceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      setDetail(unwrap(await adminApi.sensors.getSensor({ params: { did } })));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load sensor");
    } finally {
      setLoading(false);
    }
  }, [did]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useBreadcrumbs(
    [
      { label: "Sensors", href: "/admin/sensors" },
      { label: detail?.name || detail?.hostname || "Device" },
    ],
    [detail]
  );

  useToolbar(
    {
      title: detail?.name || detail?.hostname || "Sensor device",
      description: detail
        ? `${detail.workloads.length} workload${detail.workloads.length !== 1 ? "s" : ""} · ${detail.online ? "online" : "offline"}`
        : undefined,
    },
    [detail]
  );

  if (loading) {
    return <div className="p-6 text-foreground-500 text-sm">Loading…</div>;
  }
  if (error) {
    return <div className="p-6 text-danger-600 text-sm">{error}</div>;
  }
  if (!detail) return null;

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
      <button
        onClick={() => router.push("/admin/sensors")}
        className="inline-flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4" /> Back to sensors
      </button>

      <div className="bg-background-100 border border-neutral-200 rounded-xl p-5 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">
            DID
          </p>
          <p className="font-mono text-xs" title={detail.did}>
            {shortDid(detail.did)}
          </p>
        </div>
        <div>
          <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">
            OS
          </p>
          <p>{detail.os || "—"}</p>
        </div>
        <div>
          <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">
            Assigned user
          </p>
          <p>
            {detail.assignedUser?.name ??
              detail.assignedUser?.email ??
              "Unassigned"}
          </p>
        </div>
        <div>
          <p className="text-xs text-foreground-400 uppercase tracking-wider mb-1">
            Last seen
          </p>
          <p>{timeAgo(detail.lastSeen)}</p>
        </div>
      </div>

      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs font-medium text-foreground-400 uppercase tracking-wider">
              <th className="px-5 py-3">Process</th>
              <th className="px-5 py-3">Provider</th>
              <th className="px-5 py-3">AI conf.</th>
              <th className="px-5 py-3">Agent conf.</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">MCP</th>
              <th className="px-5 py-3">Last seen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {detail.workloads.map((w) => (
              <tr key={w.id}>
                <td className="px-5 py-3.5">
                  <div className="font-medium text-foreground">
                    {w.processName || "—"}
                  </div>
                  {w.command && (
                    <div
                      className="text-xs text-foreground-400 truncate max-w-md"
                      title={w.command}
                    >
                      {w.command}
                    </div>
                  )}
                  {Array.isArray(w.reasons) && w.reasons.length > 0 && (
                    <div className="text-xs text-foreground-400 mt-1">
                      {(w.reasons as string[]).join(" · ")}
                    </div>
                  )}
                </td>
                <td className="px-5 py-3.5 text-foreground-500">
                  {w.provider || "—"}
                </td>
                <td className="px-5 py-3.5 text-foreground-500">
                  {w.aiConfidence.toFixed(2)}
                </td>
                <td className="px-5 py-3.5 text-foreground-500">
                  {w.agentConfidence.toFixed(2)}
                </td>
                <td className="px-5 py-3.5">
                  {w.agentConfidence >= SHADOW_THRESHOLD ? (
                    <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-danger-100 text-danger-700 border border-danger-300">
                      Shadow
                    </span>
                  ) : (
                    <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-background-200 text-foreground-500 border border-neutral-200">
                      Observed
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-foreground-500 text-xs">
                  {w.isMcp
                    ? Array.isArray(w.mcpServers)
                      ? (w.mcpServers as string[]).join(", ")
                      : "yes"
                    : "—"}
                </td>
                <td className="px-5 py-3.5 text-foreground-500 text-xs">
                  {timeAgo(w.lastSeen)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {detail.workloads.length === 0 && (
          <div className="px-6 py-12 text-center text-foreground-500 text-sm">
            No AI workloads detected on this device yet.
          </div>
        )}
      </div>
    </div>
  );
}

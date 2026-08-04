import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ActorDAO, SensorWorkloadDAO, WorkspaceDAO, SHADOW_THRESHOLD } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { decodeDidParam, encodeDidParam } from "@/lib/actor-route";
import { getWSServerInstance } from "@/lib/ws-server";

/**
 * Sensor detail — fleet-telemetry-focused (workloads), unlike the generic Actor detail page
 * (identity/certs/edit/location/relationships), which this links out to rather than duplicating.
 */
export default async function SensorDetailPage({
  params,
}: {
  params: Promise<{ did: string }>;
}) {
  const { did: didParam } = await params;
  const did = decodeDidParam(didParam);
  const actor = await ActorDAO.findByDid(did);
  if (!actor || actor.kind !== "sensor") notFound();

  const [workloads, workspaces] = await Promise.all([
    SensorWorkloadDAO.listForDevice(did),
    WorkspaceDAO.list(),
  ]);

  const kindConfig = actor.kindConfig as { hostname?: string; os?: string };
  const online = getWSServerInstance()?.isConnected(did) ?? false;
  const workspace = workspaces.find((w) => w.id === actor.workspaceId);

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <PageChrome
        toolbar={{
          title: actor.name || kindConfig.hostname || "Device",
          description: `${workloads.length} workload${workloads.length === 1 ? "" : "s"} · ${online ? "online" : "offline"}`,
        }}
        breadcrumbs={[{ label: "Sensors", href: "/admin/sensors" }, { label: actor.name || "Device" }]}
      />

      <Link
        href="/admin/sensors"
        className="inline-flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Sensors
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            {actor.name || kindConfig.hostname || "Device"}
          </h1>
          <p className="text-xs text-foreground-500 font-mono mt-0.5">{actor.did}</p>
        </div>
        <Link
          href={`/admin/actors/${encodeDidParam(did)}`}
          className="text-xs text-primary-600 hover:underline shrink-0"
        >
          Full Actor page →
        </Link>
      </div>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">OS</div>
          <div>{kindConfig.os ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Workspace</div>
          <div>{workspace?.name ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Status</div>
          <span
            className={`text-xs px-2 py-0.5 rounded-full border ${
              online
                ? "bg-success-100 text-success-700 border-success-200"
                : "bg-neutral-100 text-foreground-500 border-neutral-200"
            }`}
          >
            ● {online ? "Online" : "Offline"}
          </span>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Last seen</div>
          <div>{actor.lastSeen.toISOString()}</div>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-foreground-700 mb-3">
          AI/agent workloads ({workloads.length})
        </h2>
        <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
          <table className="w-full text-sm bg-background-100">
            <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Process</th>
                <th className="px-4 py-2 font-medium">Provider</th>
                <th className="px-4 py-2 font-medium">AI conf.</th>
                <th className="px-4 py-2 font-medium">Agent conf.</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">MCP</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {workloads.map((w) => {
                const reasons = w.reasons as string[];
                const mcpServers = w.mcpServers as string[];
                const isShadow = w.agentConfidence >= SHADOW_THRESHOLD;
                return (
                  <tr key={w.id} className="border-t border-neutral-200/60 align-top">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-foreground">{w.processName}</div>
                      {w.processCommand && (
                        <div className="text-xs font-mono text-foreground-400 truncate max-w-xs">
                          {w.processCommand}
                        </div>
                      )}
                      {reasons.length > 0 && (
                        <div className="text-xs text-foreground-400 mt-0.5">{reasons.join(" · ")}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-500">{w.provider ?? "—"}</td>
                    <td className="px-4 py-2.5 text-foreground-700">{w.aiConfidence.toFixed(2)}</td>
                    <td className="px-4 py-2.5 text-foreground-700">{w.agentConfidence.toFixed(2)}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          isShadow
                            ? "bg-warning-100 text-warning-700 border-warning-200"
                            : "bg-neutral-100 text-foreground-500 border-neutral-200"
                        }`}
                      >
                        {isShadow ? "Shadow" : "Observed"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-foreground-500">
                      {w.isMcp ? mcpServers.join(", ") || "yes" : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground-500">
                      {w.lastSeen.toISOString()}
                    </td>
                  </tr>
                );
              })}
              {workloads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-foreground-400">
                    No AI workloads detected on this device yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

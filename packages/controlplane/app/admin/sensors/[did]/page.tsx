import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { ActorDAO, SensorWorkloadDAO, WorkspaceDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { Badge, statusTone } from "@/components/ui/Badge";
import { decodeDidParam, encodeDidParam } from "@/lib/actor-route";
import { getWSServerInstance } from "@/lib/ws-server";
import { computeWorkloadStatus, resolveManagingActors } from "@/lib/workload-status";

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
  const managingActors = await resolveManagingActors(workloads);

  const kindConfig = actor.kindConfig as { hostname?: string; os?: string };
  const online = getWSServerInstance()?.isConnected(did) ?? false;
  const workspace = workspaces.find((w) => w.id === actor.workspaceId);

  return (
    <div className="w-full max-w-7xl p-6 space-y-6">
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
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
        Back to Sensors
      </Link>

      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <h1 className="text-lg font-medium text-foreground">
            {actor.name || kindConfig.hostname || "Device"}
          </h1>
          <p className="text-xs text-foreground-500 font-mono mt-0.5 break-all">{actor.did}</p>
        </div>
        <Link
          href={`/admin/actors/${encodeDidParam(did)}`}
          className="inline-flex shrink-0 items-center gap-1 text-xs text-primary-700 hover:underline"
        >
          Full Actor page
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </Link>
      </div>

      <section className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <div className="text-xs text-foreground-500 mb-1">OS</div>
          <div>{kindConfig.os ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 mb-1">Workspace</div>
          <div>{workspace?.name ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 mb-1">Status</div>
          <Badge tone={online ? "positive" : "muted"}>{online ? "Online" : "Offline"}</Badge>
        </div>
        <div>
          <div className="text-xs text-foreground-500 mb-1">Last seen</div>
          <div className="font-mono text-xs tabular-nums text-foreground-700">
            {actor.lastSeen.toISOString()}
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-baseline gap-2 text-sm font-medium text-foreground">
          AI/agent workloads
          <span className="font-mono text-xs tabular-nums text-foreground-500">{workloads.length}</span>
        </h2>
        <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
          <table className="w-full text-sm bg-background-100">
            <thead className="border-b border-neutral-200/60 bg-background-200/40 text-left text-xs text-foreground-500">
              <tr>
                <th className="px-4 py-2 font-normal">Process</th>
                <th className="px-4 py-2 font-normal">Provider</th>
                <th className="px-4 py-2 font-normal text-right">AI conf.</th>
                <th className="px-4 py-2 font-normal text-right">Agent conf.</th>
                <th className="px-4 py-2 font-normal">Status</th>
                <th className="px-4 py-2 font-normal">MCP</th>
                <th className="px-4 py-2 font-normal">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {workloads.map((w) => {
                const reasons = w.reasons as string[];
                const mcpServers = w.mcpServers as string[];
                const status = computeWorkloadStatus(w, managingActors);
                const managingActor = w.identityEvidence ? managingActors.get(w.identityEvidence) : undefined;
                return (
                  <tr key={w.id} className="border-t border-neutral-200/60 align-top transition-colors hover:bg-background-200/40">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-foreground">{w.processName}</div>
                      {w.processCommand && (
                        <div className="max-w-4xl truncate text-xs font-mono text-foreground-500">
                          {w.processCommand}
                        </div>
                      )}
                      {reasons.length > 0 && (
                        <div className="text-xs text-foreground-500 mt-0.5">{reasons.join(" · ")}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-500">{w.provider ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-foreground-700">
                      {w.aiConfidence.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-foreground-700">
                      {w.agentConfidence.toFixed(2)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={statusTone(status)}>
                        {status === "managed" ? "Managed" : status === "shadow" ? "Shadow" : "Observed"}
                      </Badge>
                      {managingActor && (
                        <div className="text-xs text-foreground-500 mt-1">
                          by{" "}
                          <Link
                            href={`/admin/actors/${encodeDidParam(managingActor.did)}`}
                            className="hover:text-primary-700 hover:underline"
                          >
                            {managingActor.name}
                          </Link>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-500">
                      {w.isMcp ? mcpServers.join(", ") || "yes" : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs tabular-nums text-foreground-500">
                      {w.lastSeen.toISOString()}
                    </td>
                  </tr>
                );
              })}
              {workloads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-foreground-500">
                    No AI workloads detected on this device yet
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

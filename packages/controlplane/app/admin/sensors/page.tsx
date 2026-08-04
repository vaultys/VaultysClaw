import Link from "next/link";
import { Monitor, Wifi, Cpu, Shield, WifiOff } from "lucide-react";
import { ActorDAO, SensorWorkloadDAO, WorkspaceDAO, ActorLinkDAO, SHADOW_THRESHOLD } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { encodeDidParam } from "@/lib/actor-route";
import { getWSServerInstance } from "@/lib/ws-server";

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  tone?: "neutral" | "success" | "warning";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "text-foreground",
    success: "text-success-600",
    warning: "text-warning-600",
  };
  return (
    <div className="border border-neutral-200/60 rounded-xl bg-background-100 p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-background-200/60 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-foreground-500" />
      </div>
      <div>
        <div className={`text-xl font-semibold ${toneClasses[tone]}`}>{value}</div>
        <div className="text-xs text-foreground-500">{label}</div>
      </div>
    </div>
  );
}

/**
 * Sensors (ported from packages/control-plane's fleet-monitoring page): every `kind: "sensor"`
 * Actor, live connection status, and how much AI/agent activity it's observed. No "assigned user"
 * column like the old app had — that's now just an Actor relationship (see the Actor detail
 * page's Relationships section), shown here as a plain list rather than an inline editor.
 */
export default async function SensorsPage() {
  const [sensors, workloads, workspaces, links] = await Promise.all([
    ActorDAO.list({ kind: "sensor" }),
    SensorWorkloadDAO.list(),
    WorkspaceDAO.list(),
    ActorLinkDAO.list(),
  ]);

  const ws = getWSServerInstance();
  const workspaceById = new Map(workspaces.map((w) => [w.id, w]));

  const workloadsByDevice = new Map<string, typeof workloads>();
  for (const w of workloads) {
    const arr = workloadsByDevice.get(w.deviceDid);
    if (arr) arr.push(w);
    else workloadsByDevice.set(w.deviceDid, [w]);
  }

  const linksByFrom = new Map<string, typeof links>();
  for (const l of links) {
    const arr = linksByFrom.get(l.fromDid);
    if (arr) arr.push(l);
    else linksByFrom.set(l.fromDid, [l]);
  }

  const onlineCount = sensors.filter((s) => ws?.isConnected(s.did)).length;
  const shadowCount = workloads.filter((w) => w.agentConfidence >= SHADOW_THRESHOLD).length;

  return (
    <div className="p-6 space-y-6">
      <PageChrome
        toolbar={{
          title: "Sensors",
          description: `${sensors.length} sensor${sensors.length === 1 ? "" : "s"} registered`,
        }}
        breadcrumbs={[{ label: "Sensors" }]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Sensors" value={sensors.length} icon={Monitor} />
        <StatCard label="Online now" value={onlineCount} icon={Wifi} tone="success" />
        <StatCard label="AI workloads" value={workloads.length} icon={Cpu} />
        <StatCard
          label="Shadow agents"
          value={shadowCount}
          icon={Shield}
          tone={shadowCount > 0 ? "warning" : "neutral"}
        />
      </div>

      {sensors.length === 0 ? (
        <div className="border border-dashed border-neutral-300 rounded-xl p-10 text-center">
          <WifiOff className="w-8 h-8 text-foreground-400 mx-auto mb-2" />
          <h2 className="text-sm font-semibold text-foreground mb-1">No sensors yet</h2>
          <p className="text-sm text-foreground-500">
            Install vaultysclaw-sensor on a machine and approve its connection under Actors to see
            it here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
          <table className="w-full text-sm bg-background-100">
            <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Device</th>
                <th className="px-4 py-2 font-medium">Linked to</th>
                <th className="px-4 py-2 font-medium">Workspace</th>
                <th className="px-4 py-2 font-medium">Workloads</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {sensors.map((s) => {
                const kindConfig = s.kindConfig as { hostname?: string; os?: string };
                const online = ws?.isConnected(s.did) ?? false;
                const deviceWorkloads = workloadsByDevice.get(s.did) ?? [];
                const outgoingLinks = linksByFrom.get(s.did) ?? [];
                return (
                  <tr key={s.did} className="border-t border-neutral-200/60 align-top">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/sensors/${encodeDidParam(s.did)}`}
                        className="text-foreground font-medium hover:text-primary-600 hover:underline"
                      >
                        {s.name || <span className="italic text-foreground-400">Unnamed device</span>}
                      </Link>
                      <div className="text-xs text-foreground-500 font-mono">{s.did}</div>
                      {kindConfig.os && <div className="text-xs text-foreground-400">{kindConfig.os}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-500">
                      {outgoingLinks.length > 0
                        ? outgoingLinks.map((l) => `${l.label} ${l.to.name}`).join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-500">
                      {workspaceById.get(s.workspaceId ?? "")?.name ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-foreground-700">{deviceWorkloads.length}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${
                          online
                            ? "bg-success-100 text-success-700 border-success-200"
                            : "bg-neutral-100 text-foreground-500 border-neutral-200"
                        }`}
                      >
                        ● {online ? "Online" : "Offline"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground-500">
                      {s.lastSeen.toISOString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

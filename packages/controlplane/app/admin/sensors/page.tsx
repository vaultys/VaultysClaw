import { Monitor, Wifi, Cpu, Shield, BadgeCheck, WifiOff } from "lucide-react";
import { ActorDAO, SensorWorkloadDAO, WorkspaceDAO, ActorLinkDAO, SHADOW_THRESHOLD } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import SensorDirectoryPanel from "@/components/SensorDirectoryPanel";
import { getWSServerInstance } from "@/lib/ws-server";
import { resolveManagingActors } from "@/lib/workload-status";

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
  const managingActors = await resolveManagingActors(workloads);
  const managedCount = workloads.filter((w) => w.identityEvidence && managingActors.has(w.identityEvidence)).length;
  const shadowCount = workloads.filter(
    (w) => !(w.identityEvidence && managingActors.has(w.identityEvidence)) && w.agentConfidence >= SHADOW_THRESHOLD
  ).length;

  return (
    <div className="p-6 space-y-6">
      <PageChrome
        toolbar={{
          title: "Sensors",
          description: `${sensors.length} sensor${sensors.length === 1 ? "" : "s"} registered`,
        }}
        breadcrumbs={[{ label: "Sensors" }]}
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <StatCard label="Sensors" value={sensors.length} icon={Monitor} />
        <StatCard label="Online now" value={onlineCount} icon={Wifi} tone="success" />
        <StatCard label="AI workloads" value={workloads.length} icon={Cpu} />
        <StatCard label="Managed" value={managedCount} icon={BadgeCheck} tone="success" />
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
        <SensorDirectoryPanel
          sensors={sensors.map((s) => {
            const kindConfig = s.kindConfig as { hostname?: string; os?: string };
            const outgoingLinks = linksByFrom.get(s.did) ?? [];
            return {
              did: s.did,
              name: s.name,
              os: kindConfig.os ?? null,
              linkedTo:
                outgoingLinks.length > 0
                  ? outgoingLinks.map((l) => `${l.label} ${l.to.name}`).join(", ")
                  : "-",
              workspaceName: workspaceById.get(s.workspaceId ?? "")?.name ?? "-",
              workloadCount: (workloadsByDevice.get(s.did) ?? []).length,
              online: ws?.isConnected(s.did) ?? false,
              lastSeen: s.lastSeen.toISOString(),
            };
          })}
        />
      )}
    </div>
  );
}

import { ActorDAO, SensorWorkloadDAO, WorkspaceDAO, ActorLinkDAO, SHADOW_THRESHOLD } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import SensorDirectoryPanel from "@/components/SensorDirectoryPanel";
import { getWSServerInstance } from "@/lib/ws-server";
import { resolveManagingActors } from "@/lib/workload-status";

/** A count tile, the same shape as the Overview's: a dot only when the number carries a
 *  state an operator should notice (connected sensors, shadow agents waiting on a look). */
function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "success" | "warning";
}) {
  const dot: Record<string, string | null> = {
    neutral: null,
    success: "bg-success-600",
    warning: "bg-warning-500",
  };
  const toneDot = dot[tone] ?? null;
  return (
    <div className="border border-neutral-200/60 rounded-xl bg-background-100 p-5">
      <div className="flex items-center gap-2 text-sm text-foreground-600">
        {toneDot && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${toneDot}`} />}
        {label}
      </div>
      <div className="mt-2 font-mono text-2xl font-medium tabular-nums text-foreground">
        {value.toLocaleString("en-US")}
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
        <StatCard label="Sensors" value={sensors.length} />
        <StatCard label="Online now" value={onlineCount} tone={onlineCount > 0 ? "success" : "neutral"} />
        <StatCard label="AI workloads" value={workloads.length} />
        <StatCard label="Managed" value={managedCount} />
        <StatCard
          label="Shadow agents"
          value={shadowCount}
          tone={shadowCount > 0 ? "warning" : "neutral"}
        />
      </div>

      {sensors.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-foreground-500">
          <h2 className="font-medium text-foreground mb-1">No sensors yet</h2>
          <p>
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

import Link from "next/link";
import { Plus } from "lucide-react";
import { WorkspaceDAO, ActorDAO, CapabilityCertificateDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import type { CertScope } from "@vaultysclaw/policy";

/**
 * Workspaces (docs/PAGE_DESIGN.md §1.7): list + the natural entry point into
 * workspace-scoped admin, expressed entirely as `CertScope.resource =
 * "workspace:<id>"` certificates rather than a separate role table
 * (docs/REBUILD_ARCHITECTURE.md §4.4).
 */
export default async function WorkspacesPage() {
  const [workspaces, actors, certs] = await Promise.all([
    WorkspaceDAO.list(),
    ActorDAO.list(),
    CapabilityCertificateDAO.list({ status: "active" }),
  ]);

  const actorsByWorkspace = new Map<string, number>();
  for (const a of actors) {
    if (!a.workspaceId) continue;
    actorsByWorkspace.set(a.workspaceId, (actorsByWorkspace.get(a.workspaceId) ?? 0) + 1);
  }

  const humanDidByActor = new Map(actors.filter((a) => a.kind === "human").map((a) => [a.did, a]));
  const membersByWorkspace = new Map<string, Set<string>>();
  for (const cert of certs) {
    const scope = cert.scope as CertScope | null;
    if (!scope?.resource?.startsWith("workspace:")) continue;
    if (!humanDidByActor.has(cert.agentDid)) continue;
    const wsId = scope.resource.slice("workspace:".length);
    if (!membersByWorkspace.has(wsId)) membersByWorkspace.set(wsId, new Set());
    membersByWorkspace.get(wsId)!.add(cert.agentDid);
  }

  return (
    <div className="p-6 space-y-4">
      <PageChrome
        toolbar={{
          title: "Workspaces",
          description: `${workspaces.length} workspace${workspaces.length === 1 ? "" : "s"}`,
          actions: [
            {
              kind: "button",
              id: "new",
              label: "New workspace",
              variant: "primary",
              icon: <Plus className="w-3.5 h-3.5" />,
              href: "/admin/workspaces/new",
            },
          ],
        }}
        breadcrumbs={[{ label: "Workspaces" }]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {workspaces.map((w) => (
          <Link
            key={w.id}
            href={`/admin/workspaces/${w.id}`}
            className="border border-neutral-200/60 rounded-xl bg-background-100 p-4 hover:border-primary-300 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: w.color }}
              />
              <div className="font-medium text-foreground">{w.name}</div>
              {w.isDefault && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-neutral-200 text-foreground-500 uppercase">
                  Default
                </span>
              )}
            </div>
            {w.description && (
              <p className="text-xs text-foreground-500 mb-3 line-clamp-2">{w.description}</p>
            )}
            <div className="flex gap-4 text-xs text-foreground-500">
              <span>
                {actorsByWorkspace.get(w.id) ?? 0} actor
                {(actorsByWorkspace.get(w.id) ?? 0) === 1 ? "" : "s"}
              </span>
              <span>
                {membersByWorkspace.get(w.id)?.size ?? 0} member
                {(membersByWorkspace.get(w.id)?.size ?? 0) === 1 ? "" : "s"}
              </span>
            </div>
          </Link>
        ))}
        {workspaces.length === 0 && (
          <p className="text-sm text-foreground-400 col-span-full">No workspaces yet.</p>
        )}
      </div>
    </div>
  );
}

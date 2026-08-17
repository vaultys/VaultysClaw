import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { WorkspaceDAO, ActorDAO, CapabilityCertificateDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { ActorKindBadge } from "@/components/ActorKindBadge";
import ActorSearchSelect from "@/components/ActorSearchSelect";
import { encodeDidParam } from "@/lib/actor-route";
import { categoryForKind } from "@/lib/actor-kinds";
import { updateWorkspaceAction, assignActorWorkspaceAction } from "../actions";
import type { CertScope } from "@vaultysclaw/policy";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "actors", label: "Actors" },
  { id: "access", label: "Access" },
  { id: "budgets", label: "Budgets & Model Access" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function TabLink({ id, active, label }: { id: string; active: boolean; label: string }) {
  return (
    <Link
      href={`?tab=${id}`}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? "border-primary-600 text-primary-700"
          : "border-transparent text-foreground-500 hover:text-foreground"
      }`}
    >
      {label}
    </Link>
  );
}

/**
 * Workspace detail (docs/PAGE_DESIGN.md §1.7): Overview/Actors/Access tabs are
 * real, backed by the existing schema; Budgets & Model Access is a stub —
 * that needs the token-budget + model-registry schema this rebuild hasn't
 * ported yet (rebuild doc §8, step 4+).
 */
export default async function WorkspaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const workspace = await WorkspaceDAO.findById(id);
  if (!workspace) notFound();

  const activeTab: TabId = TABS.some((t) => t.id === tabParam) ? (tabParam as TabId) : "overview";

  const [workspaceActors, allActors, activeCerts] = await Promise.all([
    ActorDAO.list({ workspaceId: id }),
    ActorDAO.list(),
    CapabilityCertificateDAO.list({ status: "active" }),
  ]);

  const unassignedActors = allActors.filter((a) => a.workspaceId !== id);

  const actorByDid = new Map(allActors.map((a) => [a.did, a]));
  const workspaceAccessCerts = activeCerts.filter((cert) => {
    const scope = cert.scope as CertScope | null;
    const holderKind = actorByDid.get(cert.agentDid)?.kind;
    return scope?.resource === `workspace:${id}` && !!holderKind && categoryForKind(holderKind) === "human";
  });

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <PageChrome
        toolbar={{ title: workspace.name }}
        breadcrumbs={[
          { label: "Workspaces", href: "/admin/workspaces" },
          { label: workspace.name },
        ]}
      />

      <Link
        href="/admin/workspaces"
        className="inline-flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Workspaces
      </Link>

      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: workspace.color }} />
        <h1 className="text-lg font-semibold text-foreground">{workspace.name}</h1>
        {workspace.isDefault && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-neutral-200 text-foreground-500 uppercase">
            Default
          </span>
        )}
      </div>

      <div className="flex gap-1 border-b border-neutral-200/60">
        {TABS.map((t) => (
          <TabLink key={t.id} id={t.id} label={t.label} active={activeTab === t.id} />
        ))}
      </div>

      {activeTab === "overview" && (
        <section className="space-y-4 border border-neutral-200/60 rounded-xl bg-background-100 p-4 max-w-lg">
          <form action={updateWorkspaceAction} className="space-y-4">
            <input type="hidden" name="id" value={workspace.id} />
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
              <input
                type="text"
                name="name"
                defaultValue={workspace.name}
                required
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Description</label>
              <textarea
                name="description"
                rows={3}
                defaultValue={workspace.description ?? ""}
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Color</label>
              <input
                type="color"
                name="color"
                defaultValue={workspace.color}
                className="h-9 w-16 border border-neutral-200 rounded-lg bg-background p-0.5"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Save changes
            </button>
          </form>
          <p className="text-xs text-foreground-400 pt-2 border-t border-neutral-200/60">
            Slug: <span className="font-mono">{workspace.slug}</span> · Created{" "}
            {workspace.createdAt.toISOString().slice(0, 10)}
          </p>
        </section>
      )}

      {activeTab === "actors" && (
        <section className="space-y-4">
          <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
            <table className="w-full text-sm bg-background-100">
              <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Kind</th>
                  <th className="px-4 py-2 font-medium">DID</th>
                  <th className="px-4 py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workspaceActors.map((a) => (
                  <tr key={a.did} className="border-t border-neutral-200/60">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/actors/${encodeDidParam(a.did)}`}
                        className="text-foreground hover:text-primary-600 hover:underline"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <ActorKindBadge kind={a.kind} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-foreground-500 font-mono">{a.did}</td>
                    <td className="px-4 py-2.5">
                      <form action={assignActorWorkspaceAction}>
                        <input type="hidden" name="did" value={a.did} />
                        <input type="hidden" name="workspaceId" value="" />
                        <button
                          type="submit"
                          className="text-xs px-2 py-1 border border-neutral-200 text-foreground-600 rounded hover:bg-background-200 transition-colors"
                        >
                          Remove from workspace
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {workspaceActors.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-foreground-400">
                      No actors assigned to this workspace yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {unassignedActors.length > 0 && (
            <form
              action={assignActorWorkspaceAction}
              className="flex items-end gap-2 border border-neutral-200/60 rounded-xl bg-background-100 p-4"
            >
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <div className="flex-1">
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Assign an actor
                </label>
                <ActorSearchSelect
                  name="did"
                  required
                  actors={unassignedActors.map((a) => ({
                    did: a.did,
                    name: a.name,
                    kind: a.kind,
                  }))}
                  emptyLabel="Select an actor to assign"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Assign
              </button>
            </form>
          )}
        </section>
      )}

      {activeTab === "access" && (
        <section className="space-y-4">
          <p className="text-xs text-foreground-400">
            Workspace-level admin/member management, expressed as scoped certificates
            (<code className="font-mono">CertScope.resource = &quot;workspace:{workspace.id}&quot;</code>)
            rather than a separate role table (docs/CERTIFICATE_WEB_OF_TRUST.md §3.3).
          </p>
          <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
            <table className="w-full text-sm bg-background-100">
              <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Human</th>
                  <th className="px-4 py-2 font-medium">Capabilities</th>
                  <th className="px-4 py-2 font-medium">Certificate</th>
                </tr>
              </thead>
              <tbody>
                {workspaceAccessCerts.map((cert) => {
                  const actor = actorByDid.get(cert.agentDid);
                  return (
                    <tr key={cert.id} className="border-t border-neutral-200/60">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/actors/${encodeDidParam(cert.agentDid)}`}
                          className="text-foreground hover:text-primary-600 hover:underline"
                        >
                          {actor?.name ?? cert.agentDid}
                        </Link>
                      </td>
                      <td className="px-4 py-2.5 text-foreground-700">
                        {(cert.capabilities as string[]).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/admin/certificates/${cert.id}`}
                          className="text-xs text-primary-600 hover:underline font-mono"
                        >
                          {cert.id.slice(0, 8)}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
                {workspaceAccessCerts.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-foreground-400">
                      No workspace-scoped grants yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Link
            href={`/admin/certificates/new?resource=${encodeURIComponent(`workspace:${workspace.id}`)}`}
            className="text-sm text-primary-600 hover:underline"
          >
            Issue a workspace-scoped certificate →
          </Link>
        </section>
      )}

      {activeTab === "budgets" && (
        <section className="border border-dashed border-neutral-300 rounded-xl p-6 text-center">
          <h2 className="text-sm font-semibold text-foreground mb-1">Budgets & Model Access</h2>
          <p className="text-sm text-foreground-500">
            Token budgets, router keys, and allowed models — not ported into this rebuild yet
            (docs/REBUILD_ARCHITECTURE.md §8, step 4+). See{" "}
            <span className="font-mono">packages/controlplane/CLAUDE.md</span>.
          </p>
        </section>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { WorkspaceDAO, ActorDAO, CapabilityCertificateDAO, SrtTemplateDAO, KillSwitchDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { ActorKindBadge } from "@/components/ActorKindBadge";
import ActorSearchSelect from "@/components/ActorSearchSelect";
import DeleteWorkspacePanel from "@/components/DeleteWorkspacePanel";
import KillSwitchPanel from "@/components/KillSwitchPanel";
import WorkspaceTemplates from "@/components/WorkspaceTemplates";
import { encodeDidParam } from "@/lib/actor-route";
import { categoryForKind } from "@/lib/actor-kinds";
import TrustPolicyForm from "@/components/TrustPolicyForm";
import { getOrgTrustDefaults, resolveTrustPolicy } from "@/lib/trust-policy";
import { updateWorkspaceAction, assignActorWorkspaceAction } from "../actions";
import type { CertScope } from "@vaultysclaw/policy";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "actors", label: "Actors" },
  { id: "access", label: "Access" },
  { id: "confinement", label: "Confinement" },
  { id: "settings", label: "Settings" },
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

/** Where an effective trust-policy value came from — see `lib/trust-policy.ts`. */
function SourceBadge({ source }: { source: "workspace" | "org" }) {
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded-full border uppercase tracking-wide ${
        source === "workspace"
          ? "border-primary-200 text-primary-700 bg-primary-100/50"
          : "border-neutral-200 text-foreground-500"
      }`}
    >
      {source === "workspace" ? "This workspace" : "Inherited"}
    </span>
  );
}

/**
 * Workspace detail (docs/PAGE_DESIGN.md §1.7). Budgets & Model Access is a stub —
 * that needs the token-budget + model-registry schema this rebuild hasn't
 * ported yet (rebuild doc §8, step 4+); every other tab is real.
 *
 * **Overview reads, Settings writes.** Overview carries no form at all: it answers
 * "what is this workspace and what is currently in force for it", including the
 * *effective* trust policy with each field marked inherited or overridden. Everything
 * that changes the workspace — kill switch, trust policy, identity, deletion — lives
 * on Settings, so an admin is never one stray click from a fleet-wide change while
 * reading a summary.
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

  const [
    workspaceActors,
    allActors,
    activeCerts,
    scopedCerts,
    allTemplates,
    attachedTemplates,
    killSwitch,
    trustPolicy,
    orgTrust,
  ] =
    await Promise.all([
      ActorDAO.list({ workspaceId: id }),
      ActorDAO.list(),
      CapabilityCertificateDAO.list({ status: "active" }),
      // What a delete would actually revoke — both the `workspaceId`-stamped and the
      // `CertScope`-pinned certificates, of every kind, not just the humans the Access
      // tab lists below.
      WorkspaceDAO.listActiveScopedCertificates(id),
      SrtTemplateDAO.list(),
      SrtTemplateDAO.listForWorkspace(id),
      KillSwitchDAO.findByWorkspace(id),
      // What this workspace's Actors are actually pushed, overrides and inheritance
      // already settled — the same call `lib/actor-config.ts` makes, so the page
      // cannot describe a policy the fleet isn't running.
      resolveTrustPolicy(id),
      getOrgTrustDefaults(),
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
        <section className="space-y-4 max-w-lg">
          <div className="border border-neutral-200/60 rounded-xl bg-background-100 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Identity</h2>
            <dl className="text-sm space-y-1.5">
              <div className="flex gap-2">
                <dt className="text-foreground-500 w-28 shrink-0">Slug</dt>
                <dd className="font-mono text-xs pt-0.5">{workspace.slug}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-foreground-500 w-28 shrink-0">Created</dt>
                <dd>{workspace.createdAt.toISOString().slice(0, 10)}</dd>
              </div>
              {workspace.description && (
                <div className="flex gap-2">
                  <dt className="text-foreground-500 w-28 shrink-0">Description</dt>
                  <dd className="text-foreground-700">{workspace.description}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Actors", value: workspaceActors.length, tab: "actors" },
              { label: "Scoped grants", value: scopedCerts.length, tab: "access" },
              { label: "Templates", value: attachedTemplates.length, tab: "confinement" },
            ].map((stat) => (
              <Link
                key={stat.label}
                href={`?tab=${stat.tab}`}
                className="border border-neutral-200/60 rounded-xl bg-background-100 p-4 hover:border-primary-300 transition-colors"
              >
                <div className="text-xl font-semibold text-foreground">{stat.value}</div>
                <div className="text-xs text-foreground-500">{stat.label}</div>
              </Link>
            ))}
          </div>

          {/* Read-only on purpose: the arm/disarm control is one tab away, and an
              admin reading a summary should not be able to cut a fleet off by
              mis-clicking inside it. */}
          <div
            className={`border rounded-xl p-4 ${
              killSwitch
                ? "border-danger-200 bg-danger-100/50"
                : "border-neutral-200/60 bg-background-100"
            }`}
          >
            <h2
              className={`text-sm font-semibold ${
                killSwitch ? "text-danger-700" : "text-foreground"
              }`}
            >
              Kill switch {killSwitch ? "ARMED" : "disarmed"}
            </h2>
            {killSwitch ? (
              <dl className="text-xs text-foreground-600 space-y-1 mt-2">
                <div>
                  <dt className="inline font-medium">Reason: </dt>
                  <dd className="inline">{killSwitch.reason}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Armed by: </dt>
                  <dd className="inline font-mono">{killSwitch.armedBy}</dd>
                </div>
                <div>
                  <dt className="inline font-medium">Armed at: </dt>
                  <dd className="inline">{killSwitch.armedAt.toISOString()}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-foreground-500 mt-1">
                Every non-human Actor in this workspace is authorized normally.
              </p>
            )}
            <Link href="?tab=settings" className="text-xs text-primary-600 hover:underline">
              {killSwitch ? "Disarm in Settings →" : "Arm in Settings →"}
            </Link>
          </div>

          {/* The effective policy, not the stored columns: what this workspace's
              Actors are actually pushed. Each field says where it came from,
              because "closed" alone can't distinguish a deliberate local choice
              from an org default that may change under it. */}
          <div className="border border-neutral-200/60 rounded-xl bg-background-100 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-foreground">Trust policy in force</h2>
            <dl className="text-sm space-y-2">
              <div className="flex gap-2 items-baseline">
                <dt className="text-foreground-500 w-28 shrink-0">Fail mode</dt>
                <dd className="flex items-center gap-2">
                  <span className="text-foreground">
                    {trustPolicy.failClosed ? "closed" : "open"}
                  </span>
                  <SourceBadge source={trustPolicy.source.failMode} />
                </dd>
              </div>
              <div className="flex gap-2 items-baseline">
                <dt className="text-foreground-500 w-28 shrink-0">Staple TTL</dt>
                <dd className="flex items-center gap-2">
                  <span className="text-foreground">
                    {trustPolicy.stapleTtlSeconds < 0
                      ? "unbounded"
                      : `${trustPolicy.stapleTtlSeconds}s`}
                  </span>
                  <SourceBadge source={trustPolicy.source.stapleTtl} />
                </dd>
              </div>
            </dl>
            <p className="text-xs text-foreground-400">
              An interception point (<span className="font-mono">proxy</span>,{" "}
              <span className="font-mono">harness</span>) keeps the staleness bound from its own
              config — it decides offline and cannot run a live query — but the fail mode above
              applies to it too.
            </p>
            <Link href="?tab=settings" className="text-xs text-primary-600 hover:underline">
              Change in Settings →
            </Link>
          </div>
        </section>
      )}

      {activeTab === "settings" && (
        <div className="space-y-6 max-w-lg">
          {/* First, as on /admin/settings: this is the control an admin comes here
              for during an incident, and hunting for it below the configuration
              sections is the wrong thing to be doing at that moment. Available for
              the default workspace too — it is the one most likely to hold a
              misbehaving fleet. */}
          <KillSwitchPanel
            scope="workspace"
            workspaceId={workspace.id}
            workspaceName={workspace.name}
            armed={
              killSwitch
                ? {
                    reason: killSwitch.reason,
                    armedBy: killSwitch.armedBy,
                    armedAt: killSwitch.armedAt.toISOString(),
                  }
                : null
            }
          />

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground-700">Trust policy</h2>
            <p className="text-xs text-foreground-400">
              What this workspace&apos;s verifiers do when they can&apos;t reach the control plane
              (docs/CERTIFICATE_WEB_OF_TRUST.md §5). Each field inherits the
              organization&apos;s{" "}
              <Link href="/admin/settings" className="text-primary-600 hover:underline">
                default
              </Link>{" "}
              independently until you set it here. Saving re-pushes the policy to this
              workspace&apos;s connected Actors immediately — the rest pick it up on their next
              connection.
            </p>
            <TrustPolicyForm
              scope="workspace"
              workspaceId={workspace.id}
              value={{
                failMode: workspace.certFailMode,
                stapleTtlSeconds: workspace.certStapleTtlSeconds,
              }}
              inherited={{
                failMode: orgTrust.failMode,
                stapleTtlSeconds: orgTrust.stapleTtlSeconds,
              }}
            />
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground-700">Workspace identity</h2>
            <form
              action={updateWorkspaceAction}
              className="space-y-4 border border-neutral-200/60 rounded-xl bg-background-100 p-4"
            >
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
                <label className="block text-sm font-medium text-foreground mb-1.5">
                  Description
                </label>
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
          </section>

          {workspace.isDefault ? (
            <p className="text-xs text-foreground-400">
              The default workspace cannot be deleted — the control plane recreates it at boot
              (<span className="font-mono">WorkspaceDAO.ensureDefault</span>), and everything that
              falls back to it would point at nothing in the meantime.
            </p>
          ) : (
            <DeleteWorkspacePanel
              id={workspace.id}
              name={workspace.name}
              actorCount={workspaceActors.length}
              scopedCertificateCount={scopedCerts.length}
            />
          )}
        </div>
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

      {activeTab === "confinement" && (
        <section className="space-y-4 border border-neutral-200/60 rounded-xl bg-background-100 p-4 max-w-lg">
          <div>
            <h2 className="text-sm font-semibold text-foreground mb-1">Confinement templates</h2>
            <p className="text-xs text-foreground-500">
              Reusable tier-B settings offered when issuing a certificate to an actor in this
              workspace; the one marked <strong>Default</strong> is pre-selected. A template{" "}
              <strong>grants nothing and enforces nothing on its own</strong> — the signed
              certificate is the artefact, and editing a template never reaches back into grants
              already issued.
            </p>
          </div>

          <WorkspaceTemplates
            workspaceId={workspace.id}
            attached={attachedTemplates}
            allTemplates={allTemplates}
          />

          <p className="text-xs text-foreground-400 pt-2 border-t border-neutral-200/60">
            Templates themselves are created under{" "}
            <Link href="/admin/certificates/templates" className="text-primary-600 hover:underline">
              Certificates → Confinement templates
            </Link>
            .
          </p>
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

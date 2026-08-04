import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CapabilityCertificateDAO, ActorDAO, UserDAO, WorkspaceDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { revokeCertificateAction } from "@/app/admin/certificates/actions";
import { updateActorAction } from "../actions";
import { decodeDidParam } from "@/lib/actor-route";
import type { CertScope } from "@vaultysclaw/policy";

const KIND_BADGE: Record<string, string> = {
  openclaw: "bg-primary-100 text-primary-700 border-primary-200",
  mcp: "bg-secondary-100 text-secondary-700 border-secondary-200",
  sensor: "bg-neutral-100 text-foreground-600 border-neutral-200",
  human: "bg-success-100 text-success-700 border-success-200",
};

const STATUS_BADGE: Record<string, string> = {
  active: "bg-success-100 text-success-700 border-success-200",
  revoked: "bg-danger-100 text-danger-700 border-danger-200",
  superseded: "bg-neutral-100 text-foreground-500 border-neutral-200",
  expired: "bg-neutral-100 text-foreground-500 border-neutral-200",
};

/**
 * Actor detail (docs/PAGE_DESIGN.md §1.3's natural companion to the
 * Certificates detail page): everything known about one DID-holder, an edit
 * form for the fields an admin can actually change (name, workspace, and —
 * humans only — email; `did`/`kind`/`publicKey` are captured once at
 * registration and never change), and every certificate issued to it.
 */
export default async function ActorDetailPage({
  params,
}: {
  params: Promise<{ did: string }>;
}) {
  const { did: didParam } = await params;
  const did = decodeDidParam(didParam);
  const actor = await ActorDAO.findByDid(did);
  if (!actor) notFound();

  const [certs, workspaces, human] = await Promise.all([
    CapabilityCertificateDAO.list({ agentDid: did }),
    WorkspaceDAO.list(),
    actor.kind === "human" ? UserDAO.findByDid(did) : Promise.resolve(null),
  ]);

  const activeCount = certs.filter((c) => c.status === "active").length;

  return (
    <div className="p-6 max-w-3xl space-y-8">
      <PageChrome
        toolbar={{ title: actor.name }}
        breadcrumbs={[
          { label: "Actors", href: "/admin/actors" },
          { label: actor.name },
        ]}
      />

      <Link
        href="/admin/actors"
        className="inline-flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to Actors
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{actor.name}</h1>
          <p className="text-xs text-foreground-500 font-mono mt-0.5">{actor.did}</p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full border shrink-0 ${KIND_BADGE[actor.kind] ?? "bg-neutral-100 text-foreground-600 border-neutral-200"
            }`}
        >
          {actor.kind}
        </span>
      </div>

      <section className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Registered</div>
          <div>{actor.registeredAt.toISOString()}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Last seen</div>
          <div>{actor.lastSeen.toISOString()}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">
            Active certificates
          </div>
          <div>{activeCount}</div>
        </div>
        <div>
          <div className="text-xs text-foreground-500 uppercase font-medium mb-1">Public key</div>
          <div className="text-xs font-mono break-all text-foreground-500">
            {actor.publicKey ?? "—"}
          </div>
        </div>
      </section>

      <section className="space-y-4 border border-neutral-200/60 rounded-xl bg-background-100 p-4">
        <h2 className="text-sm font-semibold text-foreground-700">Edit</h2>
        <form action={updateActorAction} className="space-y-4">
          <input type="hidden" name="did" value={actor.did} />
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Name</label>
            <input
              type="text"
              name="name"
              defaultValue={actor.name}
              required
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Workspace</label>
            <select
              name="workspaceId"
              defaultValue={actor.workspaceId ?? ""}
              className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
            >
              <option value="">No workspace</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {actor.kind === "human" && (
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">Email</label>
              <input
                type="email"
                name="email"
                defaultValue={human?.humanProfile?.email ?? ""}
                placeholder="Used for email notifications — optional"
                className="w-full border border-neutral-200 rounded-lg px-3 py-2 text-sm bg-background"
              />
            </div>
          )}
          <button
            type="submit"
            className="px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Save changes
          </button>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground-700">
            Certificates ({certs.length})
          </h2>
          <Link
            href={`/admin/certificates/new`}
            className="text-xs text-primary-600 hover:underline"
          >
            Issue certificate →
          </Link>
        </div>
        <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
          <table className="w-full text-sm bg-background-100">
            <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Capabilities</th>
                <th className="px-4 py-2 font-medium">Scope</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((cert) => {
                const scope = cert.scope as CertScope | null;
                return (
                  <tr key={cert.id} className="border-t border-neutral-200/60 align-top">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/admin/certificates/${cert.id}`}
                        className="text-foreground-700 hover:text-primary-600 hover:underline"
                      >
                        {(cert.capabilities as string[]).join(", ") || "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-foreground-500">
                      {scope?.resource ?? scope?.resourcePattern ?? "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[cert.status] ?? STATUS_BADGE.expired}`}
                        title={cert.revokedReason ?? undefined}
                      >
                        {cert.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {cert.expiresAt ? (
                        <span className="text-foreground-500">
                          {cert.expiresAt.toISOString().slice(0, 10)}
                        </span>
                      ) : (
                        <span className="text-warning-600 font-medium">Never</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {cert.status === "active" && (
                        <form action={revokeCertificateAction} className="flex items-center gap-1.5">
                          <input type="hidden" name="certId" value={cert.id} />
                          <input
                            type="text"
                            name="reason"
                            placeholder="Reason"
                            className="text-xs border border-neutral-200 rounded px-1.5 py-1 w-24 bg-background"
                          />
                          <button
                            type="submit"
                            className="text-xs px-2 py-1 border border-danger-200 text-danger-600 rounded hover:bg-danger-50 transition-colors"
                          >
                            Revoke
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
              {certs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-foreground-400">
                    No certificates issued to this Actor yet.
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

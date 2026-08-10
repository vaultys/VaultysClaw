import Link from "next/link";
import { Info, Plus } from "lucide-react";
import { CapabilityCertificateDAO, ActorDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import { revokeCertificateAction } from "./actions";
import type { CertScope, ResourceLimits } from "@vaultysclaw/policy";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-success-100 text-success-700 border-success-200",
  revoked: "bg-danger-100 text-danger-700 border-danger-200",
  superseded: "bg-neutral-100 text-foreground-500 border-neutral-200",
  expired: "bg-neutral-100 text-foreground-500 border-neutral-200",
};

/**
 * Certificates (docs/PAGE_DESIGN.md §1.5) — the ledger, front and center.
 * `expiresAt: null` ("Never") is rendered in warning-amber, never a neutral
 * color, per the "loud, not silent" rule for indefinite grants
 * (docs/CERTIFICATE_WEB_OF_TRUST.md §3.3).
 */
export default async function CertificatesPage() {
  const [certs, actors] = await Promise.all([
    CapabilityCertificateDAO.list(),
    ActorDAO.list(),
  ]);
  const actorByDid = new Map(actors.map((p) => [p.did, p]));

  return (
    <div className="p-6 space-y-4">
      <PageChrome
        toolbar={{
          title: "Certificates",
          description: `${certs.length} total · ${certs.filter((c) => c.status === "active").length} active`,
          actions: [
            {
              kind: "button",
              id: "issue",
              label: "Issue certificate",
              variant: "primary",
              icon: <Plus className="w-3.5 h-3.5" />,
              href: "/admin/certificates/new",
            },
          ],
        }}
        breadcrumbs={[{ label: "Certificates" }]}
      />

      <section className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3">
        <div className="flex gap-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary-700" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Certificates are the permission ledger
            </h2>
            <p className="mt-1 text-sm leading-6 text-foreground-600">
              A certificate says which actor can use which capability, in which scope, and until
              when. Prefer short-lived grants; an expiry of "Never" is shown loudly because it
              deserves a deliberate review.
            </p>
          </div>
        </div>
      </section>

      <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
      <table className="w-full text-sm bg-background-100">
        <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
          <tr>
            <th className="px-4 py-2 font-medium">Actor</th>
            <th className="px-4 py-2 font-medium">Capabilities</th>
            <th className="px-4 py-2 font-medium">Scope</th>
            <th className="px-4 py-2 font-medium">Status</th>
            <th className="px-4 py-2 font-medium">Expires</th>
            <th className="px-4 py-2 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {certs.map((cert) => {
            const actor = actorByDid.get(cert.agentDid);
            const capabilities = cert.capabilities as string[];
            const scope = cert.scope as CertScope | null;
            void (cert.resourceLimits as ResourceLimits | null);
            return (
              <tr key={cert.id} className="border-t border-neutral-200/60 align-top">
                <td className="px-4 py-2.5">
                  <Link
                    href={`/admin/certificates/${cert.id}`}
                    className="text-foreground font-medium hover:text-primary-600 hover:underline"
                  >
                    {actor?.name ?? cert.agentDid}
                  </Link>
                  <div className="text-xs text-foreground-500 font-mono">{cert.agentDid}</div>
                </td>
                <td className="px-4 py-2.5 text-foreground-700">
                  {capabilities.length > 0 ? capabilities.join(", ") : "—"}
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
                    <span className="text-foreground-500">{cert.expiresAt.toISOString().slice(0, 10)}</span>
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
              <td colSpan={6} className="px-4 py-6 text-center text-foreground-400">
                No certificates issued yet. Actors can be registered without being trusted; issue a
                certificate when you are ready to grant a capability.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      <p className="text-xs text-foreground-400">
        Revoking is a ledger write, not a forced disconnect — it takes effect the next time
        anyone checks this Actor&apos;s status, not immediately on an open connection.
      </p>

      <div className="pt-2">
        <Link href="/admin/certificates/new" className="text-sm text-primary-600 hover:underline">
          Issue certificate →
        </Link>
      </div>
    </div>
  );
}

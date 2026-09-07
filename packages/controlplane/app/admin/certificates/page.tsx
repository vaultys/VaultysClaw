import Link from "next/link";
import { Info, Plus } from "lucide-react";
import { CapabilityCertificateDAO, ActorDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";
import CertificateDirectoryPanel from "@/components/CertificateDirectoryPanel";
import { revokeCertificateAction } from "./actions";
import type { CertScope, ResourceLimits } from "@vaultysclaw/policy";

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

      <CertificateDirectoryPanel
        certificates={certs.map((cert) => {
          const actor = actorByDid.get(cert.agentDid);
          const scope = cert.scope as CertScope | null;
          void (cert.resourceLimits as ResourceLimits | null);
          return {
            id: cert.id,
            actorName: actor?.name ?? cert.agentDid,
            agentDid: cert.agentDid,
            capabilities: cert.capabilities as string[],
            scopeLabel: scope?.resource ?? scope?.resourcePattern ?? "-",
            status: cert.status,
            expiresLabel: cert.expiresAt ? cert.expiresAt.toISOString().slice(0, 10) : "Never",
            revokedReason: cert.revokedReason,
          };
        })}
        revokeAction={revokeCertificateAction}
      />

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

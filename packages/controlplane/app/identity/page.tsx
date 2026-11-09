import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { ActorDAO, CapabilityCertificateDAO } from "@/db";
import { ActorKindBadge } from "@/components/ActorKindBadge";
import BrowserIdentitiesPanel from "@/components/BrowserIdentitiesPanel";
import IdentityTabs from "@/components/IdentityTabs";
import type { CertScope } from "@vaultysclaw/policy";
import { Badge, statusTone } from "@/components/ui/Badge";

/**
 * My identity — who this session is, and what it holds.
 *
 * Shows certificates directly rather than linking to `/portal`: that page is
 * gated on `portal_access`, so an admin without it could not see their own
 * grants. Reading your own certificates is not a capability.
 */
export default async function IdentityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const did = session!.user!.did!;
  const { tab } = await searchParams;

  // Browser-key management is a production feature now, just an opt-in one — the
  // tab strip lives in `IdentityTabs`, which is where the advanced-mode flag can
  // actually be read (localStorage, client-only).
  const activeTab = tab === "browser" ? "browser" : "identity";

  const [actor, certs] = await Promise.all([
    ActorDAO.findByDid(did),
    CapabilityCertificateDAO.list({ agentDid: did }),
  ]);

  const active = certs.filter((c) => c.status === "active");

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-medium text-foreground">My identity</h1>
        <p className="mt-0.5 text-sm text-foreground-500">
          The VaultysID this session is signed in as, and the access it
          currently holds.
        </p>
      </div>

      <IdentityTabs activeTab={activeTab} />

      {activeTab === "browser" ? (
        <BrowserIdentitiesPanel currentDid={did} />
      ) : (
        <>
          <section className="space-y-3 rounded-xl border border-neutral-200/60 bg-background-100 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">
                  {actor?.name ?? "Unnamed"}
                </div>
                <div className="mt-0.5 break-all font-mono text-xs text-foreground-500">
                  {did}
                </div>
              </div>
              {actor && (
                <div className="shrink-0">
                  <ActorKindBadge kind={actor.kind} />
                </div>
              )}
            </div>

            <dl className="grid grid-cols-2 gap-4 pt-2 text-sm">
              <div>
                <dt className="mb-1 text-xs text-foreground-500">
                  Registered
                </dt>
                <dd className="font-mono text-xs text-foreground-700">
                  {actor ? actor.registeredAt.toISOString() : "—"}
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-xs text-foreground-500">
                  Last seen
                </dt>
                <dd className="font-mono text-xs text-foreground-700">
                  {actor ? actor.lastSeen.toISOString() : "—"}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="mb-1 text-xs text-foreground-500">
                  Public key
                </dt>
                <dd className="break-all font-mono text-xs text-foreground-500">
                  {actor?.publicKey ?? "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="space-y-3">
            <h2 className="flex items-baseline gap-2 text-sm font-medium text-foreground">
              Access
              <span className="text-xs text-foreground-500">
                <span className="font-mono tabular-nums">{active.length}</span> active
              </span>
            </h2>

            {certs.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-foreground-500">
                You have not been granted any access yet. An admin issues
                certificates; there is no self-service request.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-neutral-200/60">
                <table className="w-full bg-background-100 text-sm">
                  <thead className="border-b border-neutral-200/60 text-left text-xs text-foreground-500">
                    <tr>
                      <th className="px-4 py-2 font-normal">Capability</th>
                      <th className="px-4 py-2 font-normal">Scope</th>
                      <th className="px-4 py-2 font-normal">Status</th>
                      <th className="px-4 py-2 font-normal">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certs.map((cert) => {
                      const scope = cert.scope as CertScope | null;
                      return (
                        <tr
                          key={cert.id}
                          className="border-t border-neutral-200/60 transition-colors hover:bg-background-200/40"
                        >
                          <td className="px-4 py-2 font-mono text-xs text-foreground-700">
                            {(cert.capabilities as string[]).join(", ") || "—"}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-foreground-500">
                            {scope?.resource ?? scope?.resourcePattern ?? "—"}
                          </td>
                          <td className="px-4 py-2">
                            <Badge tone={statusTone(cert.status)}>{cert.status}</Badge>
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-foreground-500">
                            {cert.expiresAt ? (
                              cert.expiresAt.toISOString().slice(0, 10)
                            ) : (
                              // Never neutral — a certificate that does not expire is a
                              // standing grant and should read as one.
                              <Badge tone="caution">Never</Badge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

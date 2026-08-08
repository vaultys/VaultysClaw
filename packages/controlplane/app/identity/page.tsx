import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { ActorDAO, CapabilityCertificateDAO } from "@/db";
import { ActorKindBadge } from "@/components/ActorKindBadge";
import BrowserIdentitiesPanel from "@/components/BrowserIdentitiesPanel";
import type { CertScope } from "@vaultysclaw/policy";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-success-100 text-success-700 border-success-200",
  revoked: "bg-danger-100 text-danger-700 border-danger-200",
  superseded: "bg-neutral-100 text-foreground-500 border-neutral-200",
  expired: "bg-neutral-100 text-foreground-500 border-neutral-200",
};

/** Inlined at build time by Next.js, so this is safe to read in a Server Component too. */
const DEV_MODE = process.env.NODE_ENV !== "production";

/** Plain `?tab=` links, the same pattern as /admin/integrations and the workspace
 *  detail page — keeps the page a Server Component that fetches its own data,
 *  which a client-side tab control could not. */
function TabLink({
  id,
  active,
  label,
}: {
  id: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={id === "identity" ? "/identity" : `/identity?tab=${id}`}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
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

  // The browser-keys tab only exists in dev mode, so an explicit ?tab=browser in
  // production falls back rather than rendering an empty page.
  const activeTab = tab === "browser" && DEV_MODE ? "browser" : "identity";

  const [actor, certs] = await Promise.all([
    ActorDAO.findByDid(did),
    CapabilityCertificateDAO.list({ agentDid: did }),
  ]);

  const active = certs.filter((c) => c.status === "active");

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">My identity</h1>
        <p className="mt-0.5 text-sm text-foreground-500">
          The VaultysID this session is signed in as, and the access it
          currently holds.
        </p>
      </div>

      {DEV_MODE && (
        <div className="flex gap-1 border-b border-neutral-200/60">
          <TabLink
            id="identity"
            active={activeTab === "identity"}
            label="Identity"
          />
          <TabLink
            id="browser"
            active={activeTab === "browser"}
            label="Browser keys"
          />
        </div>
      )}

      {activeTab === "browser" ? (
        <BrowserIdentitiesPanel currentDid={did} />
      ) : (
        <>
          <section className="space-y-3 rounded-xl border border-neutral-200/60 bg-background-100 p-4">
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
                <dt className="mb-1 text-xs font-medium uppercase text-foreground-500">
                  Registered
                </dt>
                <dd>{actor ? actor.registeredAt.toISOString() : "—"}</dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-medium uppercase text-foreground-500">
                  Last seen
                </dt>
                <dd>{actor ? actor.lastSeen.toISOString() : "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="mb-1 text-xs font-medium uppercase text-foreground-500">
                  Public key
                </dt>
                <dd className="break-all font-mono text-xs text-foreground-500">
                  {actor?.publicKey ?? "—"}
                </dd>
              </div>
            </dl>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground-700">
              Access{" "}
              <span className="font-normal text-foreground-400">
                ({active.length} active)
              </span>
            </h2>

            {certs.length === 0 ? (
              <p className="text-sm text-foreground-400">
                You have not been granted any access yet. An admin issues
                certificates; there is no self-service request.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-neutral-200/60">
                <table className="w-full bg-background-100 text-sm">
                  <thead className="bg-background-200/40 text-left text-xs uppercase text-foreground-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Capability</th>
                      <th className="px-4 py-2 font-medium">Scope</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certs.map((cert) => {
                      const scope = cert.scope as CertScope | null;
                      return (
                        <tr
                          key={cert.id}
                          className="border-t border-neutral-200/60"
                        >
                          <td className="px-4 py-2 font-mono text-xs">
                            {(cert.capabilities as string[]).join(", ") || "—"}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-foreground-500">
                            {scope?.resource ?? scope?.resourcePattern ?? "—"}
                          </td>
                          <td className="px-4 py-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs ${
                                STATUS_BADGE[cert.status] ??
                                STATUS_BADGE.expired
                              }`}
                            >
                              {cert.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs">
                            {cert.expiresAt ? (
                              cert.expiresAt.toISOString().slice(0, 10)
                            ) : (
                              // Never neutral — a certificate that does not expire is a
                              // standing grant and should read as one.
                              <span className="text-warning-600">Never</span>
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

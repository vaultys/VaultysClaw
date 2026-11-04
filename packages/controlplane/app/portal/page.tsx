import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { CapabilityCertificateDAO } from "@/db";
import type { CertScope } from "@vaultysclaw/policy";
import { Badge, statusTone } from "@/components/ui/Badge";

/** My Certificates (docs/PAGE_DESIGN.md §2.1) — read-only, no self-service request flow by design. */
export default async function MyCertificatesPage() {
  const session = await getServerSession(authOptions);
  const certs = session?.user?.did
    ? await CapabilityCertificateDAO.list({ agentDid: session.user.did })
    : [];

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="mb-6 text-lg font-medium text-foreground">My Certificates</h1>
      {certs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-neutral-200 px-4 py-6 text-sm text-foreground-500">
          You haven&apos;t been granted any access yet
        </p>
      ) : (
        <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
        <table className="w-full text-sm bg-background-100">
          <thead className="border-b border-neutral-200/60 text-left text-xs text-foreground-500">
            <tr>
              <th className="px-4 py-2 font-normal">Capability</th>
              <th className="px-4 py-2 font-normal">Scope</th>
              <th className="px-4 py-2 font-normal">Issued by</th>
              <th className="px-4 py-2 font-normal">Status</th>
              <th className="px-4 py-2 font-normal">Expires</th>
            </tr>
          </thead>
          <tbody>
            {certs.map((cert) => {
              const scope = cert.scope as CertScope | null;
              return (
                <tr key={cert.id} className="border-t border-neutral-200/60 transition-colors hover:bg-background-200/40">
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground-700">
                    {(cert.capabilities as string[]).join(", ")}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground-500">
                    {scope?.resource ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground-500 font-mono">
                    {cert.issuedBy ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={statusTone(cert.status)}>{cert.status}</Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-foreground-500">
                    {cert.expiresAt ? (
                      cert.expiresAt.toISOString().slice(0, 10)
                    ) : (
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
    </div>
  );
}

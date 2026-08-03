import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-config";
import { CapabilityCertificateDAO } from "@/db";
import type { CertScope } from "@vaultysclaw/policy";

const STATUS_BADGE: Record<string, string> = {
  active: "bg-success-100 text-success-700 border-success-200",
  revoked: "bg-danger-100 text-danger-700 border-danger-200",
  superseded: "bg-neutral-100 text-foreground-500 border-neutral-200",
  expired: "bg-neutral-100 text-foreground-500 border-neutral-200",
};

/** My Certificates (docs/PAGE_DESIGN.md §2.1) — read-only, no self-service request flow by design. */
export default async function MyCertificatesPage() {
  const session = await getServerSession(authOptions);
  const certs = session?.user?.did
    ? await CapabilityCertificateDAO.list({ agentDid: session.user.did })
    : [];

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-lg font-semibold mb-4">My Certificates</h1>
      {certs.length === 0 ? (
        <p className="text-sm text-foreground-400">You haven&apos;t been granted any access yet.</p>
      ) : (
        <div className="overflow-x-auto border border-neutral-200/60 rounded-xl">
        <table className="w-full text-sm bg-background-100">
          <thead className="bg-background-200/40 text-left text-xs text-foreground-500 uppercase">
            <tr>
              <th className="px-4 py-2 font-medium">Capability</th>
              <th className="px-4 py-2 font-medium">Scope</th>
              <th className="px-4 py-2 font-medium">Issued by</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Expires</th>
            </tr>
          </thead>
          <tbody>
            {certs.map((cert) => {
              const scope = cert.scope as CertScope | null;
              return (
                <tr key={cert.id} className="border-t border-neutral-200/60">
                  <td className="px-4 py-2.5">{(cert.capabilities as string[]).join(", ")}</td>
                  <td className="px-4 py-2.5 text-foreground-500">
                    {scope?.resource ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground-500 font-mono">
                    {cert.issuedBy ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_BADGE[cert.status] ?? STATUS_BADGE.expired}`}
                    >
                      {cert.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {cert.expiresAt ? (
                      cert.expiresAt.toISOString().slice(0, 10)
                    ) : (
                      <span className="text-warning-600 font-medium">Never</span>
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

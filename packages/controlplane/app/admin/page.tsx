import { PrincipalDAO, PendingRegistrationDAO, CapabilityCertificateDAO } from "@/db";
import PageChrome from "@/components/layout/PageChrome";

/**
 * Overview (docs/PAGE_DESIGN.md §1.2) — posture summary. Deliberately
 * read-only; no actions live here.
 */
export default async function AdminOverviewPage() {
  const [byKind, pending, activeCerts] = await Promise.all([
    PrincipalDAO.countByKind(),
    PendingRegistrationDAO.listPending(),
    CapabilityCertificateDAO.countActive(),
  ]);

  const totalPrincipals = Object.values(byKind).reduce((a, b) => a + b, 0);

  const tiles = [
    { label: "Principals", value: totalPrincipals, tone: "primary" as const },
    { label: "Pending approval", value: pending.length, tone: pending.length > 0 ? "warning" as const : "neutral" as const },
    { label: "Active certificates", value: activeCerts, tone: "success" as const },
  ];

  const toneClasses: Record<string, string> = {
    primary: "text-primary-600",
    warning: "text-warning-600",
    success: "text-success-600",
    neutral: "text-foreground",
  };

  return (
    <div className="p-6 space-y-8">
      <PageChrome
        toolbar={{ title: "Overview" }}
        breadcrumbs={[{ label: "Overview" }]}
      />

      <div className="grid grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="border border-neutral-200/60 rounded-xl bg-background-100 p-5"
          >
            <div className={`text-3xl font-semibold ${toneClasses[tile.tone]}`}>
              {tile.value}
            </div>
            <div className="text-sm text-foreground-500 mt-1">{tile.label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground-700 mb-3">Principals by kind</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(byKind).length === 0 && (
            <p className="text-sm text-foreground-400">None yet.</p>
          )}
          {Object.entries(byKind).map(([kind, count]) => (
            <span
              key={kind}
              className="text-sm border border-neutral-200 rounded-full px-3 py-1 bg-background-100 text-foreground-700"
            >
              {kind}: {count}
            </span>
          ))}
        </div>
      </div>

      {totalPrincipals <= 1 && pending.length === 0 && (
        <div className="border border-dashed border-neutral-300 rounded-xl p-6 max-w-xl">
          <h2 className="text-sm font-semibold text-foreground mb-1">Getting started</h2>
          <p className="text-sm text-foreground-500">
            Onboard your first agent or MCP server from{" "}
            <span className="text-foreground-700 font-medium">Principals</span>, or configure an
            identity provider under <span className="text-foreground-700 font-medium">Integrations</span>.
          </p>
        </div>
      )}
    </div>
  );
}

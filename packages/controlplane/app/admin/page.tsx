import { PrincipalDAO, PendingRegistrationDAO, CapabilityCertificateDAO } from "@/db";

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

  const tiles = [
    { label: "Principals", value: Object.values(byKind).reduce((a, b) => a + b, 0) },
    { label: "Pending approval", value: pending.length },
    { label: "Active certificates", value: activeCerts },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-3 gap-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="border rounded-lg bg-white p-4">
            <div className="text-2xl font-semibold">{tile.value}</div>
            <div className="text-sm text-gray-500">{tile.label}</div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Principals by kind</h2>
        <div className="flex gap-3">
          {Object.entries(byKind).length === 0 && (
            <p className="text-sm text-gray-400">None yet.</p>
          )}
          {Object.entries(byKind).map(([kind, count]) => (
            <span key={kind} className="text-sm border rounded-full px-3 py-1 bg-white">
              {kind}: {count}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

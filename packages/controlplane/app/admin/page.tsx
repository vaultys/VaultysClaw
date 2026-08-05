import Link from "next/link";
import { ActorDAO, PendingRegistrationDAO, CapabilityCertificateDAO, AuditLogDAO } from "@/db";
import { getWebhookEvent } from "@vaultysclaw/shared";
import PageChrome from "@/components/layout/PageChrome";

/**
 * Overview (docs/PAGE_DESIGN.md §1.2) — posture summary. Deliberately
 * read-only; no actions live here.
 */
export default async function AdminOverviewPage() {
  const [byKind, pending, activeCerts, recentActivity] = await Promise.all([
    ActorDAO.countByKind(),
    PendingRegistrationDAO.listPending(),
    CapabilityCertificateDAO.countActive(),
    AuditLogDAO.recent(20),
  ]);

  const totalActors = Object.values(byKind).reduce((a, b) => a + b, 0);

  const tiles = [
    { label: "Actors", value: totalActors, tone: "primary" as const },
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
        <h2 className="text-sm font-semibold text-foreground-700 mb-3">Actors by kind</h2>
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

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-foreground-700">Recent activity</h2>
          <Link href="/admin/audit" className="text-xs text-primary-600 hover:underline">
            View full Audit Log →
          </Link>
        </div>
        <div className="border border-neutral-200/60 rounded-xl divide-y divide-neutral-200/60">
          {recentActivity.map((entry) => (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="text-xs text-foreground-400 shrink-0 w-36">
                {entry.createdAt.toISOString().replace("T", " ").slice(0, 19)}
              </span>
              <span className="text-foreground-700 truncate">
                {getWebhookEvent(entry.eventType)?.label ?? entry.eventType}
              </span>
              {entry.actorName && (
                <span className="text-foreground-400 truncate">by {entry.actorName}</span>
              )}
            </div>
          ))}
          {recentActivity.length === 0 && (
            <div className="px-4 py-6 text-center text-foreground-400 text-sm">Nothing yet.</div>
          )}
        </div>
      </div>

      {totalActors <= 1 && pending.length === 0 && (
        <div className="border border-dashed border-neutral-300 rounded-xl p-6 max-w-xl">
          <h2 className="text-sm font-semibold text-foreground mb-1">Getting started</h2>
          <p className="text-sm text-foreground-500">
            Onboard your first agent or MCP server from{" "}
            <span className="text-foreground-700 font-medium">Actors</span>, or configure an
            identity provider under <span className="text-foreground-700 font-medium">Integrations</span>.
          </p>
        </div>
      )}
    </div>
  );
}

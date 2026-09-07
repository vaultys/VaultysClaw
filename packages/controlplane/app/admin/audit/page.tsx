import Link from "next/link";
import AuditLogPanel from "@/components/AuditLogPanel";
import { AuditLogDAO, ActorDAO, CapabilityCertificateDAO } from "@/db";
import { getWebhookEvent } from "@vaultysclaw/shared";
import { inspectCertificate } from "@/lib/cert-inspect";
import { encodeDidParam } from "@/lib/actor-route";
import PageChrome from "@/components/layout/PageChrome";
import ActorSearchSelect from "@/components/ActorSearchSelect";

function targetHref(targetType: string | null, targetId: string | null): string | null {
  if (!targetType || !targetId) return null;
  switch (targetType) {
    case "actor":
      return `/admin/actors/${encodeDidParam(targetId)}`;
    case "certificate":
      return `/admin/certificates/${targetId}`;
    case "workspace":
      return `/admin/workspaces/${targetId}`;
    default:
      return null;
  }
}

/**
 * Unified, append-only Audit Log (docs/PAGE_DESIGN.md §1.6) — no edit or delete action exists on
 * this page, full stop; `AuditLogDAO` itself has no such methods either. Filters are plain GET
 * query params (`?eventType=&actorDid=&from=&to=`), no client-side JS needed for that or for the
 * per-row detail disclosure (`<details>`, same pattern as the webhook docs page).
 */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ eventType?: string; actorDid?: string; from?: string; to?: string }>;
}) {
  const { eventType, actorDid, from, to } = await searchParams;
  const filter = {
    eventType: eventType || undefined,
    actorDid: actorDid || undefined,
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  };

  const [entries, eventTypes, total, allActors] = await Promise.all([
    AuditLogDAO.list(filter, 50),
    AuditLogDAO.distinctEventTypes(),
    AuditLogDAO.count(filter),
    ActorDAO.list(),
  ]);

  // Batch-resolve actor kind badges and live-reverify certificate-related entries' signatures —
  // one query each for the whole page, not N+1 per row.
  const certIds = [...new Set(entries.filter((e) => e.targetType === "certificate" && e.targetId).map((e) => e.targetId as string))];
  const certs = await CapabilityCertificateDAO.findManyByIds(certIds);
  const actorByDid = new Map(allActors.map((a) => [a.did, a]));
  const verifiedByCertId = new Map<string, boolean>(
    await Promise.all(
      certs.map(async (c): Promise<[string, boolean]> => {
        const inspected = await inspectCertificate(
          c.certFormat as "packcert" | "challenger",
          c.certificate,
          c.requestCertificate,
          actorByDid.get(c.agentDid)?.publicKey ?? null
        );
        return [c.id, inspected.grantVerified];
      })
    )
  );

  return (
    <div className="p-6 space-y-4">
      <PageChrome
        toolbar={{ title: "Audit Log", description: `${total} entr${total === 1 ? "y" : "ies"}` }}
        breadcrumbs={[{ label: "Audit Log" }]}
      />

      <form className="flex flex-wrap items-end gap-3 border border-neutral-200/60 rounded-xl p-4 bg-background-100">
        <div>
          <label className="block text-xs font-medium text-foreground-500 uppercase mb-1">Event type</label>
          <select
            name="eventType"
            defaultValue={eventType ?? ""}
            className="border border-neutral-200 rounded-lg px-2.5 py-1.5 text-sm bg-background"
          >
            <option value="">All events</option>
            {eventTypes.map((t) => (
              <option key={t} value={t}>
                {getWebhookEvent(t)?.label ?? t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-500 uppercase mb-1">Actor DID</label>
          <div className="w-72">
            <ActorSearchSelect
              name="actorDid"
              defaultValue={actorDid ?? ""}
              actors={allActors.map((actor) => ({
                did: actor.did,
                name: actor.name,
                kind: actor.kind,
              }))}
              emptyLabel="All actors"
              placeholder="Filter actors by name, kind, or DID..."
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-500 uppercase mb-1">From</label>
          <input
            type="date"
            name="from"
            defaultValue={from ?? ""}
            className="border border-neutral-200 rounded-lg px-2.5 py-1.5 text-sm bg-background"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-foreground-500 uppercase mb-1">To</label>
          <input
            type="date"
            name="to"
            defaultValue={to ?? ""}
            className="border border-neutral-200 rounded-lg px-2.5 py-1.5 text-sm bg-background"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Filter
        </button>
        {(eventType || actorDid || from || to) && (
          <Link href="/admin/audit" className="text-sm text-foreground-500 hover:underline">
            Clear
          </Link>
        )}
      </form>

      <AuditLogPanel
        entries={entries.map((entry) => {
          const actor = entry.actorDid ? actorByDid.get(entry.actorDid) : undefined;
          return {
            id: entry.id,
            createdAt: entry.createdAt.toISOString().replace("T", " ").slice(0, 19),
            actorName: entry.actorName,
            actorKind: actor?.kind,
            eventLabel: getWebhookEvent(entry.eventType)?.label ?? entry.eventType,
            eventType: entry.eventType,
            targetId: entry.targetId,
            targetHref: targetHref(entry.targetType, entry.targetId),
            verified:
              entry.targetType === "certificate" && entry.targetId
                ? verifiedByCertId.get(entry.targetId)
                : undefined,
            details: entry.details,
          };
        })}
      />
    </div>
  );
}

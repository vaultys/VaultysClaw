import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { AuditLogDAO, ActorDAO, CapabilityCertificateDAO } from "@/db";
import { getWebhookEvent } from "@vaultysclaw/shared";
import { inspectCertificate } from "@/lib/cert-inspect";
import { encodeDidParam } from "@/lib/actor-route";
import PageChrome from "@/components/layout/PageChrome";
import { ActorKindBadge } from "@/components/ActorKindBadge";

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="text-xs bg-background-200/40 border border-neutral-200/60 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

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

  const [entries, eventTypes, total] = await Promise.all([
    AuditLogDAO.list(filter, 50),
    AuditLogDAO.distinctEventTypes(),
    AuditLogDAO.count(filter),
  ]);

  // Batch-resolve actor kind badges and live-reverify certificate-related entries' signatures —
  // one query each for the whole page, not N+1 per row.
  const actorDids = [...new Set(entries.map((e) => e.actorDid).filter((d): d is string => !!d))];
  const certIds = [...new Set(entries.filter((e) => e.targetType === "certificate" && e.targetId).map((e) => e.targetId as string))];
  const [actors, certs] = await Promise.all([
    ActorDAO.findManyByDid(actorDids),
    CapabilityCertificateDAO.findManyByIds(certIds),
  ]);
  const actorByDid = new Map(actors.map((a) => [a.did, a]));
  const certActorDids = [...new Set(certs.map((c) => c.agentDid))];
  const certActors = await ActorDAO.findManyByDid(certActorDids);
  const certActorByDid = new Map(certActors.map((a) => [a.did, a]));
  const verifiedByCertId = new Map<string, boolean>(
    await Promise.all(
      certs.map(async (c): Promise<[string, boolean]> => {
        const inspected = await inspectCertificate(
          c.certFormat as "packcert" | "challenger",
          c.certificate,
          c.requestCertificate,
          certActorByDid.get(c.agentDid)?.publicKey ?? null
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
          <input
            type="text"
            name="actorDid"
            defaultValue={actorDid ?? ""}
            placeholder="did:vaultys:…"
            className="border border-neutral-200 rounded-lg px-2.5 py-1.5 text-sm bg-background font-mono w-56"
          />
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

      <div className="border border-neutral-200/60 rounded-xl overflow-hidden divide-y divide-neutral-200/60">
        <div className="grid grid-cols-[11rem_1fr_11rem_11rem_5rem] gap-2 px-4 py-2 bg-background-200/40 text-left text-xs text-foreground-500 uppercase font-medium">
          <span>Time</span>
          <span>Actor</span>
          <span>Event</span>
          <span>Target</span>
          <span>Signed</span>
        </div>
        {entries.map((entry) => {
          const actor = entry.actorDid ? actorByDid.get(entry.actorDid) : undefined;
          const href = targetHref(entry.targetType, entry.targetId);
          const verified = entry.targetType === "certificate" && entry.targetId ? verifiedByCertId.get(entry.targetId) : undefined;
          return (
            <details key={entry.id} className="group">
              <summary className="grid grid-cols-[11rem_1fr_11rem_11rem_5rem] gap-2 px-4 py-2.5 items-center cursor-pointer hover:bg-background-200/30 text-sm">
                <span className="text-xs text-foreground-500">{entry.createdAt.toISOString().replace("T", " ").slice(0, 19)}</span>
                <span className="flex items-center gap-1.5 min-w-0">
                  {entry.actorName ? (
                    <span className="truncate">{entry.actorName}</span>
                  ) : (
                    <span className="text-foreground-400 italic">system</span>
                  )}
                  {actor && (
                    <span className="shrink-0">
                      <ActorKindBadge kind={actor.kind} />
                    </span>
                  )}
                </span>
                <span className="text-foreground-700">{getWebhookEvent(entry.eventType)?.label ?? entry.eventType}</span>
                <span>
                  {href ? (
                    // No onClick/stopPropagation here — this is a Server Component page, and an
                    // inline handler isn't serializable across the boundary to next/link's own
                    // Client Component. Clicking also toggles the <details> open as a harmless
                    // side effect alongside the real navigation, rather than fighting that with
                    // client-side JS this page otherwise has none of.
                    <Link href={href} className="text-primary-600 hover:underline truncate block">
                      {entry.targetId}
                    </Link>
                  ) : (
                    <span className="text-foreground-400">—</span>
                  )}
                </span>
                <span>
                  {verified === true && (
                    <span className="inline-flex items-center gap-1 text-xs text-success-700">
                      <ShieldCheck className="w-3.5 h-3.5" /> signed
                    </span>
                  )}
                  {verified === false && <span className="text-xs text-danger-600">invalid</span>}
                </span>
              </summary>
              <div className="px-4 pb-3">
                <JsonBlock value={entry.details} />
              </div>
            </details>
          );
        })}
        {entries.length === 0 && (
          <div className="px-4 py-6 text-center text-foreground-400 text-sm">No audit log entries match these filters.</div>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, ShieldCheck, X } from "lucide-react";
import { ActorKindBadge } from "@/components/ActorKindBadge";

export interface AuditLogRow {
  id: string;
  createdAt: string;
  actorName: string | null;
  actorKind?: string | null;
  eventLabel: string;
  eventType: string;
  targetId: string | null;
  targetHref: string | null;
  verified?: boolean;
  details: unknown;
}

const MAX_VISIBLE_ROWS = 160;

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="text-xs bg-background-200/40 border border-neutral-200/60 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function searchableText(row: AuditLogRow): string {
  return [
    row.createdAt,
    row.actorName ?? "system",
    row.actorKind ?? "",
    row.eventLabel,
    row.eventType,
    row.targetId ?? "",
    JSON.stringify(row.details),
  ].join(" ").toLowerCase();
}

export default function AuditLogPanel({ entries }: { entries: AuditLogRow[] }) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [signedState, setSignedState] = useState("all");

  const eventTypes = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.eventType))).sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return entries.filter((entry) => {
      if (eventType !== "all" && entry.eventType !== eventType) return false;
      if (signedState === "signed" && entry.verified !== true) return false;
      if (signedState === "invalid" && entry.verified !== false) return false;
      if (signedState === "unsigned" && entry.verified !== undefined) return false;
      return needle ? searchableText(entry).includes(needle) : true;
    });
  }, [entries, eventType, query, signedState]);

  const visible = filtered.slice(0, MAX_VISIBLE_ROWS);
  const hiddenCount = filtered.length - visible.length;

  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-neutral-200/60 bg-background-100 p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_14rem_12rem] lg:items-end">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Search audit log
            </label>
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-background px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-foreground-400" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter visible events by actor, target, event, or details..."
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-foreground-400"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  aria-label="Clear audit search"
                  className="rounded p-0.5 text-foreground-400 transition-colors hover:bg-background-200 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Event</label>
            <select
              value={eventType}
              onChange={(event) => setEventType(event.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All visible events</option>
              {eventTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Signature</label>
            <select
              value={signedState}
              onChange={(event) => setSignedState(event.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-background px-3 py-2 text-sm text-foreground"
            >
              <option value="all">All signatures</option>
              <option value="signed">Signed</option>
              <option value="invalid">Invalid</option>
              <option value="unsigned">Not applicable</option>
            </select>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-foreground-500">
          <span>
            Showing {filtered.length} of {entries.length} loaded entries
          </span>
          {(query || eventType !== "all" || signedState !== "all") && (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setEventType("all");
                setSignedState("all");
              }}
              className="font-medium text-primary-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="border border-neutral-200/60 rounded-xl overflow-hidden divide-y divide-neutral-200/60">
        <div className="grid grid-cols-[11rem_1fr_11rem_11rem_5rem] gap-2 px-4 py-2 bg-background-200/40 text-left text-xs text-foreground-500 uppercase font-medium">
          <span>Time</span>
          <span>Actor</span>
          <span>Event</span>
          <span>Target</span>
          <span>Signed</span>
        </div>
        {visible.map((entry) => (
          <details key={entry.id} className="group">
            <summary className="grid grid-cols-[11rem_1fr_11rem_11rem_5rem] gap-2 px-4 py-2.5 items-center cursor-pointer hover:bg-background-200/30 text-sm">
              <span className="text-xs text-foreground-500">{entry.createdAt}</span>
              <span className="flex items-center gap-1.5 min-w-0">
                {entry.actorName ? (
                  <span className="truncate">{entry.actorName}</span>
                ) : (
                  <span className="text-foreground-400 italic">system</span>
                )}
                {entry.actorKind && (
                  <span className="shrink-0">
                    <ActorKindBadge kind={entry.actorKind} />
                  </span>
                )}
              </span>
              <span className="text-foreground-700">{entry.eventLabel}</span>
              <span>
                {entry.targetHref && entry.targetId ? (
                  <Link href={entry.targetHref} className="text-primary-600 hover:underline truncate block">
                    {entry.targetId}
                  </Link>
                ) : (
                  <span className="text-foreground-400">-</span>
                )}
              </span>
              <span>
                {entry.verified === true && (
                  <span className="inline-flex items-center gap-1 text-xs text-success-700">
                    <ShieldCheck className="w-3.5 h-3.5" /> signed
                  </span>
                )}
                {entry.verified === false && <span className="text-xs text-danger-600">invalid</span>}
              </span>
            </summary>
            <div className="px-4 pb-3">
              <JsonBlock value={entry.details} />
            </div>
          </details>
        ))}
        {visible.length === 0 && (
          <div className="px-4 py-6 text-center text-foreground-400 text-sm">
            No audit log entries match these filters.
          </div>
        )}
      </div>
      {hiddenCount > 0 && (
        <p className="text-xs text-foreground-500">
          {hiddenCount} more loaded entries hidden. Refine the search to narrow the list.
        </p>
      )}
    </section>
  );
}

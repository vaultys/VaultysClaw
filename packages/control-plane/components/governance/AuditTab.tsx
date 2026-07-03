import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Clock,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { shortDid, timeAgo } from "@vaultysclaw/shared";
import {
  adminApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { AuditEntry } from "@/lib/contracts";
import { ACTIVITY_LABELS } from "./constants";

export function AuditTab() {
  const router = useRouter();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sourceFilter, setSourceFilter] = useState<"" | "activity" | "intent">(
    ""
  );
  const [statusFilter, setStatusFilter] = useState<
    "" | "success" | "failed" | "pending"
  >("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const { entries } = unwrap(
        await adminApi.governance.audit({
          query: {
            limit: 300,
            ...(sourceFilter ? { source: sourceFilter } : {}),
            ...(statusFilter ? { status: statusFilter } : {}),
          },
        })
      );
      setEntries(entries);
    } catch {
      // keep previous entries on failure
    } finally {
      setLoading(false);
    }
  }, [sourceFilter, statusFilter]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paginated = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const sourceBadge = (source: "activity" | "intent") =>
    source === "activity" ? (
      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium border bg-primary-100 text-primary-700 border-primary-300">
        activity
      </span>
    ) : (
      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium border bg-secondary-100 text-secondary-700 border-secondary-300">
        intent
      </span>
    );

  const statusBadge = (status: string | null) => {
    if (!status) return null;
    if (status === "success")
      return (
        <span className="flex items-center gap-1 text-success-700 text-xs">
          <CheckCircle2 size={11} /> success
        </span>
      );
    if (status === "failed")
      return (
        <span className="flex items-center gap-1 text-danger-600 text-xs">
          <XCircle size={11} /> failed
        </span>
      );
    return (
      <span className="flex items-center gap-1 text-warning-600 text-xs">
        <Clock size={11} /> {status}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={sourceFilter}
          onChange={(e) => {
            setSourceFilter(e.target.value as typeof sourceFilter);
            setPage(1);
          }}
          className="px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All sources</option>
          <option value="activity">Activity log</option>
          <option value="intent">Intent log</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as typeof statusFilter);
            setPage(1);
          }}
          className="px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="">All statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
          <option value="pending">Pending</option>
        </select>
        <button
          onClick={fetchEntries}
          className="p-2 rounded-lg border border-neutral-200 text-foreground-500 hover:text-foreground hover:bg-background-200 transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
        <span className="text-xs text-foreground-400 ml-auto">
          {entries.length} entries · click a row for details
        </span>
      </div>

      <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : paginated.length === 0 ? (
          <div className="px-4 py-12 text-center text-foreground-500 text-sm">
            No audit entries found.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-neutral-200 text-xs text-foreground-400 uppercase tracking-wider">
                    <th className="px-4 py-2 text-left">Source</th>
                    <th className="px-4 py-2 text-left">Event</th>
                    <th className="px-4 py-2 text-left">Agent</th>
                    <th className="px-4 py-2 text-left">Status</th>
                    <th className="px-4 py-2 text-left">Time</th>
                    <th className="px-4 py-2 w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {paginated.map((entry) => (
                    <tr
                      key={entry.id}
                      onClick={() =>
                        router.push(
                          `/admin/governance/audit/${encodeURIComponent(entry.id)}`
                        )
                      }
                      className={`cursor-pointer hover:bg-background-200 transition-colors group ${
                        entry.status === "failed" ||
                        entry.event === "auth_failed"
                          ? "bg-danger-500/5 hover:bg-danger-500/10"
                          : ""
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        {sourceBadge(entry.source)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-foreground font-medium">
                        {ACTIVITY_LABELS[entry.event] ??
                          entry.event.replace(/_/g, " ")}
                      </td>
                      <td
                        className="px-4 py-2.5 text-xs text-foreground-500"
                        title={entry.agentDid ?? ""}
                      >
                        {entry.agentName ??
                          (entry.agentDid ? (
                            shortDid(entry.agentDid)
                          ) : (
                            <span className="italic text-foreground-400">
                              —
                            </span>
                          ))}
                      </td>
                      <td className="px-4 py-2.5">{statusBadge(entry.status)}</td>
                      <td className="px-4 py-2.5 text-xs text-foreground-500 whitespace-nowrap">
                        {timeAgo(entry.timestamp)}
                      </td>
                      <td className="px-4 py-2.5 text-foreground-400 group-hover:text-foreground-500 transition-colors">
                        <ChevronRight size={14} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
                <p className="text-xs text-foreground-400">
                  {(page - 1) * PAGE_SIZE + 1}–
                  {Math.min(page * PAGE_SIZE, entries.length)} of{" "}
                  {entries.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-foreground-500 px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground hover:bg-background-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

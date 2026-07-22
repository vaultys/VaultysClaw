"use client";

import { Clock, X, Loader2, ChevronRight } from "lucide-react";
import type { PendingRegistration } from "@/hooks/useAdminWS";

/** Human-readable "x ago" from an ISO timestamp (treats naive timestamps as UTC). */
export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const parseUTC = (s: string) => new Date(s.endsWith("Z") ? s : s + "Z");
  const seconds = Math.floor((Date.now() - parseUTC(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function RegistrationList({
  registrations,
  selected,
  allSelected,
  rejectingId,
  bulkWorking,
  onToggleAll,
  onToggleOne,
  onApprove,
  onReject,
}: {
  registrations: PendingRegistration[];
  selected: Set<string>;
  allSelected: boolean;
  rejectingId: string | null;
  bulkWorking: boolean;
  onToggleAll: () => void;
  onToggleOne: (id: string) => void;
  onApprove: (reg: PendingRegistration) => void;
  onReject: (reg: PendingRegistration) => void;
}) {
  return (
    <div className="bg-warning-50 border border-warning-200 rounded-xl overflow-hidden">
      {/* List header with select-all */}
      <div className="px-5 py-4 border-b border-warning-200 flex items-center gap-3">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="w-4 h-4 rounded border-neutral-300 accent-primary-500 cursor-pointer"
          title="Select all"
        />
        <Clock className="w-4 h-4 text-warning-600" />
        <h2 className="text-sm font-semibold text-warning-700 flex-1">
          {registrations.length} agent{registrations.length !== 1 ? "s" : ""}{" "}
          awaiting review
        </h2>
      </div>
      <div className="divide-y divide-warning-200">
        {registrations.map((reg) => (
          <div
            key={reg.id}
            className="px-5 py-4 flex items-center gap-3 hover:bg-warning-100/50 transition-colors group"
          >
            {/* Checkbox */}
            <input
              type="checkbox"
              checked={selected.has(reg.id)}
              onChange={() => onToggleOne(reg.id)}
              onClick={(e) => e.stopPropagation()}
              className="w-4 h-4 rounded border-neutral-300 accent-primary-500 cursor-pointer flex-shrink-0"
            />

            {/* Main row — click to approve */}
            <div
              className="flex-1 cursor-pointer min-w-0"
              onClick={() => onApprove(reg)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-foreground">{reg.agentName}</p>
                {reg.kind === "proxy" && (
                  <span className="inline-flex items-center text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-secondary-100 text-secondary-700 border border-secondary-300">
                    Proxy
                  </span>
                )}
                {/* Connected / disconnected badge */}
                {reg.connected ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-success-100 text-success-700 border border-success-300">
                    <span className="w-1.5 h-1.5 rounded-full bg-success-500 inline-block" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-background-200 text-foreground-400 border border-neutral-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 inline-block" />
                    Disconnected
                  </span>
                )}
              </div>
              <p className="text-warning-600/80 text-xs mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Requested {timeAgo(reg.createdAt)}</span>
                {reg.agentDid && (
                  <span
                    className="font-mono text-foreground-400 hover:text-foreground-600 cursor-copy transition-colors"
                    title={reg.agentDid}
                    onClick={(e) => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(reg.agentDid!);
                    }}
                  >
                    {reg.agentDid.slice(0, 20)}…
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onReject(reg);
                }}
                disabled={rejectingId === reg.id || bulkWorking}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-danger-100 hover:bg-danger-200 disabled:opacity-50 disabled:cursor-not-allowed text-danger-700 text-xs font-medium rounded transition-colors"
              >
                {rejectingId === reg.id ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <X size={12} />
                )}
                {rejectingId === reg.id ? "Rejecting…" : "Reject"}
              </button>
              <ChevronRight className="w-5 h-5 text-foreground-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

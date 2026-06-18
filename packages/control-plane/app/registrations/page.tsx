"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminWS } from "@/hooks/useAdminWS";
import {
  ArrowLeft,
  Clock,
  Wifi,
  WifiOff,
  ChevronRight,
  X,
  Loader2,
  Trash2,
} from "lucide-react";

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const parseUTC = (iso: string) =>
    new Date(iso.endsWith("Z") ? iso : iso + "Z");
  const seconds = Math.floor((Date.now() - parseUTC(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function RegistrationsPage() {
  const router = useRouter();
  const { registrations: pendingRegs, connected: wsConnected } = useAdminWS();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  const disconnectedRegs = pendingRegs.filter((r) => !r.connected);
  const allSelected =
    pendingRegs.length > 0 &&
    pendingRegs.every((r) => selected.has(r.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pendingRegs.map((r) => r.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function batchReject(ids: string[], reason: string) {
    setBulkWorking(true);
    setRejectError(null);
    try {
      const res = await fetch("/api/registrations/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, reason }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setRejectError(data.error ?? "Operation failed");
      } else {
        setSelected((prev) => {
          const next = new Set(prev);
          ids.forEach((id) => next.delete(id));
          return next;
        });
      }
    } catch {
      setRejectError("Network error");
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleReject(regId: string, agentName: string) {
    if (
      !confirm(`Reject registration for "${agentName}"? This cannot be undone.`)
    )
      return;
    setRejectingId(regId);
    setRejectError(null);
    try {
      const res = await fetch(`/api/registrations/${regId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by admin" }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setRejectError(data.error ?? "Rejection failed");
      }
    } catch {
      setRejectError("Network error");
    } finally {
      setRejectingId(null);
    }
  }

  async function handleClearDisconnected() {
    if (disconnectedRegs.length === 0) return;
    if (
      !confirm(
        `Remove ${disconnectedRegs.length} disconnected registration${disconnectedRegs.length !== 1 ? "s" : ""}? This cannot be undone.`
      )
    )
      return;
    await batchReject(
      disconnectedRegs.map((r) => r.id),
      "Cleared — agent was not connected"
    );
  }

  async function handleBatchReject() {
    if (selected.size === 0) return;
    if (
      !confirm(
        `Reject ${selected.size} selected registration${selected.size !== 1 ? "s" : ""}? This cannot be undone.`
      )
    )
      return;
    await batchReject([...selected], "Rejected by admin");
  }

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
      {/* Back nav */}
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-1.5 text-foreground-500 hover:text-foreground text-sm transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Pending Registrations
          </h1>
          <p className="text-foreground-500 text-sm mt-0.5">
            Review and approve or reject agents waiting to join.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Clear disconnected */}
          {disconnectedRegs.length > 0 && (
            <button
              onClick={handleClearDisconnected}
              disabled={bulkWorking}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-background-100 border border-neutral-200 hover:bg-background-200 disabled:opacity-50 text-foreground-500 hover:text-foreground text-xs font-medium rounded-lg transition-colors"
            >
              {bulkWorking ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
              Clear disconnected ({disconnectedRegs.length})
            </button>
          )}
          {/* Reject selected */}
          {selected.size > 0 && (
            <button
              onClick={handleBatchReject}
              disabled={bulkWorking}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-danger-100 hover:bg-danger-200 disabled:opacity-50 text-danger-700 text-xs font-medium rounded-lg border border-danger-300 transition-colors"
            >
              {bulkWorking ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <X size={12} />
              )}
              Reject selected ({selected.size})
            </button>
          )}
          <span
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
              wsConnected
                ? "bg-success-100 border-success-300 text-success-700"
                : "bg-background-200 border-neutral-200 text-foreground-400"
            }`}
          >
            {wsConnected ? (
              <Wifi className="w-3 h-3" />
            ) : (
              <WifiOff className="w-3 h-3" />
            )}
            {wsConnected ? "Live" : "Connecting…"}
          </span>
        </div>
      </div>

      {/* Empty state */}
      {pendingRegs.length === 0 && (
        <div className="bg-background-100 border border-neutral-200 rounded-2xl px-6 py-16 text-center">
          <Clock className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-foreground font-medium">
            No pending registrations
          </p>
          <p className="text-foreground-500 text-sm mt-1">
            New agent registration requests will appear here.
          </p>
        </div>
      )}

      {/* Error display */}
      {rejectError && (
        <div className="flex items-center gap-2 bg-danger-50 border border-danger-300 rounded-lg px-4 py-3 text-sm text-danger-600">
          {rejectError}
        </div>
      )}

      {/* Registration list */}
      {pendingRegs.length > 0 && (
        <div className="bg-warning-50 border border-warning-200 rounded-xl overflow-hidden">
          {/* List header with select-all */}
          <div className="px-5 py-4 border-b border-warning-200 flex items-center gap-3">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="w-4 h-4 rounded border-neutral-300 accent-primary-500 cursor-pointer"
              title="Select all"
            />
            <Clock className="w-4 h-4 text-warning-600" />
            <h2 className="text-sm font-semibold text-warning-700 flex-1">
              {pendingRegs.length} agent{pendingRegs.length !== 1 ? "s" : ""}{" "}
              awaiting review
            </h2>
          </div>
          <div className="divide-y divide-warning-200">
            {pendingRegs.map((reg) => (
              <div
                key={reg.id}
                className="px-5 py-4 flex items-center gap-3 hover:bg-warning-100/50 transition-colors group"
              >
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={selected.has(reg.id)}
                  onChange={() => toggleOne(reg.id)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded border-neutral-300 accent-primary-500 cursor-pointer flex-shrink-0"
                />

                {/* Main row — click to approve */}
                <div
                  className="flex-1 cursor-pointer min-w-0"
                  onClick={() => router.push(`/agents/create?regId=${reg.id}`)}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground">
                      {reg.agentName}
                    </p>
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
                      handleReject(reg.id, reg.agentName);
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
      )}
    </div>
  );
}

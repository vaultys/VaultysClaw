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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Pending Registrations
          </h1>
          <p className="text-foreground-500 text-sm mt-0.5">
            Review and approve or reject agents waiting to join.
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
            wsConnected
              ? "bg-success-100 dark:bg-success-900/40 border-success-300 dark:border-success-700/50 text-success-700 dark:text-success-400"
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
        <div className="flex items-center gap-2 bg-danger-50 dark:bg-danger-500/10 border border-danger-300 dark:border-danger-500/20 rounded-lg px-4 py-3 text-sm text-danger-600 dark:text-danger-400">
          {rejectError}
        </div>
      )}

      {/* Registration list */}
      {pendingRegs.length > 0 && (
        <div className="bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-700/40 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-warning-200 dark:border-warning-700/40 flex items-center gap-2">
            <Clock className="w-4 h-4 text-warning-600 dark:text-warning-400" />
            <h2 className="text-sm font-semibold text-warning-700 dark:text-warning-300">
              {pendingRegs.length} agent{pendingRegs.length !== 1 ? "s" : ""}{" "}
              awaiting review
            </h2>
          </div>
          <div className="divide-y divide-warning-200 dark:divide-warning-700/30">
            {pendingRegs.map((reg) => (
              <div
                key={reg.id}
                className="px-5 py-4 flex items-center justify-between hover:bg-warning-100/50 dark:hover:bg-warning-900/10 transition-colors group"
              >
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => router.push(`/agents/create?regId=${reg.id}`)}
                >
                  <p className="font-semibold text-foreground">
                    {reg.agent_name}
                  </p>
                  <p className="text-warning-600/80 dark:text-warning-400/60 text-xs mt-0.5">
                    Requested {timeAgo(reg.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReject(reg.id, reg.agent_name);
                    }}
                    disabled={rejectingId === reg.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-danger-100 dark:bg-danger-600/20 hover:bg-danger-200 dark:hover:bg-danger-600/30 disabled:opacity-50 disabled:cursor-not-allowed text-danger-700 dark:text-danger-400 text-xs font-medium rounded transition-colors"
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

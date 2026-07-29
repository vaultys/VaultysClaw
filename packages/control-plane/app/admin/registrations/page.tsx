"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAdminWS, type PendingRegistration } from "@/hooks/useAdminWS";
import { Clock, Wifi, WifiOff, X, Loader2, Trash2 } from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import {
  adminApi,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import { RegistrationList } from "@/components/registrations/RegistrationList";
import { useConfirm } from "@/components/shared/ConfirmContext";

export default function RegistrationsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const { registrations: pendingRegs, connected: wsConnected } = useAdminWS();
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkWorking, setBulkWorking] = useState(false);

  const disconnectedRegs = pendingRegs.filter((r) => !r.connected);
  const allSelected =
    pendingRegs.length > 0 && pendingRegs.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected(
      allSelected ? new Set() : new Set(pendingRegs.map((r) => r.id))
    );
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
      unwrap(await adminApi.registrations.batchReject({ body: { ids, reason } }));
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setBulkWorking(false);
    }
  }

  async function handleReject(reg: PendingRegistration) {
    if (
      !(await confirm({
        title: "Reject registration",
        message: `Reject registration for "${reg.agentName}"? This cannot be undone.`,
        variant: "danger",
      }))
    )
      return;
    setRejectingId(reg.id);
    setRejectError(null);
    try {
      unwrap(
        await adminApi.registrations.reject({
          params: { id: reg.id },
          body: { reason: "Rejected by admin" },
        })
      );
    } catch (err) {
      setRejectError(err instanceof ApiError ? err.message : "Network error");
    } finally {
      setRejectingId(null);
    }
  }

  async function handleApprove(reg: PendingRegistration) {
    // Proxies have no capabilities to pick — approve directly rather than
    // sending the admin to the agent-creation capability wizard.
    if (reg.kind === "proxy") {
      setRejectError(null);
      try {
        const data = unwrap(
          await adminApi.registrations.approve({
            params: { id: reg.id },
            body: { capabilities: [] },
          })
        );
        if (data.agentDid) {
          router.push(`/admin/proxies/${encodeURIComponent(data.agentDid)}`);
        }
      } catch (err) {
        setRejectError(err instanceof ApiError ? err.message : "Network error");
      }
      return;
    }
    router.push(`/admin/agents/create?regId=${reg.id}`);
  }

  async function handleClearDisconnected() {
    if (bulkWorking || disconnectedRegs.length === 0) return;
    if (
      !(await confirm({
        title: "Clear disconnected",
        message: `Remove ${disconnectedRegs.length} disconnected registration${disconnectedRegs.length !== 1 ? "s" : ""}? This cannot be undone.`,
        variant: "danger",
      }))
    )
      return;
    await batchReject(
      disconnectedRegs.map((r) => r.id),
      "Cleared — agent was not connected"
    );
  }

  async function handleBatchReject() {
    if (bulkWorking || selected.size === 0) return;
    if (
      !(await confirm({
        title: "Reject selected",
        message: `Reject ${selected.size} selected registration${selected.size !== 1 ? "s" : ""}? This cannot be undone.`,
        variant: "danger",
      }))
    )
      return;
    await batchReject([...selected], "Rejected by admin");
  }

  useBreadcrumbs([{ label: "Registrations" }], []);

  useToolbar(
    {
      title: "Pending Registrations",
      description:
        pendingRegs.length > 0
          ? `${pendingRegs.length} awaiting review${disconnectedRegs.length ? ` · ${disconnectedRegs.length} disconnected` : ""}`
          : "Review and approve or reject agents waiting to join",
      actions: [
        ...(disconnectedRegs.length > 0
          ? [
              {
                kind: "button" as const,
                id: "clear-disconnected",
                label: `Clear disconnected (${disconnectedRegs.length})`,
                variant: "default" as const,
                icon: bulkWorking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                ),
                onClick: handleClearDisconnected,
              },
            ]
          : []),
        ...(selected.size > 0
          ? [
              {
                kind: "button" as const,
                id: "reject-selected",
                label: `Reject selected (${selected.size})`,
                variant: "danger" as const,
                icon: bulkWorking ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                ),
                onClick: handleBatchReject,
              },
            ]
          : []),
        {
          kind: "badge" as const,
          id: "ws",
          label: wsConnected ? "Live" : "Connecting…",
          tone: wsConnected ? ("success" as const) : ("neutral" as const),
          icon: wsConnected ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          ),
        },
      ],
    },
    [wsConnected, pendingRegs, selected, bulkWorking]
  );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
      {/* Empty state */}
      {pendingRegs.length === 0 && (
        <div className="bg-background-100 border border-neutral-200 rounded-2xl px-6 py-16 text-center">
          <Clock className="w-10 h-10 text-neutral-300 mx-auto mb-3" />
          <p className="text-foreground font-medium">No pending registrations</p>
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
        <RegistrationList
          registrations={pendingRegs}
          selected={selected}
          allSelected={allSelected}
          rejectingId={rejectingId}
          bulkWorking={bulkWorking}
          onToggleAll={toggleAll}
          onToggleOne={toggleOne}
          onApprove={handleApprove}
          onReject={(reg) => handleReject(reg)}
        />
      )}
    </div>
  );
}

"use client";

import {
  Bot,
  Check,
  Loader2,
  CheckCircle2,
  Zap,
  AlertTriangle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ALL_CAPABILITIES,
  CAPABILITY_ICONS,
  type PendingReg,
} from "./constants";
import { Workspace } from "@prisma/client";

interface ApproveStepProps {
  pendingReg: PendingReg;
  workspaces: Workspace[];
  selectedCaps: Set<string>;
  setSelectedCaps: (updater: (prev: Set<string>) => Set<string>) => void;
  selectedWorkspaces: Set<string>;
  setSelectedWorkspaces: (updater: (prev: Set<string>) => Set<string>) => void;
  policyMaxTokensPerDay: string;
  setPolicyMaxTokensPerDay: (v: string) => void;
  policyMaxRequestsPerHour: string;
  setPolicyMaxRequestsPerHour: (v: string) => void;
  policyAllowedDomains: string;
  setPolicyAllowedDomains: (v: string) => void;
  policyExpiresAt: string;
  setPolicyExpiresAt: (v: string) => void;
  approveError: string | null;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
  onBack: () => void;
}

export function ApproveStep({
  pendingReg,
  workspaces,
  selectedCaps,
  setSelectedCaps,
  selectedWorkspaces,
  setSelectedWorkspaces,
  policyMaxTokensPerDay,
  setPolicyMaxTokensPerDay,
  policyMaxRequestsPerHour,
  setPolicyMaxRequestsPerHour,
  policyAllowedDomains,
  setPolicyAllowedDomains,
  policyExpiresAt,
  setPolicyExpiresAt,
  approveError,
  approving,
  rejecting,
  onApprove,
  onReject,
  onBack,
}: ApproveStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-1">
          Approve agent
        </h2>
        <p className="text-sm text-foreground-500">
          Assign capabilities and enroll in a workspace. The agent will receive
          these permissions immediately upon approval.
        </p>
      </div>

      {/* Agent identity card */}
      <div className="bg-background-100 border border-neutral-200 rounded-xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary-100 border border-primary-300 flex items-center justify-center shrink-0">
          <Bot size={18} className="text-primary-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {pendingReg.agentName}
          </p>
          <p className="text-xs text-foreground-500">
            Registration ID:{" "}
            <code className="font-mono">{pendingReg.id.slice(0, 12)}…</code>
          </p>
        </div>
      </div>

      {/* Capabilities */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
          Capabilities
        </p>
        <div className="flex flex-wrap gap-2">
          {ALL_CAPABILITIES.map((cap) => {
            const checked = selectedCaps.has(cap.id);
            return (
              <button
                key={cap.id}
                type="button"
                onClick={() =>
                  setSelectedCaps((prev) => {
                    const next = new Set(prev);
                    if (next.has(cap.id)) next.delete(cap.id);
                    else next.add(cap.id);
                    return next;
                  })
                }
                className={`px-3 py-1.5 rounded-md text-sm border transition-colors flex items-center gap-1.5 ${
                  checked
                    ? "bg-primary-100 border-primary-500 text-primary-700"
                    : "bg-background-100 border-neutral-300 text-foreground-500 hover:border-foreground-500"
                }`}
              >
                {CAPABILITY_ICONS[cap.id] ?? <Zap size={13} />}
                {cap.label}
              </button>
            );
          })}
        </div>
        {selectedCaps.size === 0 && (
          <p className="text-xs text-warning-600 flex items-center gap-1.5">
            <AlertTriangle size={12} /> At least one capability is required
          </p>
        )}
      </div>

      {/* Resource Limits */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
          Resource Limits{" "}
          <span className="normal-case text-foreground-400">(optional)</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-xs text-foreground-500">
              Max tokens / day
            </span>
            <input
              type="number"
              min={0}
              placeholder="e.g. 50000"
              value={policyMaxTokensPerDay}
              onChange={(e) => setPolicyMaxTokensPerDay(e.target.value)}
              className="w-full bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:border-primary-500"
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs text-foreground-500">
              Max requests / hour
            </span>
            <input
              type="number"
              min={0}
              placeholder="e.g. 60"
              value={policyMaxRequestsPerHour}
              onChange={(e) => setPolicyMaxRequestsPerHour(e.target.value)}
              className="w-full bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:border-primary-500"
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs text-foreground-500">
              Allowed domains{" "}
              <span className="text-foreground-400">(comma-separated)</span>
            </span>
            <input
              type="text"
              placeholder="e.g. api.openai.com, example.com"
              value={policyAllowedDomains}
              onChange={(e) => setPolicyAllowedDomains(e.target.value)}
              className="w-full bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:border-primary-500"
            />
          </label>
        </div>
      </div>

      {/* Policy Expiry */}
      <label className="block space-y-1">
        <span className="text-xs font-medium text-foreground-500 uppercase">
          Policy Expiry{" "}
          <span className="normal-case text-foreground-400">(optional)</span>
        </span>
        <input
          type="datetime-local"
          value={policyExpiresAt}
          onChange={(e) => setPolicyExpiresAt(e.target.value)}
          className="w-full bg-background-100 border border-neutral-300 rounded-md px-3 py-1.5 text-sm text-foreground focus:outline-none focus:border-primary-500"
        />
      </label>

      {/* Workspace assignment */}
      {workspaces.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-foreground-500 uppercase tracking-wide">
            Workspaces
          </p>
          <div className="space-y-1.5">
            {workspaces.map((r) => {
              const checked = selectedWorkspaces.has(r.id);
              return (
                <button
                  key={r.id}
                  onClick={() =>
                    setSelectedWorkspaces((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.id)) next.delete(r.id);
                      else next.add(r.id);
                      return next;
                    })
                  }
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-colors",
                    checked
                      ? "bg-background-100 border-primary-300"
                      : "bg-background-100 border-neutral-200 hover:bg-background-200"
                  )}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ background: r.color }}
                  />
                  <span
                    className={
                      checked ? "text-foreground" : "text-foreground-500"
                    }
                  >
                    {r.name}
                    {r.isDefault ? (
                      <span className="ml-1.5 text-xs text-foreground-400">
                        (default)
                      </span>
                    ) : null}
                  </span>
                  {checked && (
                    <Check size={12} className="ml-auto text-primary-500" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {approveError && (
        <div className="flex items-center gap-2 bg-danger-50 border border-danger-300 rounded-lg px-4 py-3 text-sm text-danger-600">
          <AlertTriangle size={14} />
          {approveError}
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-sm text-foreground-500 hover:text-foreground transition-colors"
        >
          ← Back
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={onReject}
            disabled={approving || rejecting}
            className="flex items-center gap-2 px-5 py-2.5 bg-danger-100 hover:bg-danger-200 disabled:opacity-50 disabled:cursor-not-allowed text-danger-700 text-sm font-medium rounded-lg transition-colors"
          >
            {rejecting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <X size={15} />
            )}
            {rejecting ? "Rejecting…" : "Reject"}
          </button>
          <button
            onClick={onApprove}
            disabled={approving || rejecting || selectedCaps.size === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {approving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <CheckCircle2 size={15} />
            )}
            {approving ? "Approving…" : "Approve agent"}
          </button>
        </div>
      </div>
    </div>
  );
}

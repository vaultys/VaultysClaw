"use client";

import { RotateCcw, X } from "lucide-react";
import { daysFromNow, parseUTC } from "@vaultysclaw/shared";
import type { AgentInfo, PolicyEntry } from "@/lib/contracts";

export function RenewPolicyModal({
  policy,
  agents,
  expiry,
  setExpiry,
  saving,
  onConfirm,
  onClose,
}: {
  policy: PolicyEntry;
  agents: AgentInfo[];
  expiry: string;
  setExpiry: (value: string) => void;
  saving: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const agentName =
    agents.find((a) => a.did === policy.agentDid)?.name ??
    policy.agentDid?.slice(0, 30) ??
    "Global";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <RotateCcw className="w-4 h-4 text-primary-500" /> Renew expired
            policy
          </span>
          <button
            onClick={onClose}
            className="text-foreground-400 hover:text-foreground p-1 rounded-lg hover:bg-background-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="bg-background-200 border border-neutral-200 rounded-xl p-3 space-y-1">
            <p className="text-xs font-medium text-foreground">{agentName}</p>
            <p className="text-xs text-foreground-500">
              {policy.capabilities.join(", ")}
            </p>
            {policy.expiresAt && (
              <p className="text-xs text-danger-500">
                Expired {parseUTC(policy.expiresAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-foreground-500 font-medium">
              New expiry date
            </label>
            <input
              type="datetime-local"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
              className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <div className="flex gap-1.5 mt-1">
              {([7, 30, 90, 365] as const).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setExpiry(daysFromNow(days))}
                  className="text-[11px] px-2 py-0.5 rounded-md border border-neutral-200 text-foreground-500 hover:text-primary-600 hover:border-primary-400 transition-colors"
                >
                  +{days}d
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-foreground-500 hover:text-foreground border border-neutral-200 rounded-lg hover:bg-background-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={saving || !expiry}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? (
              <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5" />
            )}
            Renew &amp; revoke old
          </button>
        </div>
      </div>
    </div>
  );
}

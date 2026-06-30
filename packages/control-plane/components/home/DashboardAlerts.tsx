"use client";

import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Clock,
  RotateCcw,
  Shield,
  ShieldAlert,
  WifiOff,
  X,
} from "lucide-react";
import type { AgentInfo, PolicyEntry } from "@/lib/contracts";
import type { SetupBanner } from "@/hooks/useDashboardData";

export function DashboardAlerts({
  wsConnected,
  isGlobalAdmin,
  pendingRegCount,
  expiredPolicies,
  agents,
  onRenew,
  setupBanner,
  onDismissSetup,
}: {
  wsConnected: boolean;
  isGlobalAdmin: boolean;
  pendingRegCount: number;
  expiredPolicies: PolicyEntry[];
  agents: AgentInfo[];
  onRenew: (p: PolicyEntry) => void;
  setupBanner: SetupBanner | null;
  onDismissSetup: () => void;
}) {
  const router = useRouter();

  const show =
    !wsConnected ||
    (isGlobalAdmin && pendingRegCount > 0) ||
    (isGlobalAdmin && expiredPolicies.length > 0) ||
    !!setupBanner;

  if (!show) return null;

  return (
    <div className="space-y-2">
      {!wsConnected && (
        <div className="flex items-center gap-2 bg-warning-50 border border-warning-300 rounded-lg px-4 py-2.5 text-warning-700 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          WebSocket connection is being restored. Some data may be stale.
        </div>
      )}

      {isGlobalAdmin && pendingRegCount > 0 && (
        <button
          onClick={() => router.push("/registrations")}
          className="w-full flex items-center justify-between gap-3 bg-warning-50 border border-warning-300 rounded-lg px-4 py-2.5 text-warning-700 text-sm hover:bg-warning-100/50 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 shrink-0" />
            <strong>{pendingRegCount}</strong> agent registration
            {pendingRegCount !== 1 ? "s" : ""} pending approval
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {isGlobalAdmin && expiredPolicies.length > 0 && (
        <div className="bg-danger-50 border border-danger-300 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-danger-200">
            <span className="flex items-center gap-2 text-danger-700 text-sm font-medium">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              {expiredPolicies.length} expired polic
              {expiredPolicies.length === 1 ? "y" : "ies"} — agents are locked
            </span>
            <button
              onClick={() => router.push("/governance")}
              className="text-xs text-danger-600 hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-danger-200/60">
            {expiredPolicies.slice(0, 3).map((p) => {
              const agentName = agents.find((a) => a.did === p.agentDid)?.name;
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 py-2"
                >
                  <p className="text-xs text-danger-800 truncate">
                    {agentName ??
                      (p.agentDid ? `${p.agentDid.slice(0, 24)}…` : "Global")}
                    <span className="text-danger-500 ml-1.5">
                      · {p.capabilities.length} cap
                      {p.capabilities.length !== 1 ? "s" : ""}
                    </span>
                  </p>
                  <button
                    onClick={() => onRenew(p)}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-danger-700 hover:text-primary-600 border border-danger-300 hover:border-primary-400 px-2 py-0.5 rounded transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Renew
                  </button>
                </div>
              );
            })}
            {expiredPolicies.length > 3 && (
              <p className="px-4 py-1.5 text-xs text-danger-600/70">
                +{expiredPolicies.length - 3} more —{" "}
                <button
                  onClick={() => router.push("/governance")}
                  className="underline hover:no-underline"
                >
                  view in Governance
                </button>
              </p>
            )}
          </div>
        </div>
      )}

      {setupBanner && (
        <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-primary-50 to-secondary-50 border border-primary-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0 shadow shadow-primary-600/30">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary-700">
                {setupBanner.completedCount > 0
                  ? `Setup in progress — ${setupBanner.completedCount} of 4 steps done`
                  : "Finish setting up VaultysClaw"}
              </p>
              <p className="text-xs text-primary-600/60 truncate">
                Configure LLM models, email, users, and your first agent.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => router.push("/setup")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {setupBanner.completedCount > 0 ? "Continue" : "Start setup"}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onDismissSetup}
              className="p-1.5 text-primary-400 hover:text-primary-700 rounded-lg hover:bg-primary-100 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { ArrowRight, Loader2, Waypoints, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@vaultysclaw/shared";
import type { PendingReg } from "./constants";

interface WaitingStepProps {
  wsConnected: boolean;
  /** Proxy name entered in the launch step — only this proxy is awaited. */
  expectedName: string;
  pendingReg: PendingReg | null;
  waitingRegs: PendingReg[];
  approving: boolean;
  approveError: string | null;
  onSelectReg: (reg: PendingReg) => void;
  onApprove: () => void;
  onBack: () => void;
}

export function WaitingStep({
  wsConnected,
  expectedName,
  pendingReg,
  waitingRegs,
  approving,
  approveError,
  onSelectReg,
  onApprove,
  onBack,
}: WaitingStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Waiting for proxy connection
          </h2>
          <p className="text-sm text-foreground-500">
            Listening for a registration from{" "}
            {expectedName ? (
              <span className="font-medium text-foreground">{expectedName}</span>
            ) : (
              "your proxy"
            )}{" "}
            in real time.
          </p>
        </div>
        <span
          className={cn(
            "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border",
            wsConnected
              ? "bg-success-100 border-success-300 text-success-700"
              : "bg-background-200 border-neutral-200 text-foreground-400"
          )}
        >
          {wsConnected ? <Wifi size={11} /> : <WifiOff size={11} />}
          {wsConnected ? "Live" : "Connecting…"}
        </span>
      </div>

      {pendingReg ? (
        <div className="bg-success-50 border-2 border-success-400 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-success-100 border border-success-300 flex items-center justify-center">
              <Waypoints size={18} className="text-success-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Proxy connected!</p>
              <p className="text-xs text-foreground-500">
                <span className="font-medium text-success-700">
                  {pendingReg.agentName}
                </span>{" "}
                is waiting for approval
              </p>
            </div>
          </div>
          {approveError && (
            <div className="bg-danger-50 border border-danger-300 rounded-lg px-3 py-2 text-xs text-danger-600">
              {approveError}
            </div>
          )}
          <button
            onClick={onApprove}
            disabled={approving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-success-600 hover:bg-success-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {approving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ArrowRight size={15} />
            )}
            {approving ? "Approving…" : "Approve this proxy"}
          </button>
        </div>
      ) : (
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-8 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-primary-300 flex items-center justify-center">
              <Waypoints size={28} className="text-primary-400" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-primary-500" />
            </span>
          </div>
          <p className="text-sm text-foreground-500 text-center">
            Waiting for{" "}
            {expectedName ? (
              <span className="font-medium text-foreground">{expectedName}</span>
            ) : (
              "a proxy"
            )}{" "}
            to call home…
            <br />
            <span className="text-xs text-foreground-400">
              Make sure it's running with{" "}
              <code className="font-mono">VC_PROXY_NAME="{expectedName || "<name>"}"</code>{" "}
              and points to the correct control plane URL.
            </span>
          </p>
        </div>
      )}

      {waitingRegs.length > 1 && (
        <div className="space-y-2">
          <p className="text-xs text-foreground-500 uppercase tracking-wide font-medium">
            All pending registrations
          </p>
          {waitingRegs.map((r) => (
            <button
              key={r.id}
              onClick={() => onSelectReg(r)}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-lg border text-sm transition-colors text-left",
                pendingReg?.id === r.id
                  ? "bg-primary-50 border-primary-300 text-foreground"
                  : "bg-background-100 border-neutral-200 hover:bg-background-200 text-foreground"
              )}
            >
              <span className="flex items-center gap-2">
                <Waypoints size={14} className="text-foreground-500" />
                {r.agentName}
              </span>
              <span className="text-xs text-foreground-500">{timeAgo(r.createdAt)}</span>
            </button>
          ))}
        </div>
      )}

      <button
        onClick={onBack}
        className="text-sm text-foreground-500 hover:text-foreground transition-colors"
      >
        ← Back to instructions
      </button>
    </div>
  );
}

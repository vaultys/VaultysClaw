"use client";

import { Bot, ArrowRight, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@vaultysclaw/shared";
import type { PendingReg } from "./constants";

interface WaitingStepProps {
  wsConnected: boolean;
  pendingReg: PendingReg | null;
  waitingRegs: PendingReg[];
  onSelectReg: (reg: PendingReg) => void;
  onApprove: () => void;
  onBack: () => void;
}

export function WaitingStep({
  wsConnected,
  pendingReg,
  waitingRegs,
  onSelectReg,
  onApprove,
  onBack,
}: WaitingStepProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground mb-1">
            Waiting for agent connection
          </h2>
          <p className="text-sm text-foreground-500">
            Listening for incoming registration requests in real time.
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
              <Bot size={18} className="text-success-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Agent connected!
              </p>
              <p className="text-xs text-foreground-500">
                <span className="font-medium text-success-700">
                  {pendingReg.agentName}
                </span>{" "}
                is waiting for approval
              </p>
            </div>
          </div>
          <button
            onClick={onApprove}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-success-600 hover:bg-success-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Approve this agent <ArrowRight size={15} />
          </button>
        </div>
      ) : (
        <div className="bg-background-100 border border-neutral-200 rounded-xl p-8 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-2 border-primary-300 flex items-center justify-center">
              <Bot size={28} className="text-primary-400" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-4 w-4">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-4 w-4 bg-primary-500" />
            </span>
          </div>
          <p className="text-sm text-foreground-500 text-center">
            Waiting for an agent to call home…
            <br />
            <span className="text-xs text-foreground-400">
              Make sure the CLI is running and points to the correct WebSocket
              URL.
            </span>
          </p>
        </div>
      )}

      {/* Show all pending registrations if more than one */}
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
                <Bot size={14} className="text-foreground-500" />
                {r.agentName}
              </span>
              <span className="text-xs text-foreground-500">
                {timeAgo(r.createdAt)}
              </span>
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

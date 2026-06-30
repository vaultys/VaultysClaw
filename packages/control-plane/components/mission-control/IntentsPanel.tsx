"use client";

import { CheckCircle, Loader2, XCircle } from "lucide-react";
import { timeAgo } from "@vaultysclaw/shared";
import type { AgentInfo } from "@/lib/contracts";
import { agentLabel, type Intent } from "./types";
import { PanelHeader } from "./ui";

export function IntentsPanel({
  intents,
  agents,
  onSelectIntent,
}: {
  intents: Intent[];
  agents: AgentInfo[];
  onSelectIntent: (id: string) => void;
}) {
  const total = intents.length;
  const failed = intents.filter((i) => i.status === "failed").length;
  const failRate = total > 0 ? Math.round((failed / total) * 100) : 0;
  const nameFor = (did: string) => agents.find((a) => a.did === did)?.name;

  return (
    <div className="flex flex-col overflow-hidden bg-background-100 border border-neutral-200/60 rounded-xl shadow-md shadow-black/10 min-h-0">
      <PanelHeader
        title="Intents"
        right={
          total > 0 ? (
            <span
              className={`text-[10px] font-semibold tabular-nums ${
                failRate > 20
                  ? "text-danger-600"
                  : failRate > 5
                    ? "text-warning-600"
                    : "text-success-600"
              }`}
            >
              {failRate}% fail
            </span>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto">
        {intents.length === 0 ? (
          <p className="px-3 py-4 text-center text-[10px] text-foreground-600">
            No recent intents
          </p>
        ) : (
          intents.map((intent) => (
            <button
              key={intent.intentId}
              type="button"
              className="w-full text-left px-4 py-2 flex items-start gap-2 border-b border-neutral-200/40 cursor-pointer hover:bg-background-200/30 transition-colors"
              onClick={() => onSelectIntent(intent.intentId)}
            >
              <div className="mt-0.5 shrink-0">
                {intent.status === "success" ? (
                  <CheckCircle size={9} className="text-success-600" />
                ) : intent.status === "failed" ? (
                  <XCircle size={9} className="text-danger-600" />
                ) : (
                  <Loader2 size={9} className="text-warning-600 animate-spin" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-foreground truncate">
                  {intent.action}
                </p>
                <p className="text-[9px] text-foreground-600 truncate">
                  {agentLabel(intent.agentDid, nameFor)} ·{" "}
                  {timeAgo(intent.sentAt)}
                </p>
                {intent.error && (
                  <p className="text-[9px] text-danger-600 truncate">
                    {intent.error.slice(0, 50)}
                  </p>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

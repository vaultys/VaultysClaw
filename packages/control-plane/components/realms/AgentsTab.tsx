"use client";

import Link from "next/link";
import { Bot, ChevronRight, Plus, X } from "lucide-react";
import { shortDid } from "@vaultysclaw/shared";
import type { RealmAgentMember } from "./types";
import { EmptyState, ListCard, ListRow } from "./ui";

export function AgentsTab({
  agents,
  canRemove,
  onAdd,
  onRemove,
}: {
  agents: RealmAgentMember[];
  canRemove: boolean;
  onAdd: () => void;
  onRemove: (did: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Agent
        </button>
      </div>
      {agents.length === 0 ? (
        <EmptyState icon={Bot} message="No agents in this realm." />
      ) : (
        <ListCard>
          {agents.map((a, i) => (
            <ListRow key={a.agentDid} index={i}>
              <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground truncate">
                    {a.agent.name}
                  </span>
                  {a.isPrimary && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-warning-50 text-warning-700">
                      primary
                    </span>
                  )}
                </div>
                <code className="text-xs text-foreground-400 font-mono">
                  {shortDid(a.agentDid)}
                </code>
              </div>
              <Link
                href={`/agents/${a.agentDid}`}
                className="p-1.5 rounded-lg text-foreground-500 hover:text-primary-400 transition-colors"
                title="View agent"
                onClick={(e) => e.stopPropagation()}
              >
                <ChevronRight className="w-4 h-4" />
              </Link>
              {canRemove && (
                <button
                  onClick={() => onRemove(a.agentDid)}
                  className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-400 hover:bg-danger-400/10 transition-colors"
                  title="Remove from realm"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </ListRow>
          ))}
        </ListCard>
      )}
    </div>
  );
}

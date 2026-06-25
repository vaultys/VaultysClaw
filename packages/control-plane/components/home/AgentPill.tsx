"use client";

import { ChevronRight } from "lucide-react";
import type { AgentInfo } from "@/lib/contracts";

export function AgentPill({
  agent,
  onClick,
}: {
  agent: AgentInfo;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg hover:border-primary-300 hover:bg-background-200 transition-all duration-200 w-full text-left group"
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${agent.online ? "bg-success-500" : "bg-neutral-300"}`}
      />
      <span className="text-sm text-foreground font-medium truncate flex-1">
        {agent.name}
      </span>
      {agent.online && (
        <span className="text-[10px] text-success-600 font-medium shrink-0">
          online
        </span>
      )}
      <ChevronRight className="w-3 h-3 text-foreground-300 group-hover:text-primary-500 shrink-0 transition-colors" />
    </button>
  );
}

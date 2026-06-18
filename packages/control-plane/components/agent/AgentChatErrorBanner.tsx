"use client";

import { WifiOff } from "lucide-react";

export function AgentChatErrorBanner({
  message,
  code,
}: {
  message: string;
  code: string | null;
}) {
  if (code === "llm_unavailable") {
    return (
      <div className="flex items-start gap-2 bg-warning-50 border border-warning-300 text-warning-700 rounded-lg px-3 py-2.5 text-xs">
        <WifiOff size={13} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">LLM provider unreachable</p>
          <p className="text-warning-600/80 mt-0.5 break-words">{message}</p>
          <p className="text-warning-600/60 mt-1">
            Update the LLM config in the <strong>Settings</strong> tab.
          </p>
        </div>
      </div>
    );
  }
  if (code === "agent_offline") {
    return (
      <div className="flex items-center gap-2 bg-danger-50 border border-danger-200 text-danger-700 rounded-lg px-3 py-2 text-xs">
        <WifiOff size={13} className="shrink-0" />
        <span>Agent disconnected — waiting to reconnect</span>
      </div>
    );
  }
  return (
    <div className="text-center text-xs text-danger-700 bg-danger-50 border border-danger-200 rounded-lg px-4 py-2">
      {message}
    </div>
  );
}

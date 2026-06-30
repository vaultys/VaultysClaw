"use client";

import { Wifi, WifiOff } from "lucide-react";
import { greeting } from "@vaultysclaw/shared";

export function DashboardHeader({
  name,
  wsConnected,
  onlineCount,
  total,
  queueCount,
}: {
  name: string | null | undefined;
  wsConnected: boolean;
  onlineCount: number;
  total: number;
  queueCount: number;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{greeting(name)}</h1>
        <p className="text-foreground-400 text-sm mt-1">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
          {total > 0 && (
            <span className="ml-2 text-foreground-500">
              · {onlineCount}/{total} agent{total !== 1 ? "s" : ""} online
            </span>
          )}
          {queueCount > 0 && (
            <span className="ml-2 text-warning-600 font-medium">
              · {queueCount} item{queueCount !== 1 ? "s" : ""} need
              {queueCount === 1 ? "s" : ""} your attention
            </span>
          )}
        </p>
      </div>
      <span
        className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border shrink-0 ${
          wsConnected
            ? "bg-success-100 border-success-300 text-success-700"
            : "bg-warning-100 border-warning-300 text-warning-700"
        }`}
      >
        {wsConnected ? (
          <Wifi className="w-3 h-3" />
        ) : (
          <WifiOff className="w-3 h-3" />
        )}
        {wsConnected ? "Live" : "Connecting…"}
      </span>
    </div>
  );
}

"use client";

import { greeting } from "@vaultysclaw/shared";

export function DashboardHeader({
  name,
  onlineCount,
  total,
  queueCount,
}: {
  name: string | null | undefined;
  onlineCount: number;
  total: number;
  queueCount: number;
}) {
  return (
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
  );
}

"use client";

import { Users } from "lucide-react";
import type { UserRealmSummary } from "@/lib/contracts";

export function UnclaimedRealmsTab({
  realms,
}: {
  realms: UserRealmSummary[];
}) {
  if (realms.length === 0) {
    return (
      <div className="flex flex-col items-center py-12 text-center text-foreground-500 gap-2">
        <Users size={36} strokeWidth={1} />
        <p className="text-sm">
          This user has not been assigned to any realms.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-foreground-500 uppercase tracking-wider">
        Realm memberships
      </h2>
      <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-xl overflow-hidden">
        {realms.map((r) => (
          <div
            key={r.id}
            className="flex items-center gap-3 px-4 py-3 bg-background-200"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: r.color }}
            />
            <span className="flex-1 text-sm text-foreground">{r.name}</span>
            <span className="text-xs text-foreground-400 font-mono">
              {r.slug}
            </span>
            {r.isPrimary && (
              <span className="px-1.5 py-0.5 bg-primary-100 text-primary-600 rounded text-xs">
                Primary
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

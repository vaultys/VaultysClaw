"use client";

import dynamic from "next/dynamic";
import { formatDateTime } from "@vaultysclaw/shared";
import type { GraphNode } from "@vaultysclaw/shared";
import type { UserDetail } from "@/lib/contracts";

const RealmGraph = dynamic(() => import("@/components/graph/RealmGraph"), {
  ssr: false,
});

export function UserDetailsTab({
  user,
  onNodeClick,
}: {
  user: UserDetail;
  onNodeClick: (node: GraphNode) => void;
}) {
  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">
          Relationships
        </h2>
        <div className="rounded-lg overflow-hidden border border-neutral-200">
          <RealmGraph
            query={`?user=${encodeURIComponent(user.did ?? "")}`}
            height={380}
            onNodeClick={onNodeClick}
            currentUserId={user.did ?? undefined}
            defaultView="org-chart"
          />
        </div>
      </section>

      <section>
        <h2 className="text-base font-semibold text-foreground mb-3">
          Identity
        </h2>
        <div className="bg-background-200 rounded-lg border border-neutral-200 divide-y divide-neutral-200">
          {[
            {
              label: "DID",
              value: (
                <span className="font-mono text-xs break-all text-foreground-700">
                  {user.did}
                </span>
              ),
            },
            {
              label: "Registered",
              value: (
                <span className="text-foreground">
                  {formatDateTime(user.registeredAt)}
                </span>
              ),
            },
          ].map(({ label, value }) => (
            <div key={label} className="flex items-start gap-4 px-4 py-3">
              <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">
                {label}
              </div>
              <div className="flex-1 text-sm">{value}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

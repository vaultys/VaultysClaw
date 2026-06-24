import { Globe2 } from "lucide-react";
import { formatDate } from "@vaultysclaw/shared";
import type { MeRealmMembership } from "@/lib/contracts";
import { SectionHeader } from "./primitives";

export function RealmsTab({ realms }: { realms: MeRealmMembership[] }) {
  return (
    <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
      <SectionHeader icon={Globe2} title="Realm Memberships" />
      {realms.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-foreground-400">
          Not a member of any realm yet.
        </div>
      ) : (
        <div className="divide-y divide-neutral-200/60">
          {realms.map((r) => (
            <div
              key={r.realmId}
              className="px-5 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {r.realmColor && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: r.realmColor }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {r.realmName}
                  </p>
                  <p className="text-xs text-foreground-400">
                    /{r.realmSlug} · joined {formatDate(r.joinedAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {r.isPrimary && (
                  <span className="px-2 py-0.5 bg-primary-100 text-primary-700 border border-primary-300 rounded-full text-[10px] font-medium">
                    Primary
                  </span>
                )}
                {r.isRealmAdmin && (
                  <span className="px-2 py-0.5 bg-warning-100 text-warning-700 border border-warning-300 rounded-full text-[10px] font-medium">
                    Admin
                  </span>
                )}
                {r.isDefault && (
                  <span className="px-2 py-0.5 bg-background-200 text-foreground-500 border border-neutral-300 rounded-full text-[10px] font-medium">
                    Default
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

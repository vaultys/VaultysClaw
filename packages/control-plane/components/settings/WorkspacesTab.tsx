import { Globe2 } from "lucide-react";
import { formatDate } from "@vaultysclaw/shared";
import type { UserWorkspaceWithWorkspace } from "@/lib/contracts";
import { normalizeWorkspaceRole } from "@/lib/roles";
import { SectionHeader } from "./primitives";

export function WorkspacesTab({ workspaces }: { workspaces: UserWorkspaceWithWorkspace[] }) {
  return (
    <section className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
      <SectionHeader icon={Globe2} title="Workspace Memberships" />
      {workspaces.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-foreground-400">
          Not a member of any workspace yet.
        </div>
      ) : (
        <div className="divide-y divide-neutral-200/60">
          {workspaces.map((r) => (
            <div
              key={r.workspaceId}
              className="px-5 py-3 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {r.workspace.color && (
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: r.workspace.color }}
                  />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {r.workspace.name}
                  </p>
                  <p className="text-xs text-foreground-400">
                    /{r.workspace.slug} · joined {formatDate(r.joinedAt.toString())}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {r.isPrimary && (
                  <span className="px-2 py-0.5 bg-primary-100 text-primary-700 border border-primary-300 rounded-full text-[10px] font-medium">
                    Primary
                  </span>
                )}
                {normalizeWorkspaceRole(r.role) !== "Member" && (
                  <span className="px-2 py-0.5 bg-warning-100 text-warning-700 border border-warning-300 rounded-full text-[10px] font-medium">
                    {normalizeWorkspaceRole(r.role)}
                  </span>
                )}
                {r.workspace.isDefault && (
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

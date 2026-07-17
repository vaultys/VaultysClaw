"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Bot,
  ChevronRight,
  GitBranch,
  Inbox,
  Layers,
  Wifi,
  WifiOff,
} from "lucide-react";
import { greeting, timeAgo } from "@vaultysclaw/shared";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { useDashboardData } from "@/hooks/useDashboardData";
import { AgentPill } from "./AgentPill";
import { MyQueuePanel } from "./MyQueuePanel";
import { NoWorkspaceScreen } from "./NoWorkspaceScreen";
import { QuickAction } from "./QuickAction";
import { RunStatusBadge } from "./RunStatusBadge";

/**
 * Dashboard for regular (non-admin) users. Scoped strictly to what a member can
 * reach — My Agents, My Workflows, Inbox — plus notifications. No admin links,
 * governance, or fleet-wide chrome (see {@link Dashboard} for the admin view).
 */
export function UserDashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const d = useDashboardData(false);

  const inboxBadge = d.pendingApprovals.length + d.notifications.length;

  useBreadcrumbs([{ label: "Dashboard" }], []);

  useToolbar(
    {
      title: "Dashboard",
      description: "Your agents, workflows and inbox at a glance",
      actions: [
        {
          kind: "badge",
          id: "live",
          label: d.wsConnected ? "Live" : "Connecting…",
          tone: d.wsConnected ? "success" : "warning",
          icon: d.wsConnected ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          ),
        },
      ],
    },
    [d.wsConnected]
  );

  // Not yet assigned to any workspace → contact-an-admin screen.
  if (d.userWorkspaceCount === 0) {
    return <NoWorkspaceScreen />;
  }

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {greeting(session?.user?.name)}
        </h1>
        <p className="text-foreground-400 text-sm mt-1">
          {new Date().toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
          {d.total > 0 && (
            <span className="ml-2 text-foreground-500">
              · {d.onlineCount}/{d.total} agent{d.total !== 1 ? "s" : ""} online
            </span>
          )}
          {inboxBadge > 0 && (
            <span className="ml-2 text-warning-600 font-medium">
              · {inboxBadge} item{inboxBadge !== 1 ? "s" : ""} in your inbox
            </span>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Quick actions + agent pulse ─────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5">
            Quick Actions
          </h2>
          <div className="space-y-2">
            <QuickAction
              icon={Bot}
              label="My Agents"
              description="Chat with the agents you can access"
              onClick={() => router.push("/app/my-agents")}
              accent="primary"
            />
            <QuickAction
              icon={GitBranch}
              label="My Workflows"
              description="Browse and run your automations"
              onClick={() => router.push("/app/workflows")}
              accent="secondary"
            />
            <QuickAction
              icon={Inbox}
              label="Inbox"
              description="Approvals and notifications"
              onClick={() => router.push("/app/inbox")}
              accent="warning"
              badge={inboxBadge}
            />
          </div>

          {d.agents.length > 0 && (
            <>
              <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5 pt-2">
                My Agents
              </h2>
              <div className="space-y-1.5">
                {d.agents.slice(0, 6).map((agent, i) => (
                  <AgentPill
                    key={agent.did || i}
                    agent={agent}
                    onClick={() =>
                      router.push(
                        `/app/my-agents/${encodeURIComponent(agent.did)}`
                      )
                    }
                  />
                ))}
                {d.agents.length > 6 && (
                  <button
                    onClick={() => router.push("/app/my-agents")}
                    className="w-full text-xs text-primary-600 hover:underline py-1 text-center"
                  >
                    +{d.agents.length - 6} more agents
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Inbox: approvals + notifications ─────────────────────────── */}
        <MyQueuePanel
          pendingApprovals={d.pendingApprovals}
          notifications={d.notifications}
          comment={d.comment}
          setComment={d.setComment}
          acting={d.acting}
          onAct={d.actOnApproval}
        />

        {/* ── Recent workflow runs ─────────────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5">
            Recent Runs
          </h2>

          <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-foreground-400" />
                <span className="text-sm font-semibold text-foreground">
                  Workflow Runs
                </span>
              </div>
              <button
                onClick={() => router.push("/app/workflows")}
                className="text-xs text-primary-600 hover:underline"
              >
                View all
              </button>
            </div>

            {d.recentRuns.length === 0 ? (
              <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
                <Layers className="w-6 h-6 text-foreground-200" />
                <p className="text-xs text-foreground-400">
                  No workflow runs yet
                </p>
                <button
                  onClick={() => router.push("/app/workflows")}
                  className="text-xs text-primary-600 hover:underline mt-1"
                >
                  Run your first workflow →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {d.recentRuns.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => router.push("/app/workflows")}
                    className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-background-200 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium truncate leading-tight">
                        {run.workflowName ?? run.workflowId}
                      </p>
                      <p className="text-[10px] text-foreground-400 mt-0.5">
                        {timeAgo(run.startedAt.toString())}
                      </p>
                    </div>
                    <RunStatusBadge status={run.status} />
                    <ChevronRight className="w-3 h-3 text-foreground-300 group-hover:text-primary-500 shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

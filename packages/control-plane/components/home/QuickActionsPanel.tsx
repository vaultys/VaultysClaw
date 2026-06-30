"use client";

import { useRouter } from "next/navigation";
import {
  Activity,
  BookOpen,
  Bot,
  ChevronRight,
  GitBranch,
  Inbox,
  MessageSquare,
  Play,
  Shield,
  Users,
} from "lucide-react";
import type { AgentInfo } from "@/lib/contracts";
import { AgentPill } from "./AgentPill";
import { QuickAction } from "./QuickAction";

export function QuickActionsPanel({
  isGlobalAdmin,
  agents,
  total,
  inboxBadge,
  expiredPolicyCount,
}: {
  isGlobalAdmin: boolean;
  agents: AgentInfo[];
  total: number;
  inboxBadge: number;
  expiredPolicyCount: number;
}) {
  const router = useRouter();

  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5">
        Quick Actions
      </h2>
      <div className="space-y-2">
        <QuickAction
          icon={Play}
          label="Run a Workflow"
          description="Trigger an existing automation"
          onClick={() => router.push("/workflows")}
          accent="primary"
        />
        <QuickAction
          icon={MessageSquare}
          label="Chat with an Agent"
          description="Send a task or question directly"
          onClick={() => router.push("/agents")}
          accent="secondary"
        />
        <QuickAction
          icon={GitBranch}
          label="New Workflow"
          description="Design a new automation"
          onClick={() => router.push("/workflows")}
          accent="primary"
        />
        <QuickAction
          icon={Inbox}
          label="My Inbox"
          description="Approvals and notifications"
          onClick={() => router.push("/inbox")}
          accent="warning"
          badge={inboxBadge}
        />
        <QuickAction
          icon={BookOpen}
          label="Knowledge Base"
          description="Browse documents and memory"
          onClick={() => router.push("/knowledge")}
          accent="secondary"
        />
        {isGlobalAdmin && (
          <>
            <QuickAction
              icon={Users}
              label="Manage Users"
              description="Invite or configure team members"
              onClick={() => router.push("/users")}
              accent="primary"
            />
            <QuickAction
              icon={Shield}
              label="Governance"
              description="Policies, budgets, delegation"
              onClick={() => router.push("/governance")}
              accent="success"
              badge={expiredPolicyCount}
            />
            <QuickAction
              icon={Activity}
              label="Mission Control"
              description="Fleet-wide metrics and spend"
              onClick={() => router.push("/mission-control")}
              accent="secondary"
            />
          </>
        )}
      </div>

      {agents.length > 0 && (
        <>
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5 pt-2">
            Agent Pulse
          </h2>
          <div className="space-y-1.5">
            {agents.slice(0, 6).map((agent, i) => (
              <AgentPill
                key={agent.did || i}
                agent={agent}
                onClick={() =>
                  router.push(`/agents/${encodeURIComponent(agent.did)}`)
                }
              />
            ))}
            {agents.length > 6 && (
              <button
                onClick={() => router.push("/agents")}
                className="w-full text-xs text-primary-600 hover:underline py-1 text-center"
              >
                +{agents.length - 6} more agents
              </button>
            )}
          </div>
        </>
      )}

      {total === 0 && (
        <button
          onClick={() => router.push("/agents")}
          className="w-full flex items-center justify-between gap-3 bg-primary-50 border border-primary-300 rounded-lg px-4 py-3 text-primary-700 text-sm hover:bg-primary-100/50 transition-colors group mt-2"
        >
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 shrink-0" />
            <span>Register your first agent</span>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}
    </div>
  );
}

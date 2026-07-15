"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { timeAgo } from "@vaultysclaw/shared";
import {
  MessageSquare,
  LayoutDashboard,
  Clock,
  Zap,
} from "lucide-react";
import {
  useToolbar,
  type ToolbarAction,
} from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { MyAgentOverview } from "@/components/agent/MyAgentOverview";
import { ChatTab } from "@/components/agent/ChatTab";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { UserAgentDetail } from "@/lib/contracts";

/**
 * Member-facing agent detail. A simplified counterpart of the admin agent page:
 * two tabs only (Overview + Chat), read-only, no delete. Uses the user-facing
 * `/api/agents/:did` endpoint, gated by `canAccessAgent`, so it is safe for any
 * role.
 */
export default function MyAgentDetailPage() {
  const params = useParams();
  const did = decodeURIComponent(params.did as string);

  const [activeTab, setActiveTab] = useState<string>("overview");
  const [agent, setAgent] = useState<UserAgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgent = useCallback(async () => {
    try {
      const data = unwrap(await userApi.agents.getAgent({ params: { did } }));
      setAgent(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch agent");
    } finally {
      setLoading(false);
    }
  }, [did]);

  useEffect(() => {
    fetchAgent();
  }, [fetchAgent]);

  useBreadcrumbs(
    [
      { label: "My Agents", href: "/app/my-agents" },
      { label: agent?.name ?? "Agent" },
    ],
    [agent?.name]
  );

  const toolbarActions: ToolbarAction[] = [];
  if (agent) {
    toolbarActions.push({
      kind: "tabs",
      id: "section",
      value: activeTab,
      onChange: setActiveTab,
      options: [
        {
          value: "overview",
          label: "Overview",
          icon: <LayoutDashboard size={15} />,
        },
        { value: "chat", label: "Chat", icon: <MessageSquare size={15} /> },
      ],
    });
    toolbarActions.push({
      kind: "badge",
      id: "status",
      label: agent.online ? "Online" : "Offline",
      tone: agent.online ? "success" : "neutral",
    });
    if (agent.reportedLlm) {
      toolbarActions.push({
        kind: "badge",
        id: "llm",
        label: `${agent.reportedLlm.provider} / ${agent.reportedLlm.model}`,
        icon: <Zap size={11} className="text-warning-500" />,
        tone: "neutral",
      });
    }
    toolbarActions.push({
      kind: "badge",
      id: "lastseen",
      label: `Last seen ${timeAgo(agent.lastSeen.toString())}`,
      icon: <Clock size={11} />,
      tone: "neutral",
    });
  }

  useToolbar(
    {
      title: agent?.name ?? "Agent",
      description: agent ? <span className="font-mono">{agent.did}</span> : did,
      actions: toolbarActions,
    },
    [agent, did, activeTab]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <p className="text-foreground-500">Loading agent details…</p>
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="bg-danger-50 border border-danger-300 rounded-lg px-4 py-3 text-danger-600">
          {error ?? "Agent not found"}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`p-6 w-full max-w-7xl mx-auto ${activeTab === "chat" ? "flex flex-col flex-1 min-h-0 pb-0" : "space-y-0"}`}
    >
      <div
        className={`border border-neutral-200 rounded-xl overflow-hidden bg-background-100 ${activeTab === "chat" ? "flex flex-col flex-1 min-h-0" : ""}`}
      >
        <div
          className={
            activeTab === "chat"
              ? "flex flex-col flex-1 min-h-0 overflow-hidden"
              : "p-6"
          }
        >
          {activeTab === "overview" && <MyAgentOverview agent={agent} />}
          {activeTab === "chat" && (
            <ChatTab
              agentId={agent.did}
              agentName={agent.name}
              online={agent.online}
            />
          )}
        </div>
      </div>
    </div>
  );
}

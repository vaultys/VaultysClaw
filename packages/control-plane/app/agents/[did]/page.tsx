"use client";
import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAdminWS } from "../../../hooks/useAdminWS";
import { timeAgo } from "@vaultysclaw/shared";
import dynamic from "next/dynamic";
import {
  Trash2,
  Loader2,
  MessageSquare,
  Settings2,
  Clock,
  ShieldCheck,
  LayoutDashboard,
  Zap,
  AlertTriangle,
  Activity,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { Tab, Tabs } from "@/components/shared/Tabs";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { useToolbar, type ToolbarAction } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { OverviewTab } from "@/components/agent/OverviewTab";
import { ChatTab } from "@/components/agent/ChatTab";
import { TokensTab } from "@/components/agent/TokensTab";
import { ConfigTab } from "@/components/agent/ConfigTab";
import { GovernanceTab } from "@/components/agent/GovernanceTab";
import { AutomationTab } from "@/components/agent/AutomationTab";
import { ApprovalsTab } from "@/components/agent/ApprovalsTab";
import { KnowledgeTab } from "@/components/agent/KnowledgeTab";
import {
  agentsClient,
  toolApprovalsClient,
  unwrap,
} from "@/lib/api/ts-rest/client";
import { AgentInfo } from "@/lib/contracts";

const AgentEnvironmentGraph = dynamic(
  () => import("@/components/graph/AgentEnvironmentGraph"),
  { ssr: false }
);

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const did = decodeURIComponent(params.did as string);

  const [activeTab, setActiveTab] = useState<string>("overview");
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { agents: agentsState, lastEvent } = useAdminWS();
  const liveAgent = agentsState.agents.find((a) => a.did === did);

  const handleDeleteAgent = async () => {
    setDeletingAgent(true);
    try {
      await agentsClient.deleteAgent({
        params: {
          did,
        },
      });

      router.push("/agents");
    } catch {
      setError("Network error while deleting agent");
    } finally {
      setDeletingAgent(false);
    }
  };

  const fetchAgent = useCallback(async () => {
    try {
      const agent = unwrap(await agentsClient.getAgent({ params: { did } }));
      setAgent(agent);
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

  useEffect(() => {
    if (liveAgent && agent) {
      setAgent((prev) =>
        prev
          ? {
              ...prev,
              online: liveAgent.online,
              connectedAt: liveAgent.connectedAt,
              lastHeartbeat: liveAgent.lastHeartbeat,
              lastSeen: liveAgent.lastSeen,
              capabilities: liveAgent.capabilities,
              name: liveAgent.name,
              reportedLlm: liveAgent.reportedLlm,
            }
          : prev
      );
    }
  }, [liveAgent]);

  useEffect(() => {
    if (
      lastEvent === "agent_reconnected" ||
      lastEvent === "capabilities_updated"
    ) {
      fetchAgent();
    }
  }, [lastEvent, fetchAgent]);

  useEffect(() => {
    const refresh = async () => {
      try {
        const { approvals } = unwrap(await toolApprovalsClient.list());
        setPendingApprovals(approvals.length);
      } catch {
        setPendingApprovals(0);
      }
    };
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, []);

  // ── TopBar breadcrumbs + toolbar (identity, status, stats, delete) ──────────

  useBreadcrumbs(
    [{ label: "Agents", href: "/agents" }, { label: agent?.name ?? "Agent" }],
    [agent?.name]
  );

  const toolbarActions: ToolbarAction[] = [];
  if (agent) {
    toolbarActions.push({
      kind: "badge",
      id: "status",
      label: agent.online ? "Online" : "Offline",
      tone: agent.online ? "success" : "neutral",
    });
    if (agent.online && agent.transport) {
      toolbarActions.push({
        kind: "badge",
        id: "transport",
        label: agent.transport === "peerjs" ? "WebRTC" : "WebSocket",
        tone: "neutral",
      });
    }
    if (agent.reportedLlm) {
      toolbarActions.push({
        kind: "badge",
        id: "llm",
        label: `${agent.reportedLlm.provider} / ${agent.reportedLlm.model}`,
        icon: <Zap size={11} className="text-warning-500" />,
        tone: "neutral",
      });
    }
    toolbarActions.push(
      {
        kind: "badge",
        id: "lastseen",
        label: `Last seen ${timeAgo(agent.lastSeen.toString())}`,
        icon: <Clock size={11} />,
        tone: "neutral",
      },
      {
        kind: "badge",
        id: "caps",
        label: `${agent.capabilities.length} capabilities`,
        tone: "neutral",
      },
      {
        kind: "button",
        id: "delete",
        label: "Delete",
        variant: "danger",
        icon: deletingAgent ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Trash2 size={14} />
        ),
        onClick: () => setShowDeleteConfirm(true),
        disabled: deletingAgent,
      }
    );
  }

  useToolbar(
    {
      title: agent?.name ?? "Agent",
      description: agent ? (
        <span className="font-mono">{agent.did}</span>
      ) : (
        did
      ),
      actions: toolbarActions,
    },
    [agent, deletingAgent, did]
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

  const tabs: Tab[] = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={15} /> },
    { id: "chat", label: "Chat", icon: <MessageSquare size={15} /> },
    { id: "tokens", label: "Tokens", icon: <TrendingUp size={15} /> },
    { id: "config", label: "Config", icon: <Settings2 size={15} /> },
    { id: "governance", label: "Governance", icon: <ShieldCheck size={15} /> },
    { id: "automation", label: "Automation", icon: <Clock size={15} /> },
    {
      id: "approvals",
      label: "Approvals",
      icon: <AlertTriangle size={15} />,
      badge: pendingApprovals,
    },
    { id: "knowledge", label: "Knowledge", icon: <BookOpen size={15} /> },
    { id: "graph", label: "Graph", icon: <Activity size={15} /> },
  ];

  return (
    <div
      className={`p-6 w-full max-w-7xl mx-auto ${activeTab === "chat" ? "flex flex-col flex-1 min-h-0 pb-0" : "space-y-0"}`}
    >
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete agent"
        message={`Are you sure you want to delete ${agent.name}? This action cannot be undone. The agent will be permanently removed from the system.`}
        confirmLabel="Delete agent"
        variant="danger"
        loading={deletingAgent}
        onConfirm={async () => {
          setShowDeleteConfirm(false);
          await handleDeleteAgent();
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* ── Tabbed content ── */}
      <div
        className={`border border-neutral-200 rounded-xl overflow-hidden bg-background-100 ${activeTab === "chat" ? "flex flex-col flex-1 min-h-0" : ""}`}
      >
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        <div
          className={
            activeTab === "chat"
              ? "flex flex-col flex-1 min-h-0 overflow-hidden"
              : "p-6"
          }
        >
          {activeTab === "overview" && (
            <OverviewTab agent={agent} onTabChange={setActiveTab} />
          )}
          {activeTab === "chat" && (
            <ChatTab
              agentId={agent.did}
              agentName={agent.name}
              online={agent.online}
            />
          )}
          {activeTab === "tokens" && <TokensTab agentId={agent.did} />}
          {activeTab === "config" && (
            <ConfigTab agent={agent} onChanged={fetchAgent} />
          )}
          {activeTab === "governance" && (
            <GovernanceTab did={did} agentCapabilities={agent.capabilities} />
          )}
          {activeTab === "automation" && <AutomationTab agentId={agent.did} />}
          {activeTab === "approvals" && (
            <ApprovalsTab onCountChange={setPendingApprovals} />
          )}
          {activeTab === "knowledge" && (
            <KnowledgeTab
              did={did}
              agentName={agent.name}
              online={agent.online}
              capabilities={agent.capabilities}
            />
          )}
          {activeTab === "graph" && (
            <AgentEnvironmentGraph
              agentId={agent.did}
              agentName={agent.name}
              transport={agent.transport}
              online={agent.online}
              reportedLlm={agent.reportedLlm}
              capabilities={agent.capabilities}
            />
          )}
        </div>
      </div>
    </div>
  );
}

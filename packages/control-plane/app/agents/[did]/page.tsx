"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAdminWS } from "../../../hooks/useAdminWS";
import { timeAgo } from "@vaultysclaw/shared";
import dynamic from "next/dynamic";
import {
  Bot,
  Trash2,
  Loader2,
  MessageSquare,
  Settings2,
  Clock,
  ShieldCheck,
  LayoutDashboard,
  ChevronLeft,
  Zap,
  AlertTriangle,
  Activity,
  BookOpen,
  TrendingUp,
} from "lucide-react";
import { Tab, Tabs } from "@/components/shared/Tabs";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import { OverviewTab } from "@/components/agent/OverviewTab";
import { ChatTab } from "@/components/agent/ChatTab";
import { TokensTab } from "@/components/agent/TokensTab";
import { ConfigTab } from "@/components/agent/ConfigTab";
import { GovernanceTab } from "@/components/agent/GovernanceTab";
import { AutomationTab } from "@/components/agent/AutomationTab";
import { ApprovalsTab } from "@/components/agent/ApprovalsTab";
import { KnowledgeTab } from "@/components/agent/KnowledgeTab";
import type { AgentDetail } from "@/components/agent/types";

const AgentEnvironmentGraph = dynamic(
  () => import("@/components/graph/AgentEnvironmentGraph"),
  { ssr: false }
);

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const did = decodeURIComponent(params.did as string);

  const [activeTab, setActiveTab] = useState<string>("overview");
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState(0);
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { agents: agentsState, lastEvent } = useAdminWS();
  const liveAgent = agentsState.agents.find((a) => a.id === did);

  const handleDeleteAgent = async () => {
    setDeletingAgent(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.push("/agents");
      } else {
        let errorMsg = "Failed to delete agent";
        try {
          const data = (await res.json()) as { error?: string };
          errorMsg = data.error ?? errorMsg;
        } catch {
          errorMsg = `Failed to delete agent (status ${res.status})`;
        }
        setError(errorMsg);
      }
    } catch {
      setError("Network error while deleting agent");
    } finally {
      setDeletingAgent(false);
    }
  };

  const fetchAgent = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(did)}`);
      if (res.status === 404) {
        setError("Agent not found");
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setAgent(await res.json());
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
              reportedLlm: liveAgent.reportedLlm ?? prev.reportedLlm,
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
      const res = await fetch("/api/tool-approvals")
        .then((r) => r.json())
        .catch(() => ({ approvals: [] }));
      setPendingApprovals((res.approvals ?? []).length);
    };
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => clearInterval(iv);
  }, []);

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
        <button
          onClick={() => router.push("/agents")}
          className="text-primary-400 hover:text-primary-300 mb-6 inline-block text-sm"
        >
          ← Back to Agents list
        </button>
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

      {/* ── Page header ── */}
      <div className="mb-4">
        <button
          onClick={() => router.push("/agents")}
          className="inline-flex items-center gap-1.5 text-sm text-foreground-500 hover:text-foreground mb-3 transition-colors"
        >
          <ChevronLeft size={15} />
          Back to Agents List
        </button>

        <div className="bg-background-100 border border-neutral-200 rounded-xl px-5 py-4 flex items-center gap-4">
          <div className="flex-shrink-0 w-11 h-11 rounded-full bg-primary-600/20 border border-primary-500/30 flex items-center justify-center">
            <Bot size={22} className="text-primary-400" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">
                {agent.name}
              </h1>
              {agent.online ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-success-700 bg-success-100 border border-success-300 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 bg-success-500 rounded-full animate-pulse" />
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 bg-background-200 border border-neutral-300 rounded-full px-2.5 py-0.5">
                  <span className="w-1.5 h-1.5 bg-neutral-300 rounded-full" />
                  Offline
                </span>
              )}
              {agent.online && agent.transport && (
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-0.5 border ${
                    agent.transport === "peerjs"
                      ? "text-secondary-700 bg-secondary-100 border-secondary-300"
                      : "text-primary-700 bg-primary-100 border-primary-300"
                  }`}
                >
                  {agent.transport === "peerjs" ? "WebRTC" : "WebSocket"}
                </span>
              )}
              {(agent.reportedLlm ?? agent.storedLlm) &&
                (() => {
                  const llm = agent.reportedLlm ?? agent.storedLlm!;
                  return (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground-500 bg-background-200 border border-neutral-300 rounded-full px-2.5 py-0.5">
                      <Zap size={11} className="text-warning-500" />
                      <span className="text-foreground-700">
                        {llm.provider}
                      </span>
                      <span className="text-foreground-400">/</span>
                      <span className="font-mono">{llm.model}</span>
                    </span>
                  );
                })()}
            </div>
            <p className="text-xs font-mono text-foreground-500 mt-0.5 truncate">
              {agent.id}
            </p>
          </div>

          <div className="hidden sm:flex gap-6 text-right flex-shrink-0">
            <div>
              <div className="text-xs text-foreground-500 uppercase">
                Last seen
              </div>
              <div className="text-sm text-foreground">
                {timeAgo(agent.lastSeen)}
              </div>
            </div>
            {(agent.reportedLlm ?? agent.storedLlm) &&
              (() => {
                const llm = agent.reportedLlm ?? agent.storedLlm!;
                return (
                  <div>
                    <div className="text-xs text-foreground-500 uppercase">
                      LLM
                    </div>
                    <div className="text-sm text-foreground font-mono">
                      {llm.model}
                    </div>
                    <div className="text-[10px] text-foreground-400">
                      {llm.provider}
                    </div>
                  </div>
                );
              })()}
            <div>
              <div className="text-xs text-foreground-500 uppercase">
                Capabilities
              </div>
              <div className="text-sm text-foreground">
                {agent.capabilities.length}
              </div>
            </div>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deletingAgent}
              className="ml-4 px-3 py-2 rounded-lg border border-danger-300 text-danger-600 hover:bg-danger-500/10 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
              title="Delete agent"
            >
              {deletingAgent ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Trash2 size={14} />
              )}
              Delete
            </button>
          </div>
        </div>
      </div>

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
              agentId={agent.id}
              agentName={agent.name}
              online={agent.online}
            />
          )}
          {activeTab === "tokens" && <TokensTab agentId={agent.id} />}
          {activeTab === "config" && (
            <ConfigTab did={did} reportedLlm={agent.reportedLlm} />
          )}
          {activeTab === "governance" && (
            <GovernanceTab did={did} agentCapabilities={agent.capabilities} />
          )}
          {activeTab === "automation" && <AutomationTab agentId={agent.id} />}
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
              agentId={agent.id}
              agentName={agent.name}
              transport={agent.transport}
              online={agent.online}
              reportedLlm={agent.reportedLlm}
              storedLlm={agent.storedLlm}
              capabilities={agent.capabilities}
            />
          )}
        </div>
      </div>
    </div>
  );
}

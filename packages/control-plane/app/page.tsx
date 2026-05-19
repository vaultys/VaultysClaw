"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAdminWS } from "../hooks/useAdminWS";
import { useRole } from "../hooks/useRole";
import {
  Bot,
  Wifi,
  WifiOff,
  Clock,
  Shield,
  Zap,
  Lock,
  ChevronRight,
  CircleDot,
  FolderOpen,
  Globe,
  Monitor,
  Plug,
  Mail,
  Code,
  Terminal,
  TrendingUp,
  DollarSign,
  Bell,
  CheckCircle,
  XCircle,
  X,
  Inbox,
} from "lucide-react";

/* ─── Capability icon map ────────────────────────────────────── */

const CAPABILITY_ICONS: Record<string, React.ReactNode> = {
  file_access: <FolderOpen size={14} />,
  internet_access: <Globe size={14} />,
  browser_control: <Monitor size={14} />,
  api_call: <Plug size={14} />,
  mail_send: <Mail size={14} />,
  code_execution: <Code size={14} />,
  system_command: <Terminal size={14} />,
};

/* ─── Helpers ────────────────────────────────────────────────── */

/** Shorten a DID for display: did:vaultys:abcdef1234... → did:…ef1234 */
function shortDid(did: string): string {
  if (did.length <= 24) return did;
  return `did:…${did.slice(-8)}`;
}

/** Ensure SQLite datetime strings (UTC without Z) are parsed correctly */
function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

/** Format an ISO date string as a relative "time ago" label */
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const seconds = Math.floor((Date.now() - parseUTC(iso).getTime()) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/* ─── Landing page (unauthenticated) ─────────────────────────── */

const LANDING_FEATURES = [
  {
    icon: Shield,
    title: "Cryptographic Identity",
    description:
      "Every agent and user is identified via VaultysID — a self-sovereign decentralized identity. No passwords, no secrets to leak.",
  },
  {
    icon: Zap,
    title: "Real-time Control",
    description:
      "Persistent WebSocket connections deliver intents to agents in milliseconds. No polling, zero latency overhead.",
  },
  {
    icon: Bot,
    title: "Agent Orchestration",
    description:
      "Register, approve, and manage distributed AI agents with granular capability policies enforced at every level.",
  },
  {
    icon: Lock,
    title: "Zero-Trust Architecture",
    description:
      "Every action is cryptographically signed and independently verified. Delegation certificates enable fine-grained auditable access.",
  },
];

function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-vc-bg text-vc-text overflow-x-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-10 bg-vc-bg/80 backdrop-blur border-b border-vc-border/60">
        <div className="flex items-center justify-between px-6 h-16 max-w-6xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base text-vc-text">VaultysClaw</span>
          </div>
          <button
            onClick={() => router.push("/login")}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Sign in <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-b from-indigo-50 via-white to-white dark:from-indigo-950/40 dark:via-vc-bg dark:to-vc-bg border-b border-vc-border/60">
        <div className="max-w-4xl mx-auto px-6 pt-20 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700/50 rounded-full text-indigo-600 dark:text-indigo-300 text-xs font-medium mb-6">
            <span className="w-1.5 h-1.5 bg-indigo-500 dark:bg-indigo-400 rounded-full" />
            Powered by VaultysID · Decentralized · Trustless
          </div>
          <h1 className="text-5xl md:text-6xl font-bold leading-tight mb-5 text-vc-text">
            Sovereign AI Agent{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 dark:from-indigo-400 dark:via-purple-400 dark:to-indigo-400">
              Orchestration
            </span>
          </h1>
          <p className="text-vc-muted text-lg max-w-2xl mx-auto leading-relaxed mb-10">
            Cryptographically secure control plane for distributed AI agents.
            Full audit trail, hardware-backed identities, zero trust required.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => router.push("/login")}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
            >
              Get Started
            </button>
            <button
              onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}
              className="bg-vc-surface hover:bg-vc-raised border border-vc-border text-vc-text-2 font-medium px-6 py-3 rounded-xl transition-colors"
            >
              Learn more
            </button>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-vc-border/60 bg-vc-surface">
        <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: "< 100ms", label: "Intent delivery" },
            { value: "10K+", label: "Concurrent agents" },
            { value: "Ed25519", label: "Signatures" },
            { value: "Zero", label: "Trusted third parties" },
          ].map(({ value, label }) => (
            <div key={label}>
              <p className="text-2xl font-bold text-vc-text">{value}</p>
              <p className="text-vc-muted text-sm mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3 text-vc-text">Built for security-first teams</h2>
          <p className="text-vc-muted max-w-xl mx-auto">
            Every component is designed around the principle that no party should be
            implicitly trusted — including the control plane itself.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {LANDING_FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="flex gap-4 bg-vc-surface border border-vc-border rounded-2xl p-6 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
            >
              <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700/50 rounded-xl flex items-center justify-center shrink-0">
                <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="font-semibold text-vc-text mb-1.5">{title}</h3>
                <p className="text-vc-muted text-sm leading-relaxed">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 rounded-3xl p-10">
          <h2 className="text-2xl font-bold mb-3 text-vc-text">Ready to take control?</h2>
          <p className="text-vc-muted mb-6">Sign in with your Vaultys wallet to access the control plane.</p>
          <button
            onClick={() => router.push("/login")}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-7 py-3 rounded-xl transition-colors shadow-lg shadow-indigo-600/20"
          >
            Sign in with VaultysID
          </button>
        </div>
      </section>

      <footer className="border-t border-vc-border/60 py-6 text-center text-vc-subtle text-xs">
        © {new Date().getFullYear()} VaultysClaw · All rights reserved
      </footer>
    </div>
  );
}

/* ─── Dashboard (authenticated) ──────────────────────────────── */

interface Approval {
  id: string;
  run_id: string;
  step_id: string;
  workflow_id: string;
  workflow_name: string;
  node_message: string | null;
  step_input: string | null;
  mode: "approval" | "notification";
  status: string;
  created_at: string;
}

function Dashboard() {
  const router = useRouter();
  const { isGlobalAdmin } = useRole();
  const { agents: agentsState, registrations: pendingRegs, connected: wsConnected } = useAdminWS();

  const agents = agentsState.agents;
  const total = agentsState.total;
  const onlineCount = agentsState.online;

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});

  const fetchApprovals = () =>
    fetch("/api/workflow-approvals")
      .then((r) => r.json())
      .then((d: { approvals?: Approval[] }) => setApprovals(d.approvals ?? []))
      .catch(() => { });

  useEffect(() => {
    fetchApprovals();
    const id = setInterval(fetchApprovals, 15_000);
    return () => clearInterval(id);
  }, []);

  const handleApprove = async (id: string) => {
    setActing(id);
    await fetch(`/api/workflow-approvals/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: comment[id] || undefined }),
    });
    await fetchApprovals();
    setActing(null);
  };

  const handleReject = async (id: string) => {
    setActing(id);
    await fetch(`/api/workflow-approvals/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comment: comment[id] || undefined }),
    });
    await fetchApprovals();
    setActing(null);
  };

  const handleDismiss = async (id: string) => {
    setActing(id);
    await fetch(`/api/workflow-approvals/${id}/dismiss`, { method: "POST" });
    await fetchApprovals();
    setActing(null);
  };

  const pendingApprovals = approvals.filter((a) => a.mode === "approval" && a.status === "pending");
  const notifications = approvals.filter((a) => a.mode === "notification" && a.status === "notified");

  // Calculate fleet-wide token metrics
  const onlineAgents = agents.filter((a) => a.online);
  const tokenMetrics = onlineAgents.reduce(
    (acc, agent) => {
      if (agent.tokenUsage) {
        acc.totalPrompt += agent.tokenUsage.promptTokens;
        acc.totalCompletion += agent.tokenUsage.completionTokens;
      }
      if (agent.dailyTokenUsage) {
        acc.dailyPrompt += agent.dailyTokenUsage.promptTokens;
        acc.dailyCompletion += agent.dailyTokenUsage.completionTokens;
      }
      if (agent.monthlyTokenUsage) {
        acc.monthlyPrompt += agent.monthlyTokenUsage.promptTokens;
        acc.monthlyCompletion += agent.monthlyTokenUsage.completionTokens;
      }
      acc.dailyPrice += agent.dailyPriceSpent ?? 0;
      return acc;
    },
    { totalPrompt: 0, totalCompletion: 0, dailyPrompt: 0, dailyCompletion: 0, monthlyPrompt: 0, monthlyCompletion: 0, dailyPrice: 0 }
  );

  const totalTokensDaily = tokenMetrics.dailyPrompt + tokenMetrics.dailyCompletion;
  const totalTokensMonthly = tokenMetrics.monthlyPrompt + tokenMetrics.monthlyCompletion;
  const avgCostPerAgent = onlineCount > 0 ? (tokenMetrics.dailyPrice / onlineCount).toFixed(4) : "0";

  // Calculate projected token usage for the current month
  const today = new Date();
  const daysIntoMonth = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const projectedMonthlyTokens = Math.ceil((totalTokensMonthly / daysIntoMonth) * daysInMonth);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-vc-text">Dashboard</h1>
          <p className="text-vc-subtle text-sm mt-1">Overview of your agents, workflows, and pending actions</p>
        </div>
        <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${wsConnected
          ? "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700/50 text-green-700 dark:text-green-400"
          : "bg-yellow-100 dark:bg-yellow-900/40 border-yellow-300 dark:border-yellow-700/50 text-yellow-700 dark:text-yellow-400"
          }`}>
          {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {wsConnected ? "Live" : "Connecting…"}
        </span>
      </div>

      {/* Alerts */}
      {!wsConnected && (
        <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700/50 rounded-lg px-4 py-3 text-yellow-700 dark:text-yellow-300 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          WebSocket connection is being restored. Some metrics may be stale.
        </div>
      )}

      {isGlobalAdmin && pendingRegs.length > 0 && (
        <button
          onClick={() => router.push("/registrations")}
          className="w-full flex items-center justify-between gap-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 border border-amber-300 dark:border-amber-700/50 rounded-lg px-4 py-3 text-amber-700 dark:text-amber-300 text-sm hover:bg-amber-100/50 dark:hover:bg-amber-900/30 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 shrink-0" />
            <span><strong>{pendingRegs.length}</strong> agent registration{pendingRegs.length !== 1 ? 's' : ''} pending approval</span>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {total === 0 && (
        <button
          onClick={() => router.push("/agents")}
          className="w-full flex items-center justify-between gap-3 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 border border-indigo-300 dark:border-indigo-700/50 rounded-lg px-4 py-3 text-indigo-700 dark:text-indigo-300 text-sm hover:bg-indigo-100/50 dark:hover:bg-indigo-900/30 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 shrink-0" />
            <span>Get started by registering your first agent</span>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => router.push("/agents")}
          className="relative bg-vc-surface rounded-lg border border-vc-border p-5 text-left hover:border-indigo-400 dark:hover:border-indigo-600 transition-all duration-300 group overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-indigo-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/40 dark:to-indigo-800/40 rounded-lg flex items-center justify-center">
                <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <p className="text-vc-muted text-xs font-semibold uppercase tracking-widest">Agents</p>
            </div>
            <p className="text-4xl font-bold text-vc-text mb-1">{total}</p>
            <p className="text-xs text-vc-subtle flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
              {onlineCount} online
            </p>
          </div>
        </button>

        <button
          onClick={() => router.push("/agents")}
          className="relative bg-vc-surface rounded-lg border border-vc-border p-5 text-left hover:border-green-400 dark:hover:border-green-600 transition-all duration-300 group overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-emerald-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-gradient-to-br from-green-100 to-emerald-200 dark:from-green-900/40 dark:to-emerald-800/40 rounded-lg flex items-center justify-center">
                <CircleDot className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <p className="text-vc-muted text-xs font-semibold uppercase tracking-widest">Status</p>
            </div>
            <p className="text-4xl font-bold text-green-600 dark:text-green-400 mb-1">{onlineCount}/{total}</p>
            <p className="text-xs text-vc-subtle">{total - onlineCount} offline</p>
          </div>
        </button>

        <button
          onClick={() => router.push("/inbox")}
          className="relative bg-vc-surface rounded-lg border border-vc-border p-5 text-left hover:border-amber-400 dark:hover:border-amber-600 transition-all duration-300 group overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-orange-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-100 to-orange-200 dark:from-amber-900/40 dark:to-orange-800/40 rounded-lg flex items-center justify-center">
                <Inbox className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <p className="text-vc-muted text-xs font-semibold uppercase tracking-widest">Approvals</p>
            </div>
            <p className="text-4xl font-bold text-amber-600 dark:text-amber-400 mb-1">{pendingApprovals.length}</p>
            <p className="text-xs text-vc-subtle">awaiting your decision</p>
          </div>
        </button>

        {isGlobalAdmin && (
          <div className="relative bg-vc-surface rounded-lg border border-vc-border p-5 overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-rose-100 to-pink-200 dark:from-rose-900/40 dark:to-pink-800/40 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                </div>
                <p className="text-vc-muted text-xs font-semibold uppercase tracking-widest">Today</p>
              </div>
              <p className="text-4xl font-bold text-rose-600 dark:text-rose-400 mb-1">${tokenMetrics.dailyPrice.toFixed(2)}</p>
              <p className="text-xs text-vc-subtle">{totalTokensDaily.toLocaleString()} tokens</p>
            </div>
          </div>
        )}
      </div>

      {/* Token metrics */}
      {isGlobalAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-vc-surface rounded-lg border border-vc-border p-5 hover:border-blue-400 dark:hover:border-blue-600 transition-colors">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-cyan-200 dark:from-blue-900/40 dark:to-cyan-800/40 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className="text-sm font-semibold text-vc-text">Daily Usage</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-vc-muted">Input tokens</span>
                  <span className="text-sm font-semibold text-vc-text">{tokenMetrics.dailyPrompt.toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-vc-raised rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full" style={{ width: `${Math.min(100, (tokenMetrics.dailyPrompt / Math.max(1, totalTokensDaily)) * 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-vc-muted">Output tokens</span>
                  <span className="text-sm font-semibold text-vc-text">{tokenMetrics.dailyCompletion.toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-vc-raised rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-500 to-cyan-600 rounded-full" style={{ width: `${Math.min(100, (tokenMetrics.dailyCompletion / Math.max(1, totalTokensDaily)) * 100)}%` }} />
                </div>
              </div>
              <div className="pt-2 border-t border-vc-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-vc-muted">Avg per agent</span>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">${avgCostPerAgent}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-vc-surface rounded-lg border border-vc-border p-5 hover:border-purple-400 dark:hover:border-purple-600 transition-colors">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-purple-100 to-fuchsia-200 dark:from-purple-900/40 dark:to-fuchsia-800/40 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <h3 className="text-sm font-semibold text-vc-text">Monthly Usage</h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-vc-muted">Input tokens</span>
                  <span className="text-sm font-semibold text-vc-text">{tokenMetrics.monthlyPrompt.toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-vc-raised rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-purple-500 to-purple-600 rounded-full" style={{ width: `${Math.min(100, (tokenMetrics.monthlyPrompt / Math.max(1, totalTokensMonthly)) * 100)}%` }} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-vc-muted">Output tokens</span>
                  <span className="text-sm font-semibold text-vc-text">{tokenMetrics.monthlyCompletion.toLocaleString()}</span>
                </div>
                <div className="h-1.5 bg-vc-raised rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-fuchsia-500 to-fuchsia-600 rounded-full" style={{ width: `${Math.min(100, (tokenMetrics.monthlyCompletion / Math.max(1, totalTokensMonthly)) * 100)}%` }} />
                </div>
              </div>
              <div className="pt-2 border-t border-vc-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-vc-muted">Total this month</span>
                  <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">{totalTokensMonthly.toLocaleString()}</span>
                </div>
              </div>
              <div className="pt-2 border-t border-vc-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-vc-muted">Projected (end of month)</span>
                  <span className="text-xs font-semibold text-purple-500 dark:text-purple-300">{projectedMonthlyTokens.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inbox section */}
      <div className="grid lg:grid-cols-2 gap-6">

        {/* Pending approvals */}
        <div className="bg-vc-surface rounded-xl border border-vc-border overflow-hidden">
          <div className="px-5 py-4 border-b border-vc-border flex items-center justify-between bg-gradient-to-r from-amber-50/50 to-orange-50/50 dark:from-amber-900/10 dark:to-orange-900/10">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <h2 className="text-sm font-semibold text-vc-text">Pending Approvals</h2>
              {pendingApprovals.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 rounded-full">
                  {pendingApprovals.length}
                </span>
              )}
            </div>
            <button onClick={() => router.push("/inbox")} className="text-xs text-amber-600 dark:text-amber-400 hover:underline font-medium">View all</button>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle className="w-8 h-8 text-green-700 dark:text-green-400 mx-auto mb-2 opacity-50" />
              <p className="text-vc-muted text-sm">No pending approvals</p>
            </div>
          ) : (
            <div className="divide-y divide-vc-border max-h-[420px] overflow-y-auto">
              {pendingApprovals.map((item) => (
                <div key={item.id} className="p-4 space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm text-vc-text">{item.workflow_name}</p>
                      <span className="text-[10px] text-vc-subtle whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    {item.node_message && (
                      <p className="text-sm text-vc-text-2 mt-0.5">{item.node_message}</p>
                    )}
                    <p className="text-xs text-vc-muted mt-0.5">Step: {item.step_id}</p>
                  </div>

                  {item.step_input && (
                    <pre className="text-xs bg-vc-raised text-vc-text border border-vc-border rounded-lg p-2 overflow-x-auto max-h-20 whitespace-pre-wrap break-words">
                      {item.step_input.slice(0, 200)}{item.step_input.length > 200 ? "…" : ""}
                    </pre>
                  )}

                  <div className="space-y-2">
                    <textarea
                      rows={1}
                      value={comment[item.id] || ""}
                      onChange={(e) => setComment((c) => ({ ...c, [item.id]: e.target.value }))}
                      placeholder="Comment (optional)…"
                      className="w-full text-xs bg-vc-raised text-vc-text border border-vc-border rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-400 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(item.id)}
                        disabled={acting === item.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
                      >
                        <CheckCircle size={12} /> Approve
                      </button>
                      <button
                        onClick={() => handleReject(item.id)}
                        disabled={acting === item.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs rounded-lg hover:bg-red-700 disabled:opacity-50 font-medium"
                      >
                        <XCircle size={12} /> Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent notifications */}
        <div className="bg-vc-surface rounded-xl border border-vc-border overflow-hidden">
          <div className="px-5 py-4 border-b border-vc-border flex items-center justify-between bg-gradient-to-r from-blue-50/50 to-cyan-50/50 dark:from-blue-900/10 dark:to-cyan-900/10">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-vc-text">Notifications</h2>
              {notifications.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 rounded-full">
                  {notifications.length}
                </span>
              )}
            </div>
            <button onClick={() => router.push("/inbox")} className="text-xs text-blue-500 hover:underline font-medium">View all</button>
          </div>

          {notifications.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Bell className="w-8 h-8 text-vc-ring mx-auto mb-2 opacity-30" />
              <p className="text-vc-muted text-sm">No new notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-vc-border max-h-[420px] overflow-y-auto">
              {notifications.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-4">
                  <Bell size={14} className="text-blue-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-vc-text">{item.workflow_name}</p>
                    {item.node_message && (
                      <p className="text-sm text-vc-text-2 mt-0.5">{item.node_message}</p>
                    )}
                    {item.step_input && (
                      <p className="text-xs text-vc-muted mt-0.5 truncate">{item.step_input.slice(0, 100)}</p>
                    )}
                    <p className="text-[11px] text-vc-subtle mt-1">
                      {new Date(item.created_at).toLocaleString()} · Step: {item.step_id}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDismiss(item.id)}
                    disabled={acting === item.id}
                    className="p-1 hover:bg-vc-raised rounded text-vc-muted hover:text-vc-text disabled:opacity-50 shrink-0"
                    title="Dismiss"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Page entry point ────────────────────────────────────────── */

export default function Home() {
  const { status } = useSession();

  if (status === "unauthenticated") return <LandingPage />;
  if (status === "loading") return null; // AppShell shows the spinner

  return <Dashboard />;
}

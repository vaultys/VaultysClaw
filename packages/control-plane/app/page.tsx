"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { useAdminWS } from "../hooks/useAdminWS";
import { useRole } from "../hooks/useRole";
import type { MapMarker } from "@/components/map/WorldMap";

const WorldMap = dynamic(
  () => import("@/components/map/WorldMap").then((m) => m.WorldMap),
  { ssr: false }
);
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
  ShieldAlert,
  RotateCcw,
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
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {/* Nav */}
      <nav className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b border-neutral-200/60">
        <div className="flex items-center justify-between px-6 h-16 max-w-6xl mx-auto animate-fade-in-up">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-primary-600 rounded-lg flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base text-foreground">
              VaultysClaw
            </span>
          </div>
          <button
            onClick={() => router.push("/login")}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Sign in <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative border-b border-neutral-200/60 overflow-hidden">
        {/* Aurora background */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary-50/80 via-background to-background pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-primary-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-24 left-1/3 w-[320px] h-[320px] bg-secondary-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-16 right-1/3 w-[220px] h-[220px] bg-primary-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="mesh-overlay absolute inset-0 opacity-40 pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 pt-20 pb-20 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-100 border border-primary-200 rounded-full text-primary-600 text-xs font-medium mb-6 animate-fade-in-up">
            <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse" />
            Powered by VaultysID · Decentralized · Trustless
          </div>

          {/* Headline */}
          <h1
            className="text-5xl md:text-6xl font-bold leading-tight mb-5 text-foreground animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            Sovereign AI Agent{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 via-secondary-600 to-primary-600 animate-gradient-shift">
              Orchestration
            </span>
          </h1>

          {/* Subtitle */}
          <p
            className="text-foreground-500 text-lg max-w-2xl mx-auto leading-relaxed mb-10 animate-fade-in-up"
            style={{ animationDelay: "200ms" }}
          >
            Cryptographically secure control plane for distributed AI agents.
            Full audit trail, hardware-backed identities, zero trust required.
          </p>

          {/* CTAs */}
          <div
            className="flex flex-col sm:flex-row gap-3 justify-center animate-fade-in-up"
            style={{ animationDelay: "300ms" }}
          >
            <button
              onClick={() => router.push("/login")}
              className="relative overflow-hidden bg-primary-600 hover:bg-primary-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors shadow-lg shadow-primary-600/20 group"
            >
              <span className="relative z-10">Get Started</span>
              <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
            </button>
            <button
              onClick={() =>
                document
                  .getElementById("features")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="bg-background-100 hover:bg-background-200 border border-neutral-200 text-foreground-700 font-medium px-6 py-3 rounded-xl transition-colors"
            >
              Learn more
            </button>
          </div>
        </div>
      </section>

      {/* Stats strip */}
      <section className="border-b border-neutral-200/60 bg-background-100">
        <div className="max-w-4xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          {[
            { value: "< 100ms", label: "Intent delivery" },
            { value: "10K+", label: "Concurrent agents" },
            { value: "Ed25519", label: "Signatures" },
            { value: "Zero", label: "Trusted third parties" },
          ].map(({ value, label }, i) => (
            <div
              key={label}
              className="animate-fade-in-up"
              style={{ animationDelay: `${400 + i * 80}ms` }}
            >
              <p className="text-2xl font-bold text-foreground">{value}</p>
              <p className="text-foreground-500 text-sm mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-5xl mx-auto px-6 py-20">
        <div
          className="text-center mb-12 animate-fade-in-up"
          style={{ animationDelay: "100ms" }}
        >
          <h2 className="text-3xl font-bold mb-3 text-foreground">
            Built for security-first teams
          </h2>
          <p className="text-foreground-500 max-w-xl mx-auto">
            Every component is designed around the principle that no party
            should be implicitly trusted — including the control plane itself.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {LANDING_FEATURES.map(({ icon: Icon, title, description }, i) => (
            <div
              key={title}
              className="flex gap-4 bg-background-100 border border-neutral-200 rounded-2xl p-6 hover:border-primary-300:border-primary-700 hover:shadow-lg hover:shadow-primary-500/10 hover:-translate-y-1 transition-all duration-300 group animate-fade-in-up"
              style={{ animationDelay: `${200 + i * 100}ms` }}
            >
              <div className="w-10 h-10 bg-primary-100 border border-primary-200 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-primary-200:bg-primary-800/60 transition-all duration-300">
                <Icon className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1.5">
                  {title}
                </h3>
                <p className="text-foreground-500 text-sm leading-relaxed">
                  {description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-6 py-16 text-center">
        <div className="bg-primary-50 border border-primary-200 rounded-3xl p-10 animate-fade-in-up">
          <h2 className="text-2xl font-bold mb-3 text-foreground">
            Ready to take control?
          </h2>
          <p className="text-foreground-500 mb-6">
            Sign in with your Vaultys wallet to access the control plane.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="relative overflow-hidden bg-primary-600 hover:bg-primary-500 text-white font-semibold px-7 py-3 rounded-xl transition-colors shadow-lg shadow-primary-600/20 group"
          >
            <span className="relative z-10">Sign in with VaultysID</span>
            <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
          </button>
        </div>
      </section>

      <footer className="border-t border-neutral-200/60 py-6 text-center text-foreground-400 text-xs">
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
  const {
    agents: agentsState,
    registrations: pendingRegs,
    connected: wsConnected,
  } = useAdminWS();

  const agents = agentsState.agents;
  const total = agentsState.total;
  const onlineCount = agentsState.online;

  // ── Setup banner ────────────────────────────────────────────────────────────
  const [setupBanner, setSetupBanner] = useState<{
    completedCount: number;
  } | null>(null);

  useEffect(() => {
    if (!isGlobalAdmin) return;
    if (localStorage.getItem("vaultysclaw:wizardDone")) return;
    let completedCount = 0;
    try {
      const raw = localStorage.getItem("vaultysclaw:wizardState");
      if (raw) completedCount = (JSON.parse(raw).completed ?? []).length;
    } catch {
      /* ignore */
    }
    setSetupBanner({ completedCount });
  }, [isGlobalAdmin]);

  const dismissSetupBanner = () => {
    localStorage.setItem("vaultysclaw:wizardDone", "1");
    setSetupBanner(null);
  };

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [acting, setActing] = useState<string | null>(null);
  const [comment, setComment] = useState<Record<string, string>>({});

  interface TokenStats {
    allTime: { promptTokens: number; completionTokens: number };
    daily: { promptTokens: number; completionTokens: number };
    monthly: { promptTokens: number; completionTokens: number };
  }
  const [dbTokenStats, setDbTokenStats] = useState<TokenStats | null>(null);

  const fetchTokenStats = () =>
    fetch("/api/stats/tokens")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TokenStats | null) => {
        if (d) setDbTokenStats(d);
      })
      .catch(() => {});

  interface ExpiredPolicy {
    id: string;
    agentDid: string | null;
    capabilities: string[];
    resourceLimits: {
      maxTokensPerDay?: number;
      maxRequestsPerHour?: number;
    } | null;
    expiresAt: string | null;
    createdAt: string;
  }
  const [expiredPolicies, setExpiredPolicies] = useState<ExpiredPolicy[]>([]);
  const [renewingPolicy, setRenewingPolicy] = useState<ExpiredPolicy | null>(
    null
  );
  const [renewExpiry, setRenewExpiry] = useState("");
  const [renewSaving, setRenewSaving] = useState(false);

  const fetchExpiredPolicies = () => {
    if (!isGlobalAdmin) return;
    fetch("/api/policies?expiredOnly=true")
      .then((r) => (r.ok ? r.json() : { policies: [] }))
      .then((d: { policies?: ExpiredPolicy[] }) =>
        setExpiredPolicies(d.policies ?? [])
      )
      .catch(() => {});
  };

  const openRenewFromDashboard = (p: ExpiredPolicy) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const d = new Date(Date.now() + 30 * 86_400_000);
    setRenewExpiry(
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
    );
    setRenewingPolicy(p);
  };

  const confirmRenewFromDashboard = async () => {
    if (!renewingPolicy) return;
    setRenewSaving(true);
    try {
      const rl =
        renewingPolicy.resourceLimits &&
        Object.keys(renewingPolicy.resourceLimits).length > 0
          ? renewingPolicy.resourceLimits
          : undefined;
      const res = await fetch("/api/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentDid: renewingPolicy.agentDid,
          capabilities: renewingPolicy.capabilities,
          resourceLimits: rl,
          expiresAt: renewExpiry
            ? new Date(renewExpiry).toISOString()
            : undefined,
        }),
      });
      if (res.ok) {
        await fetch(`/api/policies/${encodeURIComponent(renewingPolicy.id)}`, {
          method: "DELETE",
        });
        setRenewingPolicy(null);
        fetchExpiredPolicies();
      }
    } finally {
      setRenewSaving(false);
    }
  };

  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);

  const fetchMapMarkers = () =>
    fetch("/api/map")
      .then((r) => (r.ok ? r.json() : { markers: [] }))
      .then((d: { markers?: MapMarker[] }) => setMapMarkers(d.markers ?? []))
      .catch(() => {});

  useEffect(() => {
    fetchMapMarkers();
    const id = setInterval(fetchMapMarkers, 30_000);
    return () => clearInterval(id);
  }, []);

  const fetchApprovals = () =>
    fetch("/api/workflow-approvals")
      .then((r) => r.json())
      .then((d: { approvals?: Approval[] }) => setApprovals(d.approvals ?? []))
      .catch(() => {});

  useEffect(() => {
    fetchApprovals();
    const id = setInterval(fetchApprovals, 15_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchExpiredPolicies();
    const id = setInterval(fetchExpiredPolicies, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobalAdmin]);

  useEffect(() => {
    fetchTokenStats();
    const id = setInterval(fetchTokenStats, 60_000);
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

  const pendingApprovals = approvals.filter(
    (a) => a.mode === "approval" && a.status === "pending"
  );
  const notifications = approvals.filter(
    (a) => a.mode === "notification" && a.status === "notified"
  );

  // Calculate fleet-wide token metrics — prefer DB (all agents) over WS state (online only)
  const onlineAgents = agents.filter((a) => a.online);
  const wsMetrics = onlineAgents.reduce(
    (acc, agent) => {
      acc.dailyPrice += agent.dailyPriceSpent ?? 0;
      return acc;
    },
    { dailyPrice: 0 }
  );
  const tokenMetrics = {
    totalPrompt: dbTokenStats?.allTime.promptTokens ?? 0,
    totalCompletion: dbTokenStats?.allTime.completionTokens ?? 0,
    dailyPrompt: dbTokenStats?.daily.promptTokens ?? 0,
    dailyCompletion: dbTokenStats?.daily.completionTokens ?? 0,
    monthlyPrompt: dbTokenStats?.monthly.promptTokens ?? 0,
    monthlyCompletion: dbTokenStats?.monthly.completionTokens ?? 0,
    dailyPrice: wsMetrics.dailyPrice,
  };

  const totalTokensDaily =
    tokenMetrics.dailyPrompt + tokenMetrics.dailyCompletion;
  const totalTokensMonthly =
    tokenMetrics.monthlyPrompt + tokenMetrics.monthlyCompletion;
  const avgCostPerAgent =
    onlineCount > 0 ? (tokenMetrics.dailyPrice / onlineCount).toFixed(4) : "0";

  // Calculate projected token usage for the current month
  const today = new Date();
  const daysIntoMonth = today.getDate();
  const daysInMonth = new Date(
    today.getFullYear(),
    today.getMonth() + 1,
    0
  ).getDate();
  const projectedMonthlyTokens = Math.ceil(
    (totalTokensMonthly / daysIntoMonth) * daysInMonth
  );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-6">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-foreground-400 text-sm mt-1">
            Overview of your agents, workflows, and pending actions
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${
            wsConnected
              ? "bg-success-100 border-success-300 text-success-700"
              : "bg-warning-100 border-warning-300 text-warning-700"
          }`}
        >
          {wsConnected ? (
            <Wifi className="w-3 h-3" />
          ) : (
            <WifiOff className="w-3 h-3" />
          )}
          {wsConnected ? "Live" : "Connecting…"}
        </span>
      </div>

      {/* Alerts */}
      {!wsConnected && (
        <div className="flex items-center gap-2 bg-warning-50 border border-warning-300 rounded-lg px-4 py-3 text-warning-700 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          WebSocket connection is being restored. Some metrics may be stale.
        </div>
      )}

      {isGlobalAdmin && pendingRegs.length > 0 && (
        <button
          onClick={() => router.push("/registrations")}
          className="w-full flex items-center justify-between gap-3 bg-gradient-to-r from-warning-50 to-warning-50 border border-warning-300 rounded-lg px-4 py-3 text-warning-700 text-sm hover:bg-warning-100/50:bg-warning-900/30 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 shrink-0" />
            <span>
              <strong>{pendingRegs.length}</strong> agent registration
              {pendingRegs.length !== 1 ? "s" : ""} pending approval
            </span>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
        </button>
      )}

      {/* Expired policies alert — global admin only */}
      {isGlobalAdmin && expiredPolicies.length > 0 && (
        <div className="bg-danger-50 border border-danger-300 rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-danger-200">
            <span className="flex items-center gap-2 text-danger-700 text-sm font-medium">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              {expiredPolicies.length} expired polic
              {expiredPolicies.length === 1 ? "y" : "ies"} — agents are locked
            </span>
            <button
              onClick={() => router.push("/governance")}
              className="text-xs text-danger-600 hover:underline flex items-center gap-1"
            >
              View all <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <div className="divide-y divide-danger-200/60">
            {expiredPolicies.slice(0, 5).map((p) => {
              const agentName = agents.find((a) => a.id === p.agentDid)?.name;
              const expiredAgo = p.expiresAt
                ? (() => {
                    const secs = Math.floor(
                      (Date.now() -
                        new Date(
                          p.expiresAt.endsWith("Z")
                            ? p.expiresAt
                            : p.expiresAt + "Z"
                        ).getTime()) /
                        1000
                    );
                    if (secs < 60) return `${secs}s ago`;
                    const mins = Math.floor(secs / 60);
                    if (mins < 60) return `${mins}m ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs}h ago`;
                    return `${Math.floor(hrs / 24)}d ago`;
                  })()
                : "";
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-danger-800 truncate">
                        {agentName ??
                          (p.agentDid
                            ? `${p.agentDid.slice(0, 24)}…`
                            : "Global")}
                      </p>
                      <p className="text-[11px] text-danger-600/70">
                        Expired {expiredAgo} · {p.capabilities.length} cap
                        {p.capabilities.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => openRenewFromDashboard(p)}
                    className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-danger-700 hover:text-primary-600:text-primary-400 border border-danger-300 hover:border-primary-400:border-primary-500/50 px-2.5 py-1 rounded-md transition-colors"
                  >
                    <RotateCcw className="w-3 h-3" /> Renew
                  </button>
                </div>
              );
            })}
            {expiredPolicies.length > 5 && (
              <p className="px-4 py-2 text-xs text-danger-600/70">
                +{expiredPolicies.length - 5} more —{" "}
                <button
                  onClick={() => router.push("/governance")}
                  className="underline hover:no-underline"
                >
                  view in Governance
                </button>
              </p>
            )}
          </div>
        </div>
      )}

      {/* Renew policy modal (from dashboard) */}
      {renewingPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <RotateCcw className="w-4 h-4 text-primary-500" /> Renew expired
                policy
              </span>
              <button
                onClick={() => setRenewingPolicy(null)}
                className="text-foreground-400 hover:text-foreground p-1 rounded-lg hover:bg-background-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-background-200 border border-neutral-200 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-medium text-foreground">
                  {agents.find((a) => a.id === renewingPolicy.agentDid)?.name ??
                    renewingPolicy.agentDid?.slice(0, 30) ??
                    "Global"}
                </p>
                <p className="text-xs text-foreground-500">
                  {renewingPolicy.capabilities.join(", ")}
                </p>
                {renewingPolicy.expiresAt && (
                  <p className="text-xs text-danger-500">
                    Expired{" "}
                    {new Date(
                      renewingPolicy.expiresAt.endsWith("Z")
                        ? renewingPolicy.expiresAt
                        : renewingPolicy.expiresAt + "Z"
                    ).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-foreground-500 font-medium">
                  New expiry date
                </label>
                <input
                  type="datetime-local"
                  value={renewExpiry}
                  onChange={(e) => setRenewExpiry(e.target.value)}
                  className="w-full px-3 py-2 bg-background-200 border border-neutral-200 rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <div className="flex gap-1.5 mt-1">
                  {([7, 30, 90, 365] as const).map((days) => {
                    const pad = (n: number) => String(n).padStart(2, "0");
                    const d = new Date(Date.now() + days * 86_400_000);
                    const val = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
                    return (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setRenewExpiry(val)}
                        className="text-[11px] px-2 py-0.5 rounded-md border border-neutral-200 text-foreground-500 hover:text-primary-600:text-primary-400 hover:border-primary-400 transition-colors"
                      >
                        +{days}d
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-neutral-200">
              <button
                onClick={() => setRenewingPolicy(null)}
                className="px-3 py-1.5 text-sm text-foreground-500 hover:text-foreground border border-neutral-200 rounded-lg hover:bg-background-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRenewFromDashboard}
                disabled={renewSaving || !renewExpiry}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {renewSaving ? (
                  <div className="w-3.5 h-3.5 border border-white/50 border-t-white rounded-full animate-spin" />
                ) : (
                  <RotateCcw className="w-3.5 h-3.5" />
                )}
                Renew &amp; revoke old
              </button>
            </div>
          </div>
        </div>
      )}

      {total === 0 && (
        <button
          onClick={() => router.push("/agents")}
          className="w-full flex items-center justify-between gap-3 bg-gradient-to-r from-primary-50 to-primary-50 border border-primary-300 rounded-lg px-4 py-3 text-primary-700 text-sm hover:bg-primary-100/50:bg-primary-900/30 transition-colors group"
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
          className="relative bg-background-100 rounded-lg border border-neutral-200 p-5 text-left hover:border-primary-400:border-primary-600 transition-all duration-300 group overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-primary-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary-600" />
              </div>
              <p className="text-foreground-500 text-xs font-semibold uppercase tracking-widest">
                Agents
              </p>
            </div>
            <p className="text-4xl font-bold text-foreground mb-1">{total}</p>
            <p className="text-xs text-foreground-400 flex items-center gap-1">
              <span className="inline-block w-2 h-2 rounded-full bg-success-500" />
              {onlineCount} online
            </p>
          </div>
        </button>

        <button
          onClick={() => router.push("/agents")}
          className="relative bg-background-100 rounded-lg border border-neutral-200 p-5 text-left hover:border-success-400:border-success-600 transition-all duration-300 group overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-success-500/5 to-success-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-gradient-to-br from-success-100 to-success-200 rounded-lg flex items-center justify-center">
                <CircleDot className="w-4 h-4 text-success-600" />
              </div>
              <p className="text-foreground-500 text-xs font-semibold uppercase tracking-widest">
                Status
              </p>
            </div>
            <p className="text-4xl font-bold text-success-600 mb-1">
              {onlineCount}/{total}
            </p>
            <p className="text-xs text-foreground-400">
              {total - onlineCount} offline
            </p>
          </div>
        </button>

        <button
          onClick={() => router.push("/inbox")}
          className="relative bg-background-100 rounded-lg border border-neutral-200 p-5 text-left hover:border-warning-400:border-warning-600 transition-all duration-300 group overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-warning-500/5 to-warning-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-gradient-to-br from-warning-100 to-warning-200 rounded-lg flex items-center justify-center">
                <Inbox className="w-4 h-4 text-warning-600" />
              </div>
              <p className="text-foreground-500 text-xs font-semibold uppercase tracking-widest">
                Approvals
              </p>
            </div>
            <p className="text-4xl font-bold text-warning-600 mb-1">
              {pendingApprovals.length}
            </p>
            <p className="text-xs text-foreground-400">
              awaiting your decision
            </p>
          </div>
        </button>

        {isGlobalAdmin && (
          <div className="relative bg-background-100 rounded-lg border border-neutral-200 p-5 overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-gradient-to-br from-danger-100 to-danger-200 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-4 h-4 text-danger-600" />
                </div>
                <p className="text-foreground-500 text-xs font-semibold uppercase tracking-widest">
                  Today
                </p>
              </div>
              <p className="text-4xl font-bold text-danger-600 mb-1">
                ${tokenMetrics.dailyPrice.toFixed(2)}
              </p>
              <p className="text-xs text-foreground-400">
                {totalTokensDaily.toLocaleString()} tokens
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Token metrics */}
      {isGlobalAdmin && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-background-100 rounded-lg border border-neutral-200 p-5 hover:border-primary-400:border-primary-600 transition-colors">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-primary-600" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Daily Usage
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground-500">
                    Input tokens
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {tokenMetrics.dailyPrompt.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 bg-background-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
                    style={{
                      width: `${Math.min(100, (tokenMetrics.dailyPrompt / Math.max(1, totalTokensDaily)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground-500">
                    Output tokens
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {tokenMetrics.dailyCompletion.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 bg-background-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-full"
                    style={{
                      width: `${Math.min(100, (tokenMetrics.dailyCompletion / Math.max(1, totalTokensDaily)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-neutral-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground-500">
                    Avg per agent
                  </span>
                  <span className="text-xs font-semibold text-primary-600">
                    ${avgCostPerAgent}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-background-100 rounded-lg border border-neutral-200 p-5 hover:border-secondary-400:border-secondary-600 transition-colors">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-secondary-100 to-secondary-200 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-secondary-600" />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                Monthly Usage
              </h3>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground-500">
                    Input tokens
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {tokenMetrics.monthlyPrompt.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 bg-background-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-full"
                    style={{
                      width: `${Math.min(100, (tokenMetrics.monthlyPrompt / Math.max(1, totalTokensMonthly)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-foreground-500">
                    Output tokens
                  </span>
                  <span className="text-sm font-semibold text-foreground">
                    {tokenMetrics.monthlyCompletion.toLocaleString()}
                  </span>
                </div>
                <div className="h-1.5 bg-background-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-secondary-500 to-secondary-600 rounded-full"
                    style={{
                      width: `${Math.min(100, (tokenMetrics.monthlyCompletion / Math.max(1, totalTokensMonthly)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
              <div className="pt-2 border-t border-neutral-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground-500">
                    Total this month
                  </span>
                  <span className="text-xs font-semibold text-secondary-600">
                    {totalTokensMonthly.toLocaleString()}
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-neutral-200">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-foreground-500">
                    Projected (end of month)
                  </span>
                  <span className="text-xs font-semibold text-secondary-500">
                    {projectedMonthlyTokens.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Setup banner ──────────────────────────────────────────────────── */}
      {setupBanner && (
        <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-primary-50 to-secondary-50 border border-primary-200 rounded-xl px-4 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shrink-0 shadow shadow-primary-600/30">
              <Shield className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary-700">
                {setupBanner.completedCount > 0
                  ? `Setup in progress — ${setupBanner.completedCount} of 4 steps done`
                  : "Finish setting up VaultysClaw"}
              </p>
              <p className="text-xs text-primary-600/60 truncate">
                {setupBanner.completedCount > 0
                  ? "Pick up where you left off — models, email, users and agents."
                  : "Configure LLM models, email, users, and your first agent."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => router.push("/setup")}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors shadow shadow-primary-600/20"
            >
              {setupBanner.completedCount > 0 ? "Continue" : "Start setup"}
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={dismissSetupBanner}
              title="Dismiss permanently"
              className="p-1.5 text-primary-400 hover:text-primary-700:text-primary-200 rounded-lg hover:bg-primary-100:bg-primary-900/40 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* World map */}
      {mapMarkers.length > 0 && (
        <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-gradient-to-br from-primary-100 to-primary-200 rounded-lg flex items-center justify-center">
                <Globe className="w-3.5 h-3.5 text-primary-600" />
              </div>
              <h2 className="text-sm font-semibold text-foreground">
                Infrastructure Map
              </h2>
              <span className="text-xs text-foreground-500 bg-background-200 rounded-full px-2 py-0.5">
                {mapMarkers.length} located
              </span>
            </div>
            <button
              onClick={() => router.push("/agents?view=map")}
              className="text-xs text-primary-600 hover:underline font-medium"
            >
              Full view
            </button>
          </div>
          <WorldMap markers={mapMarkers} height={320} />
        </div>
      )}

      {/* Inbox section */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending approvals */}
        <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-gradient-to-r from-warning-50/50 to-warning-50/50">
            <div className="flex items-center gap-2">
              <Inbox className="w-4 h-4 text-warning-600" />
              <h2 className="text-sm font-semibold text-foreground">
                Pending Approvals
              </h2>
              {pendingApprovals.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-warning-700 bg-warning-100 rounded-full">
                  {pendingApprovals.length}
                </span>
              )}
            </div>
            <button
              onClick={() => router.push("/inbox")}
              className="text-xs text-warning-600 hover:underline font-medium"
            >
              View all
            </button>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <CheckCircle className="w-8 h-8 text-success-700 mx-auto mb-2 opacity-50" />
              <p className="text-foreground-500 text-sm">
                No pending approvals
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 max-h-[420px] overflow-y-auto">
              {pendingApprovals.map((item) => (
                <div key={item.id} className="p-4 space-y-3">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm text-foreground">
                        {item.workflow_name}
                      </p>
                      <span className="text-[10px] text-foreground-400 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>
                    {item.node_message && (
                      <p className="text-sm text-foreground-700 mt-0.5">
                        {item.node_message}
                      </p>
                    )}
                    <p className="text-xs text-foreground-500 mt-0.5">
                      Step: {item.step_id}
                    </p>
                  </div>

                  {item.step_input && (
                    <pre className="text-xs bg-background-200 text-foreground border border-neutral-200 rounded-lg p-2 overflow-x-auto max-h-20 whitespace-pre-wrap break-words">
                      {item.step_input.slice(0, 200)}
                      {item.step_input.length > 200 ? "…" : ""}
                    </pre>
                  )}

                  <div className="space-y-2">
                    <textarea
                      rows={1}
                      value={comment[item.id] || ""}
                      onChange={(e) =>
                        setComment((c) => ({ ...c, [item.id]: e.target.value }))
                      }
                      placeholder="Comment (optional)…"
                      className="w-full text-xs bg-background-200 text-foreground border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-warning-400 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(item.id)}
                        disabled={acting === item.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-success-600 text-white text-xs rounded-lg hover:bg-success-700 disabled:opacity-50 font-medium"
                      >
                        <CheckCircle size={12} /> Approve
                      </button>
                      <button
                        onClick={() => handleReject(item.id)}
                        disabled={acting === item.id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-danger-600 text-white text-xs rounded-lg hover:bg-danger-700 disabled:opacity-50 font-medium"
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
        <div className="bg-background-100 rounded-xl border border-neutral-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-gradient-to-r from-primary-50/50 to-primary-50/50">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary-500" />
              <h2 className="text-sm font-semibold text-foreground">
                Notifications
              </h2>
              {notifications.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-semibold text-primary-700 bg-primary-100 rounded-full">
                  {notifications.length}
                </span>
              )}
            </div>
            <button
              onClick={() => router.push("/inbox")}
              className="text-xs text-primary-500 hover:underline font-medium"
            >
              View all
            </button>
          </div>

          {notifications.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <Bell className="w-8 h-8 text-neutral-300 mx-auto mb-2 opacity-30" />
              <p className="text-foreground-500 text-sm">
                No new notifications
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-200 max-h-[420px] overflow-y-auto">
              {notifications.map((item) => (
                <div key={item.id} className="flex items-start gap-3 px-5 py-4">
                  <Bell
                    size={14}
                    className="text-primary-500 shrink-0 mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">
                      {item.workflow_name}
                    </p>
                    {item.node_message && (
                      <p className="text-sm text-foreground-700 mt-0.5">
                        {item.node_message}
                      </p>
                    )}
                    {item.step_input && (
                      <p className="text-xs text-foreground-500 mt-0.5 truncate">
                        {item.step_input.slice(0, 100)}
                      </p>
                    )}
                    <p className="text-[11px] text-foreground-400 mt-1">
                      {new Date(item.created_at).toLocaleString()} · Step:{" "}
                      {item.step_id}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDismiss(item.id)}
                    disabled={acting === item.id}
                    className="p-1 hover:bg-background-200 rounded text-foreground-500 hover:text-foreground disabled:opacity-50 shrink-0"
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

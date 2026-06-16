"use client";

import { useCallback, useEffect, useState } from "react";
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
  Globe,
  Bell,
  CheckCircle,
  XCircle,
  X,
  Inbox,
  ShieldAlert,
  RotateCcw,
  Play,
  MessageSquare,
  GitBranch,
  Users,
  BookOpen,
  Network,
  Activity,
  Layers,
  ArrowRight,
  CheckCheck,
  Cpu,
  Mail,
  UserX,
} from "lucide-react";
import { agentsClient, unwrap } from "@/lib/api/ts-rest/client";
import { AgentInfo } from "@/lib/contracts";

/* ─── Helpers ────────────────────────────────────────────────── */

function parseUTC(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : iso + "Z");
}

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

function greeting(name: string | null | undefined): string {
  const hour = new Date().getHours();
  const first = name?.split(" ")[0] ?? "there";
  if (hour < 12) return `Good morning, ${first}`;
  if (hour < 18) return `Good afternoon, ${first}`;
  return `Good evening, ${first}`;
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
        <div className="absolute inset-0 bg-gradient-to-b from-primary-50/80 via-background to-background pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-primary-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-24 left-1/3 w-[320px] h-[320px] bg-secondary-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-16 right-1/3 w-[220px] h-[220px] bg-primary-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="mesh-overlay absolute inset-0 opacity-40 pointer-events-none" />

        <div className="relative z-10 max-w-4xl mx-auto px-6 pt-20 pb-20 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-100 border border-primary-200 rounded-full text-primary-600 text-xs font-medium mb-6 animate-fade-in-up">
            <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse" />
            Powered by VaultysID · Decentralized · Trustless
          </div>

          <h1
            className="text-5xl md:text-6xl font-bold leading-tight mb-5 text-foreground animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            Sovereign AI Agent{" "}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 via-secondary-600 to-primary-600 animate-gradient-shift">
              Orchestration
            </span>
          </h1>

          <p
            className="text-foreground-500 text-lg max-w-2xl mx-auto leading-relaxed mb-10 animate-fade-in-up"
            style={{ animationDelay: "200ms" }}
          >
            Cryptographically secure control plane for distributed AI agents.
            Full audit trail, hardware-backed identities, zero trust required.
          </p>

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
              className="flex gap-4 bg-background-100 border border-neutral-200 rounded-2xl p-6 hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-lg hover:shadow-primary-500/10 hover:-translate-y-1 transition-all duration-300 group animate-fade-in-up"
              style={{ animationDelay: `${200 + i * 100}ms` }}
            >
              <div className="w-10 h-10 bg-primary-100 border border-primary-200 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-primary-200 dark:group-hover:bg-primary-800/60 transition-all duration-300">
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
  runId: string;
  stepId: string;
  workflowId: string;
  workflowName: string;
  nodeMessage: string | null;
  stepInput: string | null;
  mode: "approval" | "notification";
  status: string;
  createdAt: string;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName?: string;
  status: "running" | "completed" | "failed" | "pending";
  startedAt: string;
  completedAt?: string | null;
}

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

/* ─── Quick Action button ─────────────────────────────────────── */

function QuickAction({
  icon: Icon,
  label,
  description,
  onClick,
  accent = "primary",
  badge,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
  accent?: "primary" | "success" | "warning" | "secondary";
  badge?: number;
}) {
  const colors = {
    primary: "bg-primary-100 text-primary-600 border-primary-200 group-hover:bg-primary-200",
    success: "bg-success-100 text-success-600 border-success-200 group-hover:bg-success-200",
    warning: "bg-warning-100 text-warning-600 border-warning-200 group-hover:bg-warning-200",
    secondary: "bg-secondary-100 text-secondary-600 border-secondary-200 group-hover:bg-secondary-200",
  };

  return (
    <button
      onClick={onClick}
      className="relative flex items-start gap-3 p-4 bg-background-100 border border-neutral-200 rounded-xl text-left hover:border-primary-300 dark:hover:border-primary-700 hover:shadow-sm transition-all duration-200 group w-full"
    >
      <div
        className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 transition-colors duration-200 ${colors[accent]}`}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground leading-tight">{label}</p>
        <p className="text-xs text-foreground-400 mt-0.5 leading-tight">{description}</p>
      </div>
      {badge !== undefined && badge > 0 && (
        <span className="absolute top-2 right-2 inline-flex items-center justify-center min-w-[18px] h-[18px] text-[10px] font-bold text-white bg-warning-500 rounded-full px-1">
          {badge}
        </span>
      )}
      <ArrowRight className="w-3.5 h-3.5 text-foreground-300 group-hover:text-primary-500 shrink-0 mt-0.5 transition-colors duration-200" />
    </button>
  );
}

/* ─── Agent pill ──────────────────────────────────────────────── */

function AgentPill({ agent, onClick }: { agent: AgentInfo; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-3 py-2 bg-background-100 border border-neutral-200 rounded-lg hover:border-primary-300 dark:hover:border-primary-700 hover:bg-background-200 transition-all duration-200 w-full text-left group"
    >
      <span
        className={`w-2 h-2 rounded-full shrink-0 ${agent.online ? "bg-success-500" : "bg-neutral-300"}`}
      />
      <span className="text-sm text-foreground font-medium truncate flex-1">
        {agent.name}
      </span>
      {agent.online && (
        <span className="text-[10px] text-success-600 font-medium shrink-0">online</span>
      )}
      <ChevronRight className="w-3 h-3 text-foreground-300 group-hover:text-primary-500 shrink-0 transition-colors" />
    </button>
  );
}

/* ─── Run status badge ───────────────────────────────────────── */

function RunStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    running: { cls: "bg-primary-100 text-primary-700", label: "Running" },
    completed: { cls: "bg-success-100 text-success-700", label: "Done" },
    failed: { cls: "bg-danger-100 text-danger-700", label: "Failed" },
    pending: { cls: "bg-warning-100 text-warning-700", label: "Pending" },
  };
  const { cls, label } = map[status] ?? { cls: "bg-background-200 text-foreground-500", label: status };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  );
}

/* ─── No-realm gate screen ────────────────────────────────────── */

interface AdminContact {
  name: string | null;
  email: string | null;
}

function NoRealmScreen() {
  const [admins, setAdmins] = useState<AdminContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admins")
      .then((r) => (r.ok ? r.json() : { admins: [] }))
      .then((d: { admins?: AdminContact[] }) => setAdmins(d.admins ?? []))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-8rem)] p-6">
      <div className="w-full max-w-3xl text-center space-y-6">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-2xl bg-warning-100 border border-warning-200 flex items-center justify-center">
            <UserX className="w-8 h-8 text-warning-600" />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-foreground">
            You're not part of a workspace yet
          </h1>
          <p className="text-foreground-500 text-sm leading-relaxed">
            Your account exists but hasn't been assigned to any realm. An
            administrator needs to add you to a workspace before you can use
            VaultysClaw.
          </p>
        </div>

        {/* Admin contacts */}
        <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden text-left">
          <div className="px-4 py-3 border-b border-neutral-200 bg-background-200/50">
            <p className="text-xs font-semibold text-foreground-500 uppercase tracking-widest">
              Contact an administrator
            </p>
          </div>

          {loading ? (
            <div className="px-4 py-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-neutral-200 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : admins.length === 0 ? (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-foreground-400">
                No administrators found. Please contact your IT team directly.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-neutral-100">
              {admins.map((admin, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center shrink-0 text-primary-600 font-semibold text-sm">
                    {admin.name
                      ? admin.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()
                      : "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {admin.name ?? "Administrator"}
                    </p>
                    {admin.email && (
                      <p className="text-xs text-foreground-400 truncate">
                        {admin.email}
                      </p>
                    )}
                  </div>
                  {admin.email && (
                    <a
                      href={`mailto:${admin.email}?subject=VaultysClaw%20workspace%20access`}
                      className="shrink-0 flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500 border border-primary-200 hover:border-primary-400 px-2.5 py-1 rounded-lg transition-colors"
                    >
                      <Mail className="w-3 h-3" /> Email
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <p className="text-xs text-foreground-400">
          Once an administrator adds you to a workspace, sign out and sign back
          in to pick up the new access.
        </p>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={() => import("next-auth/react").then((m) => m.signOut())}
            className="text-sm font-medium text-primary-600 hover:underline"
          >
            Sign out &amp; sign back in
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Dashboard component ─────────────────────────────────────── */

function Dashboard() {
  const router = useRouter();
  const { data: session } = useSession();
  const { isGlobalAdmin } = useRole();
  const {
    agents: agentsState,
    registrations: pendingRegs,
    connected: wsConnected,
  } = useAdminWS();

  // null = loading, [] = loaded but empty (no realms)
  const [userRealmCount, setUserRealmCount] = useState<number | null>(null);

  const [realmAgents, setRealmAgents] = useState<AgentInfo[] | null>(null);
  useEffect(() => {
    if (isGlobalAdmin) {
      setUserRealmCount(1); // admins have implicit access everywhere
      return;
    }
    // Check realm membership and fetch agents in parallel
    Promise.all([
      fetch("/api/realms")
        .then((r) => (r.ok ? r.json() : { realms: [] }))
        .then((d: { realms?: unknown[] }) => d.realms?.length ?? 0),
      agentsClient
        .search()
        .then((r) => unwrap(r))
        .then((page) => page.items ?? [])
        .catch(() => [] as AgentInfo[]),
    ])
      .then(([count, items]) => {
        setUserRealmCount(count);
        setRealmAgents(items);
      })
      .catch(() => {
        setUserRealmCount(0);
        setRealmAgents([]);
      });
  }, [isGlobalAdmin]);

  const agents = isGlobalAdmin ? agentsState.agents : (realmAgents ?? []);
  const total = isGlobalAdmin ? agentsState.total : (realmAgents?.length ?? 0);
  const onlineCount = isGlobalAdmin
    ? agentsState.online
    : (realmAgents?.filter((a) => a.online).length ?? 0);

  // ── Setup banner ─────────────────────────────────────────────
  const [setupBanner, setSetupBanner] = useState<{ completedCount: number } | null>(null);

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

  // ── Approvals ─────────────────────────────────────────────────
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

  // ── Expired policies ──────────────────────────────────────────
  const [expiredPolicies, setExpiredPolicies] = useState<ExpiredPolicy[]>([]);
  const [renewingPolicy, setRenewingPolicy] = useState<ExpiredPolicy | null>(null);
  const [renewExpiry, setRenewExpiry] = useState("");
  const [renewSaving, setRenewSaving] = useState(false);

  const fetchExpiredPolicies = () => {
    if (!isGlobalAdmin) return;
    fetch("/api/policies?expiredOnly=true")
      .then((r) => (r.ok ? r.json() : { policies: [] }))
      .then((d: { policies?: ExpiredPolicy[] }) => setExpiredPolicies(d.policies ?? []))
      .catch(() => { });
  };

  useEffect(() => {
    fetchExpiredPolicies();
    const id = setInterval(fetchExpiredPolicies, 60_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobalAdmin]);

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
          expiresAt: renewExpiry ? new Date(renewExpiry).toISOString() : undefined,
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

  // ── Recent workflow runs ──────────────────────────────────────
  const [recentRuns, setRecentRuns] = useState<WorkflowRun[]>([]);

  const fetchRecentRuns = useCallback(() => {
    fetch("/api/workflow-runs?pageSize=6&sortDir=desc")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { runs?: WorkflowRun[] }) => setRecentRuns(d.runs ?? []))
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetchRecentRuns();
    const id = setInterval(fetchRecentRuns, 20_000);
    return () => clearInterval(id);
  }, [fetchRecentRuns]);

  // ── Actions ───────────────────────────────────────────────────
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

  const queueCount = pendingApprovals.length + (isGlobalAdmin ? pendingRegs.length : 0);
  const onlineAgents = agents.filter((a) => a.online);

  /* ─── render ─────────────────────────────────────────────────── */

  // Non-admin with no realm membership → show contact screen
  if (!isGlobalAdmin && userRealmCount === 0) {
    return <NoRealmScreen />;
  }

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
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
            {total > 0 && (
              <span className="ml-2 text-foreground-500">
                · {onlineCount}/{total} agent{total !== 1 ? "s" : ""} online
              </span>
            )}
            {queueCount > 0 && (
              <span className="ml-2 text-warning-600 font-medium">
                · {queueCount} item{queueCount !== 1 ? "s" : ""} need{queueCount === 1 ? "s" : ""} your attention
              </span>
            )}
          </p>
        </div>
        <span
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border shrink-0 ${wsConnected
            ? "bg-success-100 border-success-300 text-success-700"
            : "bg-warning-100 border-warning-300 text-warning-700"
            }`}
        >
          {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {wsConnected ? "Live" : "Connecting…"}
        </span>
      </div>

      {/* ── Alert banners ──────────────────────────────────────── */}
      {(!wsConnected ||
        (isGlobalAdmin && pendingRegs.length > 0) ||
        (isGlobalAdmin && expiredPolicies.length > 0) ||
        setupBanner) && (
          <div className="space-y-2">
            {!wsConnected && (
              <div className="flex items-center gap-2 bg-warning-50 border border-warning-300 rounded-lg px-4 py-2.5 text-warning-700 text-sm">
                <WifiOff className="w-4 h-4 shrink-0" />
                WebSocket connection is being restored. Some data may be stale.
              </div>
            )}

            {isGlobalAdmin && pendingRegs.length > 0 && (
              <button
                onClick={() => router.push("/registrations")}
                className="w-full flex items-center justify-between gap-3 bg-warning-50 border border-warning-300 rounded-lg px-4 py-2.5 text-warning-700 text-sm hover:bg-warning-100/50 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 shrink-0" />
                  <strong>{pendingRegs.length}</strong> agent registration
                  {pendingRegs.length !== 1 ? "s" : ""} pending approval
                </div>
                <ChevronRight className="w-4 h-4 shrink-0 group-hover:translate-x-0.5 transition-transform" />
              </button>
            )}

            {isGlobalAdmin && expiredPolicies.length > 0 && (
              <div className="bg-danger-50 border border-danger-300 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-danger-200">
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
                  {expiredPolicies.slice(0, 3).map((p) => {
                    const agentName = agents.find((a) => a.did === p.agentDid)?.name;
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
                        <p className="text-xs text-danger-800 truncate">
                          {agentName ?? (p.agentDid ? `${p.agentDid.slice(0, 24)}…` : "Global")}
                          <span className="text-danger-500 ml-1.5">· {p.capabilities.length} cap{p.capabilities.length !== 1 ? "s" : ""}</span>
                        </p>
                        <button
                          onClick={() => openRenewFromDashboard(p)}
                          className="flex-shrink-0 flex items-center gap-1 text-xs font-medium text-danger-700 hover:text-primary-600 border border-danger-300 hover:border-primary-400 px-2 py-0.5 rounded transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" /> Renew
                        </button>
                      </div>
                    );
                  })}
                  {expiredPolicies.length > 3 && (
                    <p className="px-4 py-1.5 text-xs text-danger-600/70">
                      +{expiredPolicies.length - 3} more —{" "}
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

            {setupBanner && (
              <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-primary-50 to-secondary-50 border border-primary-200 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center shrink-0 shadow shadow-primary-600/30">
                    <Shield className="w-4 h-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary-700">
                      {setupBanner.completedCount > 0
                        ? `Setup in progress — ${setupBanner.completedCount} of 4 steps done`
                        : "Finish setting up VaultysClaw"}
                    </p>
                    <p className="text-xs text-primary-600/60 truncate">
                      Configure LLM models, email, users, and your first agent.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => router.push("/setup")}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    {setupBanner.completedCount > 0 ? "Continue" : "Start setup"}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={dismissSetupBanner}
                    className="p-1.5 text-primary-400 hover:text-primary-700 rounded-lg hover:bg-primary-100 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      {/* ── Main 3-column grid ─────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Left: Quick Actions ─────────────────────────────── */}
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
              badge={pendingApprovals.length + notifications.length}
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
                  badge={expiredPolicies.length}
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

          {/* ── Agent Pulse ─────────────────────────────────────── */}
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

        {/* ── Center: My Queue ────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5">
              My Queue
            </h2>
            {(pendingApprovals.length > 0 || notifications.length > 0) && (
              <button
                onClick={() => router.push("/inbox")}
                className="text-xs text-primary-600 hover:underline"
              >
                View all
              </button>
            )}
          </div>

          {/* Pending approvals */}
          <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-gradient-to-r from-warning-50/60 to-transparent">
              <div className="flex items-center gap-2">
                <Inbox className="w-4 h-4 text-warning-600" />
                <span className="text-sm font-semibold text-foreground">Pending Approvals</span>
                {pendingApprovals.length > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-warning-700 bg-warning-100 rounded-full">
                    {pendingApprovals.length}
                  </span>
                )}
              </div>
            </div>

            {pendingApprovals.length === 0 ? (
              <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
                <CheckCheck className="w-7 h-7 text-success-400 opacity-60" />
                <p className="text-sm text-foreground-400">You're all caught up</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 max-h-[360px] overflow-y-auto">
                {pendingApprovals.map((item) => (
                  <div key={item.id} className="p-4 space-y-2.5">
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm text-foreground leading-tight">
                          {item.workflowName}
                        </p>
                        <span className="text-[10px] text-foreground-400 whitespace-nowrap">
                          {timeAgo(item.createdAt)}
                        </span>
                      </div>
                      {item.nodeMessage && (
                        <p className="text-xs text-foreground-600 mt-1 leading-relaxed">
                          {item.nodeMessage}
                        </p>
                      )}
                      <p className="text-[11px] text-foreground-400 mt-0.5">
                        Step: {item.stepId}
                      </p>
                    </div>

                    {item.stepInput && (
                      <pre className="text-[11px] bg-background-200 text-foreground border border-neutral-200 rounded-lg p-2 overflow-x-auto max-h-16 whitespace-pre-wrap break-words">
                        {item.stepInput.slice(0, 160)}
                        {item.stepInput.length > 160 ? "…" : ""}
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
                        className="w-full text-xs bg-background-200 text-foreground border border-neutral-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-warning-400 resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(item.id)}
                          disabled={acting === item.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-success-600 text-white text-xs rounded-lg hover:bg-success-700 disabled:opacity-50 font-medium transition-colors"
                        >
                          <CheckCircle size={12} /> Approve
                        </button>
                        <button
                          onClick={() => handleReject(item.id)}
                          disabled={acting === item.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-danger-600 text-white text-xs rounded-lg hover:bg-danger-700 disabled:opacity-50 font-medium transition-colors"
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

          {/* Notifications */}
          <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-gradient-to-r from-primary-50/40 to-transparent">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-primary-500" />
                <span className="text-sm font-semibold text-foreground">Notifications</span>
                {notifications.length > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-primary-700 bg-primary-100 rounded-full">
                    {notifications.length}
                  </span>
                )}
              </div>
            </div>

            {notifications.length === 0 ? (
              <div className="px-4 py-6 flex flex-col items-center gap-2 text-center">
                <Bell className="w-6 h-6 text-foreground-200" />
                <p className="text-xs text-foreground-400">No new notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 max-h-[280px] overflow-y-auto">
                {notifications.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                    <Bell size={13} className="text-primary-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground leading-tight">
                        {item.workflowName}
                      </p>
                      {item.nodeMessage && (
                        <p className="text-xs text-foreground-600 mt-0.5">
                          {item.nodeMessage}
                        </p>
                      )}
                      <p className="text-[10px] text-foreground-400 mt-0.5">
                        {timeAgo(item.createdAt)} · {item.stepId}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDismiss(item.id)}
                      disabled={acting === item.id}
                      className="p-1 hover:bg-background-200 rounded text-foreground-400 hover:text-foreground disabled:opacity-50 shrink-0 transition-colors"
                      title="Dismiss"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Activity + Navigation ─────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5">
            Recent Runs
          </h2>

          <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-foreground-400" />
                <span className="text-sm font-semibold text-foreground">Workflow Runs</span>
              </div>
              <button
                onClick={() => router.push("/workflows")}
                className="text-xs text-primary-600 hover:underline"
              >
                View all
              </button>
            </div>

            {recentRuns.length === 0 ? (
              <div className="px-4 py-8 flex flex-col items-center gap-2 text-center">
                <Layers className="w-6 h-6 text-foreground-200" />
                <p className="text-xs text-foreground-400">No workflow runs yet</p>
                <button
                  onClick={() => router.push("/workflows")}
                  className="text-xs text-primary-600 hover:underline mt-1"
                >
                  Start your first workflow →
                </button>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {recentRuns.map((run) => (
                  <button
                    key={run.id}
                    onClick={() => router.push(`/workflows/runs/${run.id}`)}
                    className="flex items-center gap-3 px-4 py-3 w-full text-left hover:bg-background-200 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground font-medium truncate leading-tight">
                        {run.workflowName ?? run.workflowId}
                      </p>
                      <p className="text-[10px] text-foreground-400 mt-0.5">
                        {timeAgo(run.startedAt)}
                      </p>
                    </div>
                    <RunStatusBadge status={run.status} />
                    <ChevronRight className="w-3 h-3 text-foreground-300 group-hover:text-primary-500 shrink-0 transition-colors" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Explore ───────────────────────────────────────────── */}
          <h2 className="text-xs font-semibold text-foreground-400 uppercase tracking-widest px-0.5 pt-2">
            Explore
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: Bot, label: "Agents", path: "/agents" },
              { icon: GitBranch, label: "Workflows", path: "/workflows" },
              { icon: Cpu, label: "Models", path: "/models" },
              { icon: Layers, label: "Skills", path: "/skills" },
              { icon: Globe, label: "Realms", path: "/realms" },
              { icon: Network, label: "Graph", path: "/graph" },
            ].map(({ icon: Icon, label, path }) => (
              <button
                key={path}
                onClick={() => router.push(path)}
                className="flex items-center gap-2 px-3 py-2.5 bg-background-100 border border-neutral-200 rounded-lg hover:border-primary-300 dark:hover:border-primary-700 hover:bg-background-200 transition-all duration-200 group text-left"
              >
                <Icon className="w-4 h-4 text-foreground-400 group-hover:text-primary-500 transition-colors shrink-0" />
                <span className="text-sm text-foreground-600 group-hover:text-foreground font-medium transition-colors">
                  {label}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Renew policy modal ─────────────────────────────────── */}
      {renewingPolicy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <RotateCcw className="w-4 h-4 text-primary-500" /> Renew expired policy
              </span>
              <button
                onClick={() => setRenewingPolicy(null)}
                className="text-foreground-400 hover:text-foreground p-1 rounded-lg hover:bg-background-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="bg-background-200 border border-neutral-200 rounded-xl p-3 space-y-1">
                <p className="text-xs font-medium text-foreground">
                  {agents.find((a) => a.did === renewingPolicy.agentDid)?.name ??
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
                        className="text-[11px] px-2 py-0.5 rounded-md border border-neutral-200 text-foreground-500 hover:text-primary-600 hover:border-primary-400 transition-colors"
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
    </div>
  );
}

/* ─── Page entry point ────────────────────────────────────────── */

export default function Home() {
  const { status } = useSession();

  if (status === "unauthenticated") return <LandingPage />;
  if (status === "loading") return null;

  return <Dashboard />;
}

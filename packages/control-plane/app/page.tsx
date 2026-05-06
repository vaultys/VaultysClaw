"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useAdminWS } from "../hooks/useAdminWS";
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
  Circle,
} from "lucide-react";

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

function Dashboard() {
  const router = useRouter();
  const { agents: agentsState, registrations: pendingRegs, connected: wsConnected } = useAdminWS();

  const agents = agentsState.agents;
  const total = agentsState.total;
  const onlineCount = agentsState.online;

  const [users, setUsers] = useState<{ did: string; name: string | null; email: string | null; isOwner: boolean }[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);

  // Load user count once
  if (!usersLoaded) {
    setUsersLoaded(true);
    fetch("/api/users")
      .then((r) => r.json())
      .then((d: { users: { did: string; name: string | null; email: string | null; isOwner: boolean }[] }) => setUsers(d.users ?? []))
      .catch(() => { });
  }

  const onlineAgents = agents.filter((a) => a.online);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Page title */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-vc-text">Overview</h1>
        <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border ${wsConnected
          ? "bg-green-100 dark:bg-green-900/40 border-green-300 dark:border-green-700/50 text-green-700 dark:text-green-400"
          : "bg-vc-raised border-vc-border text-vc-subtle"
          }`}>
          {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {wsConnected ? "Live" : "Connecting…"}
        </span>
      </div>

      {/* WS warning */}
      {!wsConnected && (
        <div className="flex items-center gap-2 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-300 dark:border-yellow-700/50 rounded-xl px-4 py-3 text-yellow-700 dark:text-yellow-300 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          Connecting to WebSocket server…
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          onClick={() => router.push("/agents")}
          className="bg-vc-surface rounded-xl border border-vc-border p-5 text-left hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors group"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg flex items-center justify-center">
              <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <p className="text-vc-muted text-xs font-medium uppercase tracking-wider">Agents</p>
          </div>
          <p className="text-3xl font-bold text-vc-text">{total}</p>
          <p className="text-xs text-vc-subtle mt-1">View all →</p>
        </button>

        <div className="bg-vc-surface rounded-xl border border-vc-border p-5">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center">
              <CircleDot className="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <p className="text-vc-muted text-xs font-medium uppercase tracking-wider">Online</p>
          </div>
          <p className="text-3xl font-bold text-green-600 dark:text-green-400">{onlineCount}</p>
          <p className="text-xs text-vc-subtle mt-1">{total - onlineCount} offline</p>
        </div>

        <button
          onClick={() => router.push("/users")}
          className="bg-vc-surface rounded-xl border border-vc-border p-5 text-left hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-violet-100 dark:bg-violet-900/40 rounded-lg flex items-center justify-center">
              <Shield className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            </div>
            <p className="text-vc-muted text-xs font-medium uppercase tracking-wider">Users</p>
          </div>
          <p className="text-3xl font-bold text-vc-text">{users.length}</p>
          <p className="text-xs text-vc-subtle mt-1">Manage →</p>
        </button>

        <button
          onClick={() => router.push("/registrations")}
          className="bg-vc-surface rounded-xl border border-vc-border p-5 text-left hover:border-yellow-300 dark:hover:border-yellow-700 transition-colors group"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 bg-yellow-100 dark:bg-yellow-900/40 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
            </div>
            <p className="text-vc-muted text-xs font-medium uppercase tracking-wider">Pending</p>
          </div>
          <p className="text-3xl font-bold text-vc-text">{pendingRegs.length}</p>
          <p className="text-xs text-vc-subtle mt-1">{pendingRegs.length > 0 ? "Review →" : "Registrations"}</p>
        </button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Online agents */}
        <div className="bg-vc-surface rounded-xl border border-vc-border overflow-hidden">
          <div className="px-5 py-4 border-b border-vc-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-vc-muted" />
              <h2 className="text-sm font-semibold text-vc-text">Online Agents</h2>
            </div>
            <button onClick={() => router.push("/agents")} className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline">
              View all ({total})
            </button>
          </div>
          {onlineAgents.length > 0 ? (
            <div className="divide-y divide-vc-border">
              {onlineAgents.slice(0, 6).map((agent) => (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-vc-raised/40 cursor-pointer transition-colors"
                  onClick={() => router.push(`/agents/${encodeURIComponent(agent.id)}`)}
                >
                  <div className="w-2 h-2 rounded-full bg-green-500 dark:bg-green-400 shrink-0" />
                  <p className="font-medium text-vc-text text-sm flex-1 truncate">{agent.name}</p>
                  <div className="flex gap-1 shrink-0">
                    {agent.capabilities.slice(0, 2).map((cap) => (
                      <span key={cap} className="bg-vc-raised border border-vc-ring px-2 py-0.5 rounded text-xs text-vc-text-2">
                        {cap}
                      </span>
                    ))}
                    {agent.capabilities.length > 2 && (
                      <span className="text-xs text-vc-subtle">+{agent.capabilities.length - 2}</span>
                    )}
                  </div>
                  <span className="text-xs text-vc-subtle shrink-0">{timeAgo(agent.lastHeartbeat)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <Circle className="w-8 h-8 text-vc-ring mx-auto mb-2" />
              <p className="text-vc-muted text-sm">No agents online</p>
            </div>
          )}
        </div>

        {/* Users overview */}
        <div className="bg-vc-surface rounded-xl border border-vc-border overflow-hidden">
          <div className="px-5 py-4 border-b border-vc-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-vc-muted" />
              <h2 className="text-sm font-semibold text-vc-text">Users</h2>
            </div>
            <button onClick={() => router.push("/users")} className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline">
              Manage
            </button>
          </div>
          {users.length > 0 ? (
            <div className="divide-y divide-vc-border">
              {users.slice(0, 6).map((u) => {
                const initials = u.name
                  ? u.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
                  : u.did.slice(-2).toUpperCase();
                return (
                  <div
                    key={u.did}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-vc-raised/40 cursor-pointer transition-colors"
                    onClick={() => router.push("/users")}
                  >
                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 border border-indigo-200 dark:border-indigo-700/50 flex items-center justify-center shrink-0">
                      <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">{initials}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-vc-text text-sm truncate">
                        {u.name ?? <span className="text-vc-subtle italic">Unnamed</span>}
                      </p>
                      <p className="text-xs text-vc-subtle truncate">{u.email ?? shortDid(u.did)}</p>
                    </div>
                    {u.isOwner && (
                      <span className="text-[10px] font-bold bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-800 px-1.5 py-0.5 rounded-full shrink-0">
                        Owner
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <Shield className="w-8 h-8 text-vc-ring mx-auto mb-2" />
              <p className="text-vc-muted text-sm">No users yet</p>
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

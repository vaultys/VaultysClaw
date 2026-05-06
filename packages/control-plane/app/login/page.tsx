import Connect from "@/components/signin/Connect";
import {
  Shield,
  ShieldCheck,
  Bot,
  Fingerprint,
  CheckCircle,
  XCircle,
  Cpu,
  Radio,
  GitBranch,
} from "lucide-react";

export default function LoginPage() {
  return (
    <div className="h-screen bg-vc-bg text-vc-text flex overflow-hidden">
      {/* ── Left panel — architecture marketing ───────────────── */}
      <div className="hidden md:flex flex-1 flex-col p-10 relative overflow-y-auto overflow-x-hidden bg-gradient-to-br from-indigo-50 via-white to-violet-50 dark:from-gray-950 dark:via-indigo-950 dark:to-gray-950 border-r border-vc-border/60">
        <div className="absolute inset-0 mesh-overlay" />

        <div className="relative z-10 flex flex-col gap-7">
          {/* Brand + badge */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/30">
                🦞
              </div>
              <span className="text-xl font-bold tracking-tight text-vc-text">VaultysClaw</span>
            </div>
            <div className="flex items-center gap-1.5 bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700/50 rounded-full px-3 py-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">Secure by design</span>
            </div>
          </div>

          {/* Headline */}
          <div>
            <h1 className="text-3xl font-bold leading-tight mb-2 text-vc-text">
              Sovereign AI Agent{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400">
                Orchestration
              </span>
            </h1>
            <p className="text-vc-muted text-sm leading-relaxed">
              Cryptographically verifiable control plane. No API keys. No polling. No implicit trust.
            </p>
          </div>

          {/* Architecture diagram */}
          <div className="flex flex-col items-center">
            {/* Identity layer */}
            <div className="w-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-800/40 border border-indigo-200 dark:border-indigo-600/40 rounded-xl flex items-center justify-center shrink-0">
                  <Fingerprint className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-vc-text">VaultysID Identity</p>
                    <span className="text-[10px] font-bold bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-700/50 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      PQC Ready
                    </span>
                  </div>
                  <p className="text-xs text-vc-muted truncate">Self-sovereign · Hardware-backed</p>
                </div>
              </div>
            </div>

            {/* Connector: signed WebSocket */}
            <div className="flex flex-col items-center py-0.5">
              <div className="w-px h-3 bg-indigo-300 dark:bg-indigo-700" />
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-2.5 py-1 rounded-full">
                <Radio className="w-3 h-3" />
                signed WebSocket connection
              </div>
              <div className="w-px h-3 bg-indigo-300 dark:bg-indigo-700" />
            </div>

            {/* Control plane */}
            <div className="w-full bg-indigo-600/10 dark:bg-indigo-500/15 border border-indigo-300 dark:border-indigo-500/50 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow shadow-indigo-600/30 shrink-0">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-vc-text">VaultysClaw Control Plane</p>
                  <p className="text-xs text-vc-muted">Policy enforcement · Immutable audit trail · Intent routing</p>
                </div>
              </div>
            </div>

            {/* Connector: delegation certs */}
            <div className="flex flex-col items-center py-0.5">
              <div className="w-px h-3 bg-indigo-300 dark:bg-indigo-700" />
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-2.5 py-1 rounded-full">
                <GitBranch className="w-3 h-3" />
                signed delegation certificates
              </div>
              <div className="w-px h-3 bg-indigo-300 dark:bg-indigo-700" />
            </div>

            {/* Agents layer */}
            <div className="w-full grid grid-cols-3 gap-2">
              {(["Agent A", "Agent B", "Agent C"] as const).map((agent) => (
                <div
                  key={agent}
                  className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-xl p-3 flex flex-col items-center gap-1.5"
                >
                  <Bot className="w-5 h-5 text-vc-muted" />
                  <p className="text-xs text-vc-muted font-medium">{agent}</p>
                </div>
              ))}
            </div>
          </div>

          {/* vs Other tools comparison */}
          <div className="bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-black/10 dark:divide-white/10">
              <div className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-vc-subtle mb-3">Other tools</p>
                {[
                  "API key auth",
                  "HTTP polling",
                  "Centralized trust",
                  "No identity proof",
                  "Quantum-vulnerable",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-1.5 mb-2 last:mb-0">
                    <XCircle className="w-3.5 h-3.5 text-red-400 dark:text-red-500 shrink-0" />
                    <span className="text-xs text-vc-muted">{item}</span>
                  </div>
                ))}
              </div>
              <div className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-3">VaultysClaw</p>
                {[
                  "Cryptographic identity",
                  "WebSocket push",
                  "Zero-trust, verifiable",
                  "Signed delegation certs",
                  "PQC ready (ML-DSA)",
                ].map((item) => (
                  <div key={item} className="flex items-center gap-1.5 mb-2 last:mb-0">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                    <span className="text-xs text-vc-text">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="text-xs text-vc-subtle">
            © {new Date().getFullYear()} VaultysClaw · Powered by VaultysID
          </p>
        </div>
      </div>

      {/* ── Right panel — auth form ───────────────────────────── */}
      <div className="w-full md:w-[440px] lg:w-[480px] flex flex-col items-center justify-center bg-vc-bg border-l border-vc-border/60 p-6 shrink-0">
        {/* Mobile brand (only shows below md) */}
        <div className="flex md:hidden items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
            🦞
          </div>
          <span className="text-lg font-bold">VaultysClaw</span>
        </div>

        <Connect embedded />
      </div>
    </div>
  );
}


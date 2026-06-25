"use client";

import { useRouter } from "next/navigation";
import { Bot, ChevronRight, Lock, Shield, Zap } from "lucide-react";

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

const STATS = [
  { value: "< 100ms", label: "Intent delivery" },
  { value: "10K+", label: "Concurrent agents" },
  { value: "Ed25519", label: "Signatures" },
  { value: "Zero", label: "Trusted third parties" },
];

export function LandingPage() {
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
          {STATS.map(({ value, label }, i) => (
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
              className="flex gap-4 bg-background-100 border border-neutral-200 rounded-2xl p-6 hover:border-primary-300 hover:shadow-lg hover:shadow-primary-500/10 hover:-translate-y-1 transition-all duration-300 group animate-fade-in-up"
              style={{ animationDelay: `${200 + i * 100}ms` }}
            >
              <div className="w-10 h-10 bg-primary-100 border border-primary-200 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:bg-primary-200 transition-all duration-300">
                <Icon className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1.5">{title}</h3>
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

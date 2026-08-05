import Link from "next/link";
import { ShieldCheck, Users, ScrollText, Webhook, ChevronRight } from "lucide-react";

const STATS: { headline: string; caption: string }[] = [
  { headline: "Zero", caption: "Passwords, ever" },
  { headline: "Ed25519", caption: "Certificate signatures" },
  { headline: "One", caption: "Ledger for every grant" },
  { headline: "Full", caption: "Audit trail, always on" },
];

const FEATURES: { icon: typeof ShieldCheck; title: string; description: string }[] = [
  {
    icon: Users,
    title: "One Actor ledger",
    description:
      "Humans, agents, sensors, and devices all live in the same ledger — no separate role table, no parallel identity system to keep in sync.",
  },
  {
    icon: ShieldCheck,
    title: "Signed capability certificates",
    description:
      "Every grant is a cryptographically signed certificate, independently verifiable at any time — not a database flag anyone could quietly flip.",
  },
  {
    icon: ScrollText,
    title: "Append-only audit trail",
    description:
      "Every admin action and lifecycle event lands in a live-reverified, append-only log — see exactly who did what, and when, forever.",
  },
  {
    icon: Webhook,
    title: "Webhooks & notification channels",
    description:
      "Signed HTTP webhooks and Apprise-powered alerts keep your own systems and your team in sync with the ledger in real time.",
  },
];

function PrimaryButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="group relative inline-flex items-center gap-1.5 overflow-hidden rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-primary-600/20 transition-colors hover:bg-primary-500"
    >
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
      <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
    </Link>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-20 border-b border-neutral-200/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-600 text-white">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold text-foreground">VaultysClaw</span>
          </div>
          <Link
            href="/login"
            className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-500"
          >
            Sign in <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary-50/80 via-background to-background" />
        <div className="pointer-events-none absolute left-1/2 top-[-120px] h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-primary-400/10 blur-3xl" />
        <div className="pointer-events-none absolute right-[-160px] top-40 h-[320px] w-[420px] rounded-full bg-secondary-400/10 blur-3xl" />
        <div className="mesh-overlay pointer-events-none absolute inset-0 opacity-40 [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,black,transparent)]" />

        <div className="relative mx-auto max-w-4xl px-6 py-24 text-center sm:py-32">
          <div
            className="animate-fade-in-up mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-100 px-3 py-1 text-xs font-medium text-primary-600"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary-500" />
            Powered by VaultysID · Decentralized · Certificate-backed
          </div>
          <h1
            className="animate-fade-in-up text-5xl font-bold tracking-tight text-foreground sm:text-6xl"
            style={{ animationDelay: "100ms" }}
          >
            A sovereign control plane{" "}
            <span className="animate-gradient-shift bg-gradient-to-r from-primary-600 via-secondary-600 to-primary-600 bg-clip-text text-transparent">
              for AI agents
            </span>
          </h1>
          <p
            className="animate-fade-in-up mx-auto mt-6 max-w-2xl text-lg text-foreground-500"
            style={{ animationDelay: "200ms" }}
          >
            One signed ledger for every human, agent, sensor, and device. No passwords, no parallel
            role tables — just cryptographic identity and capability certificates, all the way down.
          </p>
          <div
            className="animate-fade-in-up mt-10 flex items-center justify-center gap-3"
            style={{ animationDelay: "300ms" }}
          >
            <PrimaryButton href="/login">
              Get started <ChevronRight className="h-3.5 w-3.5" />
            </PrimaryButton>
            <a
              href="#features"
              className="rounded-xl border border-neutral-200 bg-background-100 px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-background-200"
            >
              See how it works
            </a>
          </div>
        </div>
      </section>

      <section className="border-y border-neutral-200/60 bg-background-100">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.caption} className="text-center">
              <div className="text-2xl font-bold text-foreground sm:text-3xl">{stat.headline}</div>
              <div className="mt-1 text-xs text-foreground-500">{stat.caption}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-5xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold text-foreground">Built for security-first teams</h2>
          <p className="mt-3 text-foreground-500">
            Every component is designed around the principle that no party should be implicitly
            trusted — including the control plane itself.
          </p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group rounded-2xl border border-neutral-200/60 bg-background-100 p-6 transition-all hover:-translate-y-1 hover:border-primary-300 hover:shadow-lg"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600 transition-colors group-hover:bg-primary-600 group-hover:text-white">
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-1.5 text-sm text-foreground-500">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-24">
        <div className="rounded-3xl border border-primary-200 bg-primary-50 p-10 text-center sm:p-14">
          <h2 className="text-2xl font-bold text-foreground sm:text-3xl">Ready to take control?</h2>
          <p className="mx-auto mt-3 max-w-md text-foreground-500">
            Sign in with your VaultysID to access the console — no account to create, nothing to
            remember.
          </p>
          <div className="mt-8">
            <PrimaryButton href="/login">
              Sign in with VaultysID <ChevronRight className="h-3.5 w-3.5" />
            </PrimaryButton>
          </div>
        </div>
      </section>

      <footer className="border-t border-neutral-200/60 py-8 text-center text-xs text-foreground-400">
        © {new Date().getFullYear()} VaultysClaw · All rights reserved
      </footer>
    </div>
  );
}

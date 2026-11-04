import Link from "next/link";
import { BrandLogo } from "@/components/ui/BrandLogo";
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
      "Every admin action and lifecycle event lands in a live-reverified, append-only log — see exactly who did what, and when.",
  },
  {
    icon: Webhook,
    title: "Webhooks and notification channels",
    description:
      "Signed HTTP webhooks and Apprise alerts keep your own systems and your team in sync with the ledger as it changes.",
  },
];

/**
 * The hero's one rich moment: what the product actually produces — a capability certificate,
 * set the way the console's own certificate detail page reads it. Illustrative values only.
 */
function CertificatePreview() {
  const rows: [string, string][] = [
    ["Holder", "did:vaultys:3f9a…c21e"],
    ["Kind", "openclaw agent"],
    ["Scope", "workspace:research"],
    ["Issued by", "control plane · admin approval"],
    ["Expires", "2027-11-04"],
  ];
  return (
    <div className="rounded-xl border border-neutral-200/60 bg-background-100 shadow-[0_8px_24px_rgba(0,0,0,0.06)]">
      <div className="flex items-center justify-between border-b border-neutral-200/60 px-5 py-4">
        <div>
          <p className="text-xs text-foreground-500">Capability certificate</p>
          <p className="mt-1 text-sm font-medium text-foreground">research-assistant-07</p>
        </div>
        <span className="rounded-md border border-success-200 bg-success-50 px-2 py-1 text-xs font-medium text-success-700">
          Active
        </span>
      </div>
      <dl className="divide-y divide-neutral-200/60 px-5">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[96px_1fr] gap-4 py-2.5 text-sm">
            <dt className="text-foreground-500">{label}</dt>
            <dd className="truncate font-mono text-xs leading-5 text-foreground-800">{value}</dd>
          </div>
        ))}
        <div className="grid grid-cols-[96px_1fr] gap-4 py-2.5 text-sm">
          <dt className="text-foreground-500">Capabilities</dt>
          <dd className="flex flex-wrap gap-1.5">
            {["api_call", "knowledge_search", "acme:report.read"].map((cap) => (
              <span
                key={cap}
                className="rounded border border-neutral-200 bg-background-50 px-1.5 py-0.5 font-mono text-xs text-foreground-700"
              >
                {cap}
              </span>
            ))}
          </dd>
        </div>
      </dl>
      <div className="flex items-center justify-between gap-4 border-t border-neutral-200/60 bg-background-200/30 px-5 py-3">
        <span className="truncate font-mono text-xs text-foreground-500">
          sig ed25519 · 7c1e…a90b
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-foreground-700">
          <ShieldCheck className="h-4 w-4 text-primary-600" strokeWidth={1.5} />
          Verified offline
        </span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-20 border-b border-neutral-200/60 bg-background">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center">
            <BrandLogo className="h-7" />
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-500"
          >
            Sign in <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </nav>

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 lg:grid-cols-[1fr_minmax(0,480px)] lg:py-28">
        <div className="animate-fade-in-up">
          <p className="text-sm text-foreground-500">Built on VaultysID</p>
          <span aria-hidden className="crenel mt-3 w-14" />
          <h1 className="mt-6 max-w-xl text-4xl font-medium leading-[1.08] tracking-[-0.02em] text-foreground sm:text-5xl">
            A sovereign control plane for AI agents
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-foreground-600">
            One signed ledger for every human, agent, sensor, and device. No passwords, no parallel
            role tables — just cryptographic identity and capability certificates, all the way down.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-primary-600 px-5 text-sm font-medium text-white transition-colors hover:bg-primary-500"
            >
              Get started <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            <a
              href="#features"
              className="inline-flex h-11 items-center rounded-lg border border-neutral-200 bg-background-100 px-5 text-sm font-medium text-foreground transition-colors hover:bg-background-200"
            >
              See how it works
            </a>
          </div>
        </div>
        <div className="animate-fade-in-up" style={{ animationDelay: "60ms" }}>
          <CertificatePreview />
        </div>
      </section>

      <section className="border-y border-neutral-200/60 bg-background-100">
        <dl className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-10 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.caption}>
              <dt className="text-xs text-foreground-500">{stat.caption}</dt>
              <dd className="mt-1 font-mono text-2xl font-medium text-foreground">
                {stat.headline}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-medium tracking-[-0.01em] text-foreground">
            Built for security-first teams
          </h2>
          <p className="mt-3 text-foreground-600">
            Every component is designed around the principle that no party should be implicitly
            trusted — including the control plane itself.
          </p>
        </div>
        <div className="mt-12 grid gap-x-12 gap-y-10 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="border-t border-neutral-200/60 pt-6">
              <feature.icon className="h-[18px] w-[18px] text-foreground-500" strokeWidth={1.5} />
              <h3 className="mt-4 text-base font-medium text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-foreground-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="flex flex-col items-start justify-between gap-6 rounded-xl border border-neutral-200/60 bg-background-100 p-8 sm:flex-row sm:items-center sm:p-10">
          <div>
            <h2 className="text-2xl font-medium text-foreground">Sign in to the console</h2>
            <p className="mt-2 max-w-md text-foreground-600">
              Use your VaultysID — no account to create, nothing to remember.
            </p>
          </div>
          <Link
            href="/login"
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-5 text-sm font-medium text-white transition-colors hover:bg-primary-500"
          >
            Sign in with VaultysID <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-neutral-200/60 py-8 text-center text-xs text-foreground-500">
        © {new Date().getFullYear()} VaultysClaw · All rights reserved
      </footer>
    </div>
  );
}

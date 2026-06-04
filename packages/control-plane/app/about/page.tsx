"use client";

import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  GitBranch,
  Star,
  GitFork,
  MessageSquare,
  ExternalLink,
  ShieldCheck,
  Loader2,
  AlertTriangle,
  Globe,
  Heart,
  Code2,
  Zap,
  Sparkles,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDarkMode } from "@/hooks/useDarkMode";

function MarkdownDoc({ content }: { content: string }) {
  const isDark = useDarkMode();

  return (
    <div
      className={[
        "prose prose-sm max-w-none",
        // prose-invert only in dark so light text/bg works correctly
        isDark ? "prose-invert" : "",
        // Headings
        "prose-headings:text-foreground prose-headings:font-semibold",
        "prose-h1:text-xl prose-h1:border-b prose-h1:border-neutral-200 prose-h1:pb-3",
        "prose-h2:text-lg prose-h2:border-b prose-h2:border-neutral-200/60 prose-h2:pb-2",
        "prose-h3:text-base",
        // Body
        "prose-p:text-foreground-500 prose-p:leading-7",
        "prose-strong:text-foreground prose-li:text-foreground-500",
        // Links
        "prose-a:text-primary-500:text-primary-400 prose-a:no-underline hover:prose-a:underline prose-a:font-normal",
        // Inline code — suppress typography backtick decoration; styling is in component below
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0",
        // Blockquote
        "prose-blockquote:border-primary-500 prose-blockquote:text-foreground-500 prose-blockquote:bg-primary-500/5 prose-blockquote:rounded-r-lg prose-blockquote:not-italic",
        // Tables
        "prose-table:text-sm prose-th:text-foreground-500 prose-th:font-semibold prose-td:text-foreground-500",
        // HR
        "prose-hr:border-neutral-200",
      ].join(" ")}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        components={{
          // Hide badge images (README shields) — don't load in a local context
          img: () => null,

          // Block code: read from the raw hast AST node to get the original
          // className ("language-bash") and plain text before component overrides.
          pre: ({ node }) => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const codeNode = (node as any)?.children?.find(
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              (c: any) => c.type === "element" && c.tagName === "code"
            );
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const classList: string[] = codeNode?.properties?.className ?? [];
            const lang =
              classList.join(" ").match(/language-(\w+)/)?.[1] ?? "text";
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const raw = (codeNode?.children ?? [])
              .map((c: any) => c.value ?? "")
              .join("")
              .replace(/\n$/, "");

            return (
              <div className="my-4">
                <SyntaxHighlighter
                  style={isDark ? oneDark : oneLight}
                  language={lang}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    borderRadius: "0.75rem",
                    fontSize: "0.78rem",
                    lineHeight: "1.65",
                    border: "1px solid rgb(var(--neutral-200))",
                    background: "rgb(var(--background-50))",
                  }}
                  codeTagProps={{
                    style: { fontFamily: "ui-monospace, monospace" },
                  }}
                >
                  {raw}
                </SyntaxHighlighter>
              </div>
            );
          },

          // Inline code — uses design-system tokens, adapts to light/dark
          code: ({ children }) => (
            <code className="text-primary-600 bg-background-200 border border-neutral-200 px-1.5 py-0.5 rounded text-[0.8em] font-mono">
              {children}
            </code>
          ),

          // Open all links in a new tab
          a: ({ href, children }) => (
            <a href={href ?? "#"} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),

          // Scrollable wrapper for wide tables
          table: ({ children }) => (
            <div className="overflow-x-auto rounded-lg border border-neutral-200 my-4">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ── GitHub CTA card ───────────────────────────────────────────────────────────

const GITHUB_URL = "https://github.com/vaultys/VaultysClaw";
const ISSUES_URL = `${GITHUB_URL}/issues`;
const FORK_URL = `${GITHUB_URL}/fork`;

function GitHubCTA() {
  return (
    <div className="rounded-2xl border border-primary-500/30 bg-gradient-to-br from-primary-500/5 via-background-100 to-background-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-5 border-b border-neutral-200">
        <div className="w-10 h-10 bg-background-200 rounded-xl flex items-center justify-center border border-neutral-200 shrink-0">
          <GitBranch size={20} className="text-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground text-sm">
            vaultys / VaultysClaw
          </h2>
          <p className="text-xs text-foreground-500 mt-0.5">
            Open-source Zero Trust AI agent orchestration platform
          </p>
        </div>
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background-200 border border-neutral-200 text-foreground hover:bg-background transition-colors shrink-0"
        >
          <GitBranch size={13} />
          View on GitHub
          <ExternalLink size={11} className="text-foreground-400" />
        </a>
      </div>

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-neutral-200">
        {[
          {
            href: `${GITHUB_URL}/stargazers`,
            icon: Star,
            iconColor: "text-warning-500",
            bg: "bg-warning-500/5",
            title: "Star the repo",
            desc: "Show support and help others discover VaultysClaw",
            action: "Star on GitHub",
          },
          {
            href: FORK_URL,
            icon: GitFork,
            iconColor: "text-primary-600",
            bg: "bg-primary-500/5",
            title: "Fork & contribute",
            desc: "Build features, fix bugs, improve docs — PRs welcome",
            action: "Fork repository",
          },
          {
            href: ISSUES_URL,
            icon: MessageSquare,
            iconColor: "text-secondary-600",
            bg: "bg-secondary-500/5",
            title: "Give feedback",
            desc: "Bug reports, feature requests, integrations ideas",
            action: "Open an issue",
          },
        ].map(({ href, icon: Icon, iconColor, bg, title, desc, action }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex flex-col gap-3 px-5 py-4 bg-background-100 hover:bg-background-200 transition-colors",
              bg
            )}
          >
            <Icon size={20} className={iconColor} />
            <div>
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-foreground-500 mt-0.5 leading-relaxed">
                {desc}
              </p>
            </div>
            <span className={cn("text-xs font-medium mt-auto", iconColor)}>
              {action} →
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Sponsors card ─────────────────────────────────────────────────────────────

const SPONSOR_TIERS = [
  {
    name: "Bronze",
    color: "text-warning-700",
    bg: "bg-warning-50",
    perks: ["Logo in README & About page", "GitHub Sponsors badge"],
  },
  {
    name: "Silver",
    color: "text-neutral-600",
    bg: "bg-neutral-50",
    perks: [
      "Everything in Bronze",
      "Private Discord with core devs",
      "Early access to releases",
    ],
  },
  {
    name: "Gold",
    color: "text-warning-700",
    bg: "bg-warning-50",
    perks: [
      "Everything in Silver",
      "Roadmap vote",
      "PoC fast-track",
      "Co-marketing opportunity",
    ],
  },
  {
    name: "Platinum",
    color: "text-primary-700",
    bg: "bg-primary-50",
    perks: [
      "Everything in Gold",
      "Dedicated support SLA",
      "Architecture review sessions",
      "Custom integration guidance",
    ],
  },
] as const;

function SponsorsCard() {
  return (
    <div className="rounded-2xl border border-warning-400/40 bg-gradient-to-br from-warning-50 via-background-100 to-background-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-neutral-200 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-warning-100 border border-warning-300 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-warning-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-foreground text-sm flex items-center gap-2">
            We&apos;re looking for sponsors
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-warning-100 text-warning-700 border border-warning-300">
              Open
            </span>
          </h2>
          <p className="text-xs text-foreground-500 mt-1 leading-relaxed">
            VaultysClaw is building the missing security layer for enterprise
            AI. Sponsors get direct access to the core team, real influence over
            the roadmap, and fast-track support for their specific use-cases —
            not a ticket queue.
          </p>
        </div>
      </div>

      {/* Tier grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-200">
        {SPONSOR_TIERS.map(({ name, color, bg, perks }) => (
          <div key={name} className={cn("px-4 py-4 flex flex-col gap-2", bg)}>
            <span
              className={cn(
                "text-xs font-bold uppercase tracking-wider",
                color
              )}
            >
              {name}
            </span>
            <ul className="space-y-1.5 flex-1">
              {perks.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-1.5 text-xs text-foreground-500"
                >
                  <span className={cn("mt-0.5 shrink-0", color)}>✓</span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* CTA footer */}
      <div className="px-6 py-4 bg-background/60 border-t border-neutral-200 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <p className="text-xs text-foreground-500 flex-1 leading-relaxed">
          Sponsoring directly funds security hardening, compliance tooling, and
          the features your organisation needs. Logos appear in README, this
          About page, and future marketing.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <a
            href="mailto:sponsor@vaultys.com"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background-200 border border-neutral-200 text-foreground-500 hover:text-foreground hover:border-warning-400:border-warning-500/50 transition-colors"
          >
            <Mail size={12} />
            sponsor@vaultys.com
          </a>
          <a
            href="https://github.com/sponsors/vaultys"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-warning-500 hover:bg-warning-400:bg-warning-600 text-white transition-colors"
          >
            <Sparkles size={12} />
            Become a sponsor
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Vaultys info card ─────────────────────────────────────────────────────────

function VaultysCard() {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-background-100 overflow-hidden">
      <div className="px-6 py-5 border-b border-neutral-200">
        <h2 className="font-semibold text-foreground text-sm flex items-center gap-2">
          <Heart size={15} className="text-primary-500" />
          Built by Vaultys
        </h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-neutral-200">
        {[
          {
            href: "https://vaultys.com",
            icon: Globe,
            label: "vaultys.com",
            desc: "Company website",
            color: "text-primary-500",
          },
          {
            href: "https://github.com/vaultys",
            icon: GitBranch,
            label: "github.com/vaultys",
            desc: "Open-source projects",
            color: "text-foreground-500",
          },
          {
            href: "https://github.com/vaultys/VaultysClaw/blob/main/docs/ARCHITECTURE.md",
            icon: Code2,
            label: "Architecture docs",
            desc: "Deep-dive technical docs",
            color: "text-primary-600",
          },
          {
            href: "https://github.com/vaultys/VaultysClaw/blob/main/docs/QUICK_START.md",
            icon: Zap,
            label: "Quick start",
            desc: "Up and running in minutes",
            color: "text-warning-600",
          },
        ].map(({ href, icon: Icon, label, desc, color }) => (
          <a
            key={href}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-5 py-4 bg-background-100 hover:bg-background-200 transition-colors"
          >
            <Icon size={16} className={cn("shrink-0", color)} />
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">
                {label}
              </p>
              <p className="text-[11px] text-foreground-500">{desc}</p>
            </div>
            <ExternalLink
              size={11}
              className="shrink-0 text-foreground-400 ml-auto"
            />
          </a>
        ))}
      </div>

      <div className="px-6 py-4 bg-background/50 border-t border-neutral-200">
        <p className="text-xs text-foreground-500 leading-relaxed">
          VaultysClaw is the control plane for the{" "}
          <a
            href="https://github.com/vaultys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 hover:underline"
          >
            VaultysId
          </a>{" "}
          cryptographic identity ecosystem. Every agent gets a unique,
          non-transferable EdDSA &amp; PQC-backed identity — no shared secrets,
          no passwords, no API key leaks.{" "}
          <a
            href="https://github.com/vaultys/VaultysClaw/blob/main/docs/SECURITY.md"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-500 hover:underline"
          >
            Read the security model →
          </a>
        </p>
      </div>
    </div>
  );
}

// ── Zero-Trust Roadmap doc panel ──────────────────────────────────────────────

function ZeroTrustPanel() {
  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/about?doc=zerotrust")
      .then((r) => r.json())
      .then((d: { content?: string; error?: string }) => {
        if (d.error) throw new Error(d.error);
        setContent(d.content ?? "");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-primary-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 bg-danger-50 border border-danger-300 rounded-xl px-4 py-3 text-sm text-danger-700">
        <AlertTriangle size={14} className="shrink-0" />
        {error}
      </div>
    );
  }

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-2xl px-8 py-7">
      <MarkdownDoc content={content ?? ""} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="p-6 w-full max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary-600/20 text-xl">
          🦞
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">
            About VaultysClaw
          </h1>
          <p className="text-sm text-foreground-500 mt-0.5">
            Zero Trust AI agent orchestration — open source, self-hosted,
            cryptographically secure
          </p>
        </div>
      </div>

      {/* GitHub CTA */}
      <GitHubCTA />

      {/* Sponsors */}
      <SponsorsCard />

      {/* Vaultys links */}
      <VaultysCard />

      {/* Zero-Trust Roadmap */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary-500" />
          <h2 className="text-sm font-semibold text-foreground">
            Zero-Trust Compliance Roadmap
          </h2>
        </div>
        <ZeroTrustPanel />
      </div>
    </div>
  );
}

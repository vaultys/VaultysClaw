"use client";
import { Sparkles, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { constants } from "@vaultysclaw/shared";

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

export function SponsorsCard() {
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-background-200 border border-neutral-200 text-foreground-500 hover:text-foreground hover:border-warning-400 dark:hover:border-warning-500/50 transition-colors"
          >
            <Mail size={12} />
            sponsor@vaultys.com
          </a>
          <a
            href={constants.git.GITHUB_SPONSORS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-warning-500 hover:bg-warning-400 dark:hover:bg-warning-600 text-white transition-colors"
          >
            <Sparkles size={12} />
            Become a sponsor
          </a>
        </div>
      </div>
    </div>
  );
}

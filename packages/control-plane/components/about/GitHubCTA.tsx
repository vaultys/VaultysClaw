"use client";
import {
  GitBranch,
  Star,
  GitFork,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { constants } from "@vaultysclaw/shared";

export function GitHubCTA() {
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
          href={constants.git.GITHUB_VAULTYSCLAW_URL}
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
            href: constants.git.GITHUB_VAULTYSCLAW_STARS_URL,
            icon: Star,
            iconColor: "text-warning-500",
            bg: "bg-warning-500/5",
            title: "Star the repo",
            desc: "Show support and help others discover VaultysClaw",
            action: "Star on GitHub",
          },
          {
            href: constants.git.GITHUB_VAULTYSCLAW_FORK_URL,
            icon: GitFork,
            iconColor: "text-primary-600",
            bg: "bg-primary-500/5",
            title: "Fork & contribute",
            desc: "Build features, fix bugs, improve docs — PRs welcome",
            action: "Fork repository",
          },
          {
            href: constants.git.GITHUB_VAULTYSCLAW_ISSUES_URL,
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

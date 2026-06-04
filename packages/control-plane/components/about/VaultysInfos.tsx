"use client";
import {
  GitBranch,
  ExternalLink,
  Globe,
  Heart,
  Code2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { constants } from "@vaultysclaw/shared";

export function VaultysInfos() {
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
            href: constants.vaultys.WEBSITE_URL,
            icon: Globe,
            label: "vaultys.com",
            desc: "Company website",
            color: "text-primary-500",
          },
          {
            href: constants.git.GITHUB_URL,
            icon: GitBranch,
            label: "github.com/vaultys",
            desc: "Open-source projects",
            color: "text-foreground-500",
          },
          {
            href: constants.docs.ARCHITECTURE_DOC_URL,
            icon: Code2,
            label: "Architecture docs",
            desc: "Deep-dive technical docs",
            color: "text-primary-600",
          },
          {
            href: constants.docs.QUICK_START_DOC_URL,
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
            href={constants.git.GITHUB_URL}
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
            href={constants.docs.SECURITY_DOC_URL}
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

"use client";
import { ShieldCheck, GitBranch } from "lucide-react";
import { constants } from "@vaultysclaw/shared";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { GitHubCTA } from "@/components/about/GitHubCTA";
import { SponsorsCard } from "@/components/about/SponsorsCard";
import { VaultysInfos } from "@/components/about/VaultysInfos";
import { DocPanel } from "@/components/about/DocPanel";

export default function AboutPage() {
  useBreadcrumbs([{ label: "About" }], []);

  useToolbar(
    {
      title: "About VaultysClaw",
      description:
        "Zero Trust AI agent orchestration — open source, self-hosted, cryptographically secure",
      actions: [
        {
          kind: "button",
          id: "github",
          label: "View on GitHub",
          icon: <GitBranch className="w-3.5 h-3.5" />,
          onClick: () =>
            window.open(
              constants.git.GITHUB_VAULTYSCLAW_URL,
              "_blank",
              "noopener,noreferrer"
            ),
        },
      ],
    },
    []
  );

  return (
    <div className="p-6 w-full max-w-5xl mx-auto space-y-6">
      {/* GitHub CTA */}
      <GitHubCTA />

      {/* Sponsors */}
      <SponsorsCard />

      {/* Vaultys links */}
      <VaultysInfos />

      {/* Zero-Trust Roadmap */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary-500" />
          <h2 className="text-sm font-semibold text-foreground">
            Zero-Trust Compliance Roadmap
          </h2>
        </div>
        <DocPanel />
      </div>
    </div>
  );
}

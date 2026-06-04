"use client";
import { ShieldCheck } from "lucide-react";
import { GitHubCTA } from "@/components/about/GitHubCTA";
import { SponsorsCard } from "@/components/about/SponsorsCard";
import { VaultysInfos } from "@/components/about/VaultysInfos";
import { DocPanel } from "@/components/about/DocPanel";

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

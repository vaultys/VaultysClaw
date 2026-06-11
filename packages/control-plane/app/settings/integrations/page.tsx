"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import {
  MessageSquare,
  HardDrive,
  Zap,
  Users,
  Activity,
} from "lucide-react";
import { SmtpPanel } from "@/components/integrations/smtp-panel";
import { PeerjsPanel } from "@/components/integrations/peerjs-panel";
import { LiteLLMPanel } from "@/components/integrations/litellm-panel";
import { OpenTelemetryPanel } from "@/components/integrations/otel-panel";
import { StoragePanel } from "@/components/integrations/storage-panel";
import { DoclingPanel } from "@/components/integrations/docling-panel";
import { ServerInfoPanel } from "@/components/integrations/server-info-panel";
import { EntraPanel } from "@/components/integrations/entra-panel";
import { cn } from "@/lib/utils";

type Tab = "communication" | "storage" | "ai" | "identity" | "observability";

const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: "communication", label: "Communication", icon: MessageSquare },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "ai", label: "AI & Models", icon: Zap },
  { id: "identity", label: "Identity", icon: Users },
  { id: "observability", label: "Observability", icon: Activity },
];

export default function IntegrationsPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("communication");

  const isAdmin = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin ?? false;
  const isOwner = (session?.user as { isOwner?: boolean } | undefined)?.isOwner ?? false;
  const hasAccess = isAdmin || isOwner;

  if (!hasAccess) {
    return (
      <div className="p-6 w-full max-w-2xl mx-auto">
        <div className="bg-warning-50 border border-warning-300 rounded-xl px-4 py-3 text-warning-700 text-sm">
          You must be an administrator or owner to access integrations settings.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground mb-1">Integrations</h1>
        <p className="text-sm text-foreground-500">
          Configure external services and APIs used by VaultysClaw
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-background-200 border border-neutral-300 rounded-xl p-1 w-fit overflow-x-auto">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition",
              activeTab === id
                ? "bg-background-100 text-foreground shadow-sm"
                : "text-foreground-500 hover:text-foreground"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* Communication Tab */}
        {activeTab === "communication" && (
          <>
            <SmtpPanel />
            <PeerjsPanel />
          </>
        )}

        {/* Storage Tab */}
        {activeTab === "storage" && (
          <>
            <StoragePanel />
            <DoclingPanel />
          </>
        )}

        {/* AI & Models Tab */}
        {activeTab === "ai" && (
          <>
            <LiteLLMPanel />
          </>
        )}

        {/* Identity Tab */}
        {activeTab === "identity" && (
          <EntraPanel />
        )}

        {/* Observability Tab */}
        {activeTab === "observability" && (
          <>
            <OpenTelemetryPanel />
            <ServerInfoPanel />
          </>
        )}
      </div>
    </div>
  );
}

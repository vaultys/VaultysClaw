"use client";

import { useRole } from "@/hooks/useRole";
import { useState } from "react";
import {
  MessageSquare,
  HardDrive,
  Zap,
  Users,
  Activity,
  Key,
  Webhook,
} from "lucide-react";
import { SmtpPanel } from "@/components/integrations/smtp-panel";
import { PeerjsPanel } from "@/components/integrations/peerjs-panel";
import { LiteLLMPanel } from "@/components/integrations/litellm-panel";
import { OpenTelemetryPanel } from "@/components/integrations/otel-panel";
import { StoragePanel } from "@/components/integrations/storage-panel";
import { DoclingPanel } from "@/components/integrations/docling-panel";
import { ServerInfoPanel } from "@/components/integrations/server-info-panel";
import { EntraPanel } from "@/components/integrations/entra-panel";
import { OidcPanel } from "@/components/integrations/oidc-panel";
import { ApiKeysPanel } from "@/components/integrations/api-keys-panel";
import { WebhooksPanel } from "@/components/integrations/webhooks-panel";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";

type Tab =
  | "communication"
  | "storage"
  | "ai"
  | "identity"
  | "observability"
  | "api-keys"
  | "webhooks";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "communication", label: "Communication", icon: MessageSquare },
  { id: "storage", label: "Storage", icon: HardDrive },
  { id: "ai", label: "AI & Models", icon: Zap },
  { id: "identity", label: "Identity", icon: Users },
  { id: "observability", label: "Observability", icon: Activity },
  { id: "api-keys", label: "API Keys", icon: Key },
  { id: "webhooks", label: "Webhooks", icon: Webhook },
];

export default function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("communication");

  const { isAdmin, isOwner } = useRole();
  const hasAccess = isAdmin || isOwner;

  useBreadcrumbs([{ label: "Integrations" }], []);

  useToolbar(
    {
      title: "Integrations",
      description: "Configure external services and APIs used by VaultysClaw",
      actions: hasAccess
        ? [
            {
              kind: "tabs",
              id: "tab",
              value: activeTab,
              onChange: (v) => setActiveTab(v as Tab),
              options: TABS.map((t) => ({
                value: t.id,
                label: t.label,
                icon: <t.icon className="w-3.5 h-3.5" />,
              })),
            },
          ]
        : [],
    },
    [activeTab, hasAccess]
  );

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
      {activeTab === "communication" && (
        <>
          <SmtpPanel />
          <PeerjsPanel />
        </>
      )}
      {activeTab === "storage" && (
        <>
          <StoragePanel />
          <DoclingPanel />
        </>
      )}
      {activeTab === "ai" && <LiteLLMPanel />}
      {activeTab === "identity" && (
        <>
          <OidcPanel />
          <EntraPanel />
        </>
      )}
      {activeTab === "observability" && (
        <>
          <OpenTelemetryPanel />
          <ServerInfoPanel />
        </>
      )}
      {activeTab === "api-keys" && <ApiKeysPanel />}
      {activeTab === "webhooks" && <WebhooksPanel />}
    </div>
  );
}

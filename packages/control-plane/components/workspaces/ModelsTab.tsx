"use client";

import { Cpu, ExternalLink, Lock } from "lucide-react";
import {
  WorkspaceLiteLLMKeyCard,
  type WorkspaceRouterKeyData,
} from "@/components/workspaces/WorkspaceLiteLLMKeyCard";
import type { WorkspaceModelRow } from "./types";
import { ListCard, ListRow } from "./ui";

function BudgetComingSoon() {
  return (
    <div className="relative">
      <div className="opacity-40 pointer-events-none select-none">
        <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">
            Budget &amp; Rate Limits
          </h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              ["Monthly spend cap", "$500 / month"],
              ["RPM limit", "100 req/min"],
              ["Alert at", "80% of budget"],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-foreground-500 mb-1">{label}</p>
                <div className="h-8 bg-background border border-neutral-200 rounded-lg px-3 flex items-center text-sm text-foreground-500">
                  {val}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-foreground-400">
            Enforced by LiteLLM virtual keys — requests rejected once the cap is
            reached.
          </p>
        </div>
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 backdrop-blur-[2px] rounded-2xl">
        <Lock className="w-5 h-5 text-foreground-500" />
        <p className="text-sm font-semibold text-foreground">
          Budget &amp; Rate Limits
        </p>
        <p className="text-xs text-foreground-500 text-center max-w-xs">
          Per-workspace spend caps and RPM limits — enforced automatically by
          LiteLLM virtual keys.
        </p>
        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full bg-warning-100 text-warning-700 border border-warning-300 uppercase tracking-wide">
          Coming soon
        </span>
      </div>
    </div>
  );
}

export function ModelsTab({
  workspaceId,
  models,
  routerKey,
  litellmConfigured,
  onRefresh,
  canManage,
}: {
  workspaceId: string;
  models: WorkspaceModelRow[];
  routerKey: WorkspaceRouterKeyData | null;
  litellmConfigured: boolean;
  onRefresh: () => void;
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      {canManage && (
        <WorkspaceLiteLLMKeyCard
          workspaceId={workspaceId}
          routerKey={routerKey}
          litellmConfigured={litellmConfigured}
          modelCount={models.length}
          onRefresh={onRefresh}
        />
      )}

      {models.length === 0 ? (
        <div className="flex flex-col items-center py-10 text-center">
          <Cpu className="w-8 h-8 text-neutral-300 mb-2" />
          <p className="text-foreground-500 text-sm">
            No models accessible to this workspace.
          </p>
          <p className="text-foreground-400 text-xs mt-1 mb-3">
            Grant access from the Model Registry to route agents here.
          </p>
          <a
            href="/models"
            className="flex items-center gap-1.5 text-xs text-primary-700 hover:text-primary-300 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Go to Model Registry
          </a>
        </div>
      ) : (
        <ListCard>
          {models.map((m, i) => (
            <ListRow key={m.id} index={i}>
              <div className="w-8 h-8 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                <Cpu className="w-4 h-4 text-primary-700" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">
                    {m.name}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-background-200 text-foreground-500 border border-neutral-200">
                    {m.provider}
                  </span>
                </div>
                <code className="text-xs text-foreground-400 font-mono truncate block">
                  {m.modelId}
                </code>
              </div>
              <a
                href={`/models/${m.id}`}
                className="p-1.5 rounded-lg text-foreground-500 hover:text-foreground transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </ListRow>
          ))}
        </ListCard>
      )}

      <BudgetComingSoon />
    </div>
  );
}

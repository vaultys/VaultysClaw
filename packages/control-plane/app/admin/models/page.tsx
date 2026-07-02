"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Cpu,
  Plus,
  Globe2,
  CheckCircle2,
  XCircle,
  Lock,
  Sparkles,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { RegisterModelModal } from "@/components/models/RegisterModelModal";
import { ProviderBadge } from "@/components/models/ProviderBadge";
import { modelsClient, unwrap } from "@/lib/api/ts-rest/client";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import type { SafeModel } from "@/lib/contracts";

export default function ModelsPage() {
  const router = useRouter();
  const { isGlobalAdmin, isLoading } = useRole();
  const [models, setModels] = useState<SafeModel[]>([]);

  useEffect(() => {
    if (!isLoading && !isGlobalAdmin) router.replace("/");
  }, [isLoading, isGlobalAdmin, router]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { models } = unwrap(await modelsClient.list());
      setModels(models);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useBreadcrumbs([{ label: "Models" }], []);

  useToolbar(
    {
      title: "Models",
      description: loading
        ? "Model registry and LiteLLM proxy management"
        : `${models.length} model${models.length !== 1 ? "s" : ""} · Model registry and LiteLLM proxy management`,
      actions: [
        {
          kind: "button",
          id: "register",
          label: "Register model",
          variant: "primary",
          icon: <Plus className="w-3.5 h-3.5" />,
          onClick: () => setShowCreate(true),
        },
      ],
    },
    [loading, models.length]
  );

  if (isLoading || !isGlobalAdmin) return null;

  return (
    <div className="p-6 w-full max-w-5xl mx-auto space-y-6">
      <>
        {loading && (
          <div className="text-sm text-foreground-500 py-8 text-center">
            Loading…
          </div>
        )}
        {!loading && models.length === 0 && (
          <div className="rounded-2xl border border-neutral-200 border-dashed bg-background-100/40 p-12 text-center">
            <Cpu className="w-8 h-8 text-foreground-400 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">
              No models registered
            </p>
            <p className="text-xs text-foreground-500 mb-4">
              Register an OpenAI-compatible endpoint to get started
            </p>
            {isGlobalAdmin && (
              <button
                onClick={() => setShowCreate(true)}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors"
              >
                Register first model
              </button>
            )}
          </div>
        )}
        {!loading && models.length > 0 && (
          <div className="rounded-2xl border border-neutral-200 bg-background-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neutral-200 text-foreground-500 text-xs uppercase tracking-wider">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Provider</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">
                    Model ID
                  </th>
                  <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">
                    Workspaces
                  </th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {models.map((m) => (
                  <tr
                    key={m.id}
                    onClick={() => router.push(`/admin/models/${m.id}`)}
                    className="border-b border-neutral-200/50 hover:bg-background-200/40 cursor-pointer transition-colors last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">
                        {m.name}
                      </div>
                      {m.description && (
                        <div className="text-xs text-foreground-500 truncate max-w-[180px]">
                          {m.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <ProviderBadge provider={m.provider} />
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <code className="text-xs text-foreground-500 font-mono truncate max-w-[180px] block">
                        {m.modelId}
                      </code>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <span className="flex items-center gap-1 text-foreground-500">
                        <Globe2 className="w-3.5 h-3.5" />
                        {m.workspaceAccess.length}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.status === "active" ? (
                        <span className="flex items-center gap-1 text-success-700 text-xs font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-neutral-500 text-xs font-medium">
                          <XCircle className="w-3.5 h-3.5" /> Inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Coming soon cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-neutral-200 border-dashed bg-background-100/40 p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-neutral-400" />
                </div>
                <span className="text-sm font-medium text-foreground">
                  Kubernetes Deployment
                </span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warning-100 text-warning-700 border border-warning-300 uppercase tracking-wide">
                Coming soon
              </span>
            </div>
            <p className="text-xs text-foreground-500">
              Auto-provision vLLM GPU pods directly from the control plane.
              One-click deploy with Karpenter auto-scaling and scale-to-zero.
            </p>
          </div>

          <div className="rounded-2xl border border-neutral-200 border-dashed bg-background-100/40 p-5">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-neutral-800 flex items-center justify-center">
                  <Lock className="w-4 h-4 text-neutral-400" />
                </div>
                <span className="text-sm font-medium text-foreground">
                  Fine-Tuning Pipeline
                </span>
              </div>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-warning-100 text-warning-700 border border-warning-300 uppercase tracking-wide">
                Coming soon
              </span>
            </div>
            <p className="text-xs text-foreground-500">
              Submit Unsloth training jobs from the UI. Upload JSONL datasets,
              pick a base model, and track job progress — no GPU server
              management required.
            </p>
          </div>
        </div>
      </>

      {showCreate && (
        <RegisterModelModal
          onClose={() => setShowCreate(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}

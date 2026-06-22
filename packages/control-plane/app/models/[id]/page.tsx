"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Cpu,
  Globe2,
  CheckCircle2,
  XCircle,
  Trash2,
  Server,
  FlaskConical,
} from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { OverviewTab } from "@/components/models/OverviewTab";
import { RealmAccessTab } from "@/components/models/RealmAccessTab";
import { DeploymentTab } from "@/components/models/DeploymentTab";
import { TrainingTab } from "@/components/models/TrainingTab";
import { modelsClient, unwrap } from "@/lib/api/ts-rest/client";
import { SafeModel } from "@/lib/contracts";

const TABS = [
  { id: "overview", label: "Overview", icon: Cpu },
  { id: "realms", label: "Realm Access", icon: Globe2 },
  { id: "deployment", label: "Deployment", icon: Server, comingSoon: true },
  {
    id: "training",
    label: "Fine-Tuning",
    icon: FlaskConical,
    comingSoon: true,
  },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function ModelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isGlobalAdmin } = useRole();
  const [model, setModel] = useState<SafeModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabId>("overview");
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    const model = unwrap(
      await modelsClient.getOne({
        params: {
          id,
        },
      })
    ).model;
    setModel(model);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!confirm(`Delete model "${model?.name}"? This cannot be undone.`))
      return;
    setDeleting(true);
    unwrap(await modelsClient.remove({ params: { id } }));
    router.push("/models");
  }

  useBreadcrumbs(
    [{ label: "Models", href: "/models" }, { label: model?.name ?? "…" }],
    [model?.name]
  );

  useToolbar(
    {
      title: model?.name ?? "Model",
      description: model?.description ?? undefined,
      actions: model
        ? [
            {
              kind: "badge",
              id: "status",
              label: model.status === "active" ? "Active" : "Inactive",
              tone: model.status === "active" ? "success" : "neutral",
              icon:
                model.status === "active" ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <XCircle className="w-3 h-3" />
                ),
            },
            ...(isGlobalAdmin
              ? [
                  {
                    kind: "button" as const,
                    id: "delete",
                    label: "Delete",
                    variant: "danger" as const,
                    icon: <Trash2 className="w-3.5 h-3.5" />,
                    onClick: handleDelete,
                    disabled: deleting,
                  },
                ]
              : []),
          ]
        : [],
    },
    [model?.name, model?.description, model?.status, isGlobalAdmin, deleting]
  );

  if (loading)
    return <div className="p-6 text-sm text-foreground-500">Loading…</div>;
  if (!model)
    return (
      <div className="p-6 text-sm text-foreground-500">Model not found.</div>
    );

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {/* Tabs */}
      <div className="flex border-b border-neutral-200 gap-1">
        {TABS.map((tab_) => {
          const { id: tabId, label, icon: Icon } = tab_;
          const comingSoon = "comingSoon" in tab_ && tab_.comingSoon;
          return (
            <button
              key={tabId}
              onClick={() => setTab(tabId)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                tab === tabId
                  ? "border-primary-500 text-primary-700"
                  : "border-transparent text-foreground-500 hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
              {comingSoon && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-warning-100 text-warning-700 border border-warning-300 uppercase tracking-wide leading-none">
                  Soon
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <OverviewTab model={model} onSaved={load} isAdmin={isGlobalAdmin} />
      )}
      {tab === "realms" && <RealmAccessTab model={model} onChanged={load} />}
      {tab === "deployment" && <DeploymentTab />}
      {tab === "training" && <TrainingTab />}
    </div>
  );
}

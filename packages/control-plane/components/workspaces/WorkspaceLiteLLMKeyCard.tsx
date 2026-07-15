"use client";

import { useState } from "react";
import { Key, RefreshCw, Trash2, Pencil, ExternalLink, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { ConfirmModal } from "@/components/shared/ConfirmModal";
import {
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";

export interface WorkspaceRouterKeyData {
  hasVirtualKey: boolean;
  keyPrefix: string | null;
  allowedModels: string[];
  monthlyBudgetUsd: number | null;
  updatedAt: string | null;
}

interface Props {
  workspaceId: string;
  routerKey: WorkspaceRouterKeyData | null;
  litellmConfigured: boolean;
  /** Number of models granted to this workspace (needed to check if provision is possible) */
  modelCount: number;
  onRefresh: () => void;
}

export function WorkspaceLiteLLMKeyCard({
  workspaceId,
  routerKey,
  litellmConfigured,
  modelCount,
  onRefresh,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [showRevoke, setShowRevoke] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const openEdit = () => {
    setBudgetInput(routerKey?.monthlyBudgetUsd?.toString() ?? "");
    setMsg(null);
    setEditing(true);
  };

  const provision = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const body: { monthlyBudget?: number | null } = {};
      if (budgetInput !== "")
        body.monthlyBudget = budgetInput ? parseFloat(budgetInput) : null;

      const data = unwrap(
        await userApi.workspaces.putLitellmKey({ params: { id: workspaceId }, body })
      );
      setMsg({
        ok: true,
        text: `Key provisioned for ${data.allowedModels?.length ?? 0} model(s) ✓`,
      });
      setEditing(false);
      onRefresh();
    } catch (e) {
      setMsg({
        ok: false,
        text: e instanceof Error ? e.message : "Failed to provision key",
      });
    } finally {
      setSaving(false);
    }
  };

  const revoke = async () => {
    setRevoking(true);
    try {
      await userApi.workspaces.deleteLitellmKey({ params: { id: workspaceId } });
      setShowRevoke(false);
      setMsg({ ok: true, text: "Router key revoked" });
      onRefresh();
    } finally {
      setRevoking(false);
    }
  };

  // ── Not configured ──────────────────────────────────────────────────────────

  if (!litellmConfigured) {
    return (
      <div className="bg-background-100 border border-neutral-200 rounded-2xl p-4 flex items-center gap-3">
        <Key className="w-4 h-4 text-foreground-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground">LiteLLM Router Key</p>
          <p className="text-xs text-foreground-500">LiteLLM proxy not configured.</p>
        </div>
        <Link
          href="/admin/models?tab=litellm"
          className="shrink-0 flex items-center gap-1 text-xs text-primary-500 hover:text-primary-400 transition-colors"
        >
          Configure proxy <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
    );
  }

  // ── Main card ───────────────────────────────────────────────────────────────

  return (
    <>
      <ConfirmModal
        open={showRevoke}
        title="Revoke workspace router key"
        message="The workspace's LiteLLM virtual key will be removed. Agents that were using it will keep their last pushed config until reconfigured."
        confirmLabel="Revoke key"
        variant="danger"
        loading={revoking}
        onConfirm={revoke}
        onCancel={() => setShowRevoke(false)}
      />

      <div className="bg-background-100 border border-neutral-200 rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-200">
          <div className="flex items-center gap-2">
            <Key className="w-4 h-4 text-warning-500 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-foreground">LiteLLM Router Key</h3>
              <p className="text-xs text-foreground-500">
                Shared virtual key scoped to this workspace — agents use it for model routing
              </p>
            </div>
          </div>

          {!editing && (
            <div className="flex items-center gap-2 shrink-0">
              {routerKey?.hasVirtualKey && (
                <button
                  onClick={() => setShowRevoke(true)}
                  className="flex items-center gap-1 text-xs text-danger-500 hover:text-danger-400 border border-danger-400/30 px-2.5 py-1.5 rounded-md transition-colors"
                >
                  <Trash2 className="w-3 h-3" /> Revoke
                </button>
              )}
              <button
                onClick={openEdit}
                disabled={!litellmConfigured}
                className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 border border-primary-500/30 px-2.5 py-1.5 rounded-md transition-colors disabled:opacity-40"
              >
                {routerKey?.hasVirtualKey ? (
                  <><RefreshCw className="w-3 h-3" /> Refresh</>
                ) : (
                  <><Key className="w-3 h-3" /> Provision</>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Edit / provision form */}
        {editing ? (
          <div className="p-4 space-y-4">
            <p className="text-xs text-foreground-500">
              {modelCount === 0
                ? "No models are granted to this workspace yet. Grant access to models first via the Model Registry."
                : `A virtual key will be provisioned in LiteLLM covering all ${modelCount} model(s) currently granted to this workspace.`}
            </p>

            {modelCount > 0 && (
              <div>
                <label className="text-xs text-foreground-500 uppercase tracking-wider font-medium block mb-1.5">
                  Monthly budget (USD){" "}
                  <span className="normal-case text-foreground-400">(optional)</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-foreground-500">$</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    placeholder="500"
                    className="w-32 bg-background-200 border border-neutral-300 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
                  />
                  <span className="text-xs text-foreground-400">/ month</span>
                </div>
              </div>
            )}

            {msg && (
              <p className={`text-xs px-3 py-2 rounded-xl ${
                msg.ok
                  ? "bg-success-50 text-success-700"
                  : "bg-danger-50 text-danger-700"
              }`}>
                {msg.text}
              </p>
            )}

            <div className="flex items-center gap-3 pt-1">
              <button
                type="button"
                onClick={() => { setEditing(false); setMsg(null); }}
                className="text-sm text-foreground-500 hover:text-foreground px-3 py-1.5"
              >
                Cancel
              </button>
              <button
                onClick={provision}
                disabled={saving || modelCount === 0}
                className="flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-lg bg-primary-600 hover:bg-primary-500 text-white disabled:opacity-40 transition"
              >
                {saving ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Provisioning…</>
                ) : routerKey?.hasVirtualKey ? (
                  "Refresh Key"
                ) : (
                  "Provision Key"
                )}
              </button>
              {modelCount === 0 && (
                <Link
                  href="/admin/models"
                  className="text-xs text-foreground-500 hover:text-foreground ml-auto transition-colors"
                >
                  Grant models first →
                </Link>
              )}
            </div>
          </div>
        ) : routerKey?.hasVirtualKey ? (
          /* Key details */
          <div className="divide-y divide-neutral-200">
            <div className="flex items-center gap-3 px-4 py-3 bg-success-50">
              <CheckCircle2 className="w-4 h-4 text-success-600 shrink-0" />
              <span className="text-sm font-medium text-foreground">Active</span>
              <code className="text-xs font-mono text-foreground-500 ml-1">
                {routerKey.keyPrefix}…
              </code>
              <Link
                href="/admin/models?tab=litellm"
                className="ml-auto text-xs text-success-600 hover:underline shrink-0"
              >
                LiteLLM proxy →
              </Link>
            </div>
            {(
              [
                {
                  label: "Models",
                  value:
                    routerKey.allowedModels.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {routerKey.allowedModels.map((m) => (
                          <code
                            key={m}
                            className="text-xs font-mono bg-background-200 px-1.5 py-0.5 rounded border border-neutral-200"
                          >
                            {m}
                          </code>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-foreground-400">none</span>
                    ),
                },
                {
                  label: "Monthly cap",
                  value:
                    routerKey.monthlyBudgetUsd != null ? (
                      <span className="text-xs font-medium">
                        ${routerKey.monthlyBudgetUsd.toFixed(0)} / month
                      </span>
                    ) : (
                      <span className="text-xs text-foreground-400 flex items-center gap-1">
                        No limit
                        <button
                          onClick={openEdit}
                          className="text-foreground-400 hover:text-primary-400 transition-colors"
                          title="Set budget"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </span>
                    ),
                },
                ...(routerKey.updatedAt
                  ? [
                      {
                        label: "Updated",
                        value: (
                          <span className="text-xs text-foreground-500">
                            {new Date(routerKey.updatedAt).toLocaleString()}
                          </span>
                        ),
                      },
                    ]
                  : []),
              ] as { label: string; value: React.ReactNode }[]
            ).map(({ label, value }) => (
              <div key={label} className="flex items-start gap-4 px-4 py-3">
                <div className="w-28 flex-shrink-0 text-xs text-foreground-500 uppercase pt-0.5">
                  {label}
                </div>
                <div className="flex-1 text-sm text-foreground">{value}</div>
              </div>
            ))}
          </div>
        ) : (
          /* No key yet */
          <div className="px-4 py-6 text-center">
            <Key className="w-6 h-6 text-foreground-400 mx-auto mb-2" />
            <p className="text-sm text-foreground-500">No router key provisioned.</p>
            <p className="text-xs text-foreground-400 mt-1">
              {modelCount > 0
                ? "Click Provision to generate a scoped key covering all granted models."
                : "Grant access to at least one model to provision a key."}
            </p>
          </div>
        )}

        {/* Inline feedback after revoke */}
        {msg && !editing && (
          <div className={`px-4 py-2 text-xs border-t border-neutral-200 ${
            msg.ok
              ? "text-success-600 bg-success-50"
              : "text-danger-600 bg-danger-50"
          }`}>
            {msg.text}
          </div>
        )}
      </div>
    </>
  );
}

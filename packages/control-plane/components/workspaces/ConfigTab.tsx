"use client";

import { useState } from "react";
import { workspacesClient } from "@/lib/api/ts-rest/client";
import type { WorkspaceDetail } from "@/lib/contracts";
import { ALL_CAPS } from "./types";

/** Workspace config: default capabilities suggested when approving agents. */
export function ConfigTab({
  workspace,
  onSaved,
  canEdit,
}: {
  workspace: WorkspaceDetail;
  onSaved: () => void;
  canEdit: boolean;
}) {
  // defaultCapabilities is a Prisma Json column → already a parsed JS array.
  const defaultCaps: string[] = Array.isArray(workspace.defaultCapabilities)
    ? (workspace.defaultCapabilities as string[])
    : [];
  const [caps, setCaps] = useState<string[]>(defaultCaps);
  const [saving, setSaving] = useState(false);

  function toggle(cap: string) {
    setCaps((prev) =>
      prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]
    );
  }

  async function save() {
    setSaving(true);
    await workspacesClient.update({
      params: { id: workspace.id },
      body: { defaultCapabilities: caps },
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="space-y-4 max-w-lg">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Default Capabilities
          </h3>
          <p className="text-xs text-foreground-500 mb-3">
            Capabilities suggested to admins when approving agents into this
            workspace.
          </p>
          <div className="flex flex-wrap gap-2">
            {ALL_CAPS.map((cap) => (
              <button
                key={cap}
                onClick={() => toggle(cap)}
                disabled={!canEdit}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors border disabled:cursor-not-allowed ${
                  caps.includes(cap)
                    ? "bg-primary-50 border-primary-300 text-primary-700"
                    : "bg-background-200 border-neutral-200 text-foreground-500 hover:text-foreground"
                }`}
              >
                {cap.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
        {canEdit ? (
          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Saving…" : "Save Config"}
            </button>
          </div>
        ) : (
          <p className="text-xs text-foreground-400">
            Only the workspace owner can change these settings.
          </p>
        )}
      </div>
    </div>
  );
}

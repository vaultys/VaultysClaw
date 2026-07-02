"use client";

import { useState } from "react";
import { Globe2, Share2 } from "lucide-react";
import { skillsClient, unwrap, ApiError } from "@/lib/api/ts-rest/client";
import { configToText, type WorkspaceOption, type SkillGroup } from "./types";

export function ShareToWorkspaceModal({
  group,
  workspaces,
  onClose,
  onCreated,
}: {
  group: SkillGroup;
  workspaces: WorkspaceOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const source = group.entries[0];
  const existingWorkspaceIds = new Set(group.entries.map((e) => e.workspaceId));
  const available = workspaces.filter((r) => !existingWorkspaceIds.has(r.id));

  const [workspaceId, setWorkspaceId] = useState(available[0]?.id ?? "");
  const [isRequired, setIsRequired] = useState(source?.isRequired ?? false);
  const [configText, setConfigText] = useState(() =>
    configToText(source?.config ?? null)
  );
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function validateConfig(v: string) {
    try {
      JSON.parse(v);
      setConfigError("");
    } catch {
      setConfigError("Invalid JSON");
    }
  }

  if (available.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
          <Share2 className="w-8 h-8 text-foreground-500 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium text-foreground mb-1">
            Already in all workspaces
          </p>
          <p className="text-xs text-foreground-500 mb-4">
            <span className="font-mono">{group.name}</span> is registered in
            every workspace.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-foreground-500 border border-neutral-200 rounded-lg hover:text-foreground transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!workspaceId) {
      setError("Select a workspace");
      return;
    }
    if (configError) {
      setError("Fix config JSON first");
      return;
    }
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(configText);
    } catch {
      setError("Invalid config JSON");
      return;
    }
    setSaving(true);
    setError("");
    try {
      unwrap(
        await skillsClient.create({
          body: {
            workspaceId,
            name: group.name,
            description: source?.description ?? undefined,
            version: source?.version ?? undefined,
            isRequired,
            config,
            content: source?.content ?? null,
          },
        })
      );
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Network error");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-base font-semibold text-foreground mb-1">
          Share skill to workspace
        </h2>
        <p className="text-xs text-foreground-500 mb-4">
          Adding{" "}
          <span className="font-mono font-medium text-foreground">
            {group.name}
          </span>{" "}
          to an additional workspace. The skill's name
          {source?.content
            ? ", description, and instructions"
            : " and description"}{" "}
          will be copied from the existing entry.
        </p>

        {/* Existing workspaces context */}
        <div className="flex flex-wrap gap-1 mb-4">
          <span className="text-xs text-foreground-500">Already in:</span>
          {group.entries.map((e) => (
            <span
              key={e.id}
              className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-background border border-neutral-200 text-foreground-500"
            >
              <Globe2 className="w-3 h-3" />
              {e.workspaceName}
            </span>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">
              Target workspace <span className="text-danger-500">*</span>
            </label>
            <select
              className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            >
              {available.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="shareRequired"
              className="rounded border-neutral-200 text-primary-600 focus:ring-primary-500"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <label htmlFor="shareRequired" className="text-sm text-foreground">
              Required in this workspace — agents cannot disable
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">
              Config (JSON){" "}
              <span className="font-normal text-foreground-500">
                — workspace-specific overrides
              </span>
            </label>
            <textarea
              className={`w-full bg-background border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 h-24 resize-none ${configError ? "border-danger-500" : "border-neutral-200"}`}
              placeholder="{}"
              value={configText}
              onChange={(e) => {
                setConfigText(e.target.value);
                validateConfig(e.target.value);
              }}
            />
            {configError && (
              <p className="text-xs text-danger-500 mt-1">{configError}</p>
            )}
          </div>
          {error && <p className="text-sm text-danger-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-foreground-500 hover:text-foreground rounded-lg border border-neutral-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? "Adding…" : "Add to workspace"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

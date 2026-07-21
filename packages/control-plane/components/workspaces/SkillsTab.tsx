"use client";

import { useState } from "react";
import { AlertCircle, Lock, Plus, Puzzle, X } from "lucide-react";
import type { WorkspaceSkill } from "@/lib/contracts";
import { useConfirm } from "@/components/shared/ConfirmContext";
import { ListCard, ListRow } from "./ui";

export function SkillsTab({
  workspaceId,
  skills,
  onChanged,
  canManage,
}: {
  workspaceId: string;
  skills: WorkspaceSkill[];
  onChanged: () => void;
  canManage: boolean;
}) {
  const confirm = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDesc, setAddDesc] = useState("");
  const [addVersion, setAddVersion] = useState("");
  const [addRequired, setAddRequired] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    if (!addName.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/workspaces/${workspaceId}/skills`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: addName.trim(),
        description: addDesc.trim() || undefined,
        version: addVersion.trim() || undefined,
        isRequired: addRequired,
      }),
    });
    if (!res.ok) {
      const d = await res.json();
      setError(d.error ?? "Failed to add skill");
      setSaving(false);
      return;
    }
    setAddName("");
    setAddDesc("");
    setAddVersion("");
    setAddRequired(false);
    setShowAdd(false);
    setSaving(false);
    onChanged();
  }

  async function handleToggleRequired(skill: WorkspaceSkill) {
    await fetch(`/api/workspaces/${workspaceId}/skills/${skill.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isRequired: !skill.isRequired }),
    });
    onChanged();
  }

  async function handleDelete(skill: WorkspaceSkill) {
    if (
      !(await confirm({
        title: "Remove skill",
        message: `Remove skill "${skill.name}" from this workspace?`,
        variant: "danger",
      }))
    )
      return;
    await fetch(`/api/workspaces/${workspaceId}/skills/${skill.id}`, {
      method: "DELETE",
    });
    onChanged();
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-foreground-500">
          Skills listed here are pushed to agents in this workspace. Required skills
          cannot be disabled by agents.
        </p>
        {canManage && (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary-600 hover:bg-primary-500 text-white font-medium transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" /> Add Skill
          </button>
        )}
      </div>

      {showAdd && (
        <div className="bg-background-100 border border-neutral-200 rounded-2xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Add Skill</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-foreground-500 mb-1">
                Skill name *
              </label>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. web-scraper"
                className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs text-foreground-500 mb-1">
                Version
              </label>
              <input
                value={addVersion}
                onChange={(e) => setAddVersion(e.target.value)}
                placeholder="e.g. 1.0.0"
                className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-foreground-500 mb-1">
              Description
            </label>
            <input
              value={addDesc}
              onChange={(e) => setAddDesc(e.target.value)}
              placeholder="What does this skill do?"
              className="w-full bg-background border border-neutral-200 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={addRequired}
              onChange={(e) => setAddRequired(e.target.checked)}
              className="accent-primary-600"
            />
            <Lock className="w-3.5 h-3.5 text-warning-700" />
            Required — agents cannot disable this skill
          </label>
          {error && (
            <p className="text-danger-600 text-sm flex items-center gap-1">
              <AlertCircle className="w-4 h-4" />
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={!addName.trim() || saving}
              className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
            >
              {saving ? "Adding…" : "Add Skill"}
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setError("");
              }}
              className="px-4 py-2 rounded-xl border border-neutral-200 text-foreground-500 hover:text-foreground text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {skills.length === 0 && !showAdd ? (
        <div className="flex flex-col items-center py-12 text-center">
          <Puzzle className="w-8 h-8 text-neutral-300 mb-2" />
          <p className="text-foreground-500 text-sm">
            No skills configured for this workspace.
          </p>
          <p className="text-foreground-400 text-xs mt-1">
            Add skills to control which agent capabilities are available in this
            workspace.
          </p>
        </div>
      ) : (
        skills.length > 0 && (
          <ListCard>
            {skills.map((skill, i) => (
              <ListRow key={skill.id} index={i}>
                <div className="w-8 h-8 rounded-lg bg-secondary-600/20 flex items-center justify-center shrink-0">
                  <Puzzle className="w-4 h-4 text-secondary-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground font-mono">
                      {skill.name}
                    </span>
                    {skill.version && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-background-200 text-foreground-400 font-mono">
                        v{skill.version}
                      </span>
                    )}
                    {skill.isRequired ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-warning-50 text-warning-700 flex items-center gap-1">
                        <Lock className="w-3 h-3" /> required
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-background-200 text-foreground-400">
                        optional
                      </span>
                    )}
                  </div>
                  {skill.description && (
                    <p className="text-xs text-foreground-500 truncate mt-0.5">
                      {skill.description}
                    </p>
                  )}
                </div>
                {canManage && (
                  <>
                    <button
                      onClick={() => handleToggleRequired(skill)}
                      className={`p-1.5 rounded-lg transition-colors text-xs ${
                        skill.isRequired
                          ? "text-warning-400 hover:text-foreground-500 hover:bg-background-200"
                          : "text-foreground-500 hover:text-warning-400 hover:bg-warning-400/10"
                      }`}
                      title={skill.isRequired ? "Make optional" : "Make required"}
                    >
                      <Lock className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(skill)}
                      className="p-1.5 rounded-lg text-foreground-500 hover:text-danger-400 hover:bg-danger-400/10 transition-colors"
                      title="Remove skill"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                )}
              </ListRow>
            ))}
          </ListCard>
        )
      )}
    </div>
  );
}

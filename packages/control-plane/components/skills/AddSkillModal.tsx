"use client";

import { useState } from "react";
import { skillsClient, unwrap, ApiError } from "@/lib/api/ts-rest/client";
import type { WorkspaceOption } from "./types";

export function AddSkillModal({
  workspaces,
  prefillName = "",
  prefillDescription = "",
  prefillContent = "",
  onClose,
  onCreated,
}: {
  workspaces: WorkspaceOption[];
  prefillName?: string;
  prefillDescription?: string;
  prefillContent?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [workspaceId, setWorkspaceId] = useState(workspaces[0]?.id ?? "");
  const [name, setName] = useState(prefillName);
  const [description, setDescription] = useState(prefillDescription);
  const [content, setContent] = useState(prefillContent);
  const [version, setVersion] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [configText, setConfigText] = useState("{}");
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const nameLocked = prefillName.length > 0;

  function validateConfig(v: string) {
    try {
      JSON.parse(v);
      setConfigError("");
    } catch {
      setConfigError("Invalid JSON");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
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
            name,
            description,
            version,
            isRequired,
            config,
            content: content || null,
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
      <div className="bg-background-100 border border-neutral-200 rounded-2xl shadow-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-base font-semibold text-foreground mb-1">
          {nameLocked
            ? `Add "${prefillName}" to Another Workspace`
            : "Add Skill to Workspace"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Library context block */}
          {nameLocked && prefillDescription && (
            <div className="rounded-lg bg-primary-500/5 border border-primary-500/20 px-3 py-2.5">
              <p className="text-xs font-medium text-primary-400 mb-1">
                From skills library
              </p>
              <p className="text-xs text-foreground-500 leading-relaxed">
                {prefillDescription}
              </p>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">
              Workspace
            </label>
            <select
              className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={workspaceId}
              onChange={(e) => setWorkspaceId(e.target.value)}
            >
              {workspaces.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">
              Skill name <span className="text-danger-500">*</span>
            </label>
            <input
              className={`w-full bg-background border border-neutral-200 rounded-lg px-3 py-2 text-sm text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500 ${nameLocked ? "opacity-60 cursor-not-allowed" : ""}`}
              placeholder="e.g. calculator"
              value={name}
              readOnly={nameLocked}
              onChange={(e) => !nameLocked && setName(e.target.value)}
            />
            <p className="text-xs text-foreground-500 mt-1">
              {nameLocked
                ? "Name is from the library — must match the skill module filename on the agent"
                : "Must match the skill module name on the agent filesystem"}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">
                Short description
              </label>
              <input
                className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-2 text-sm text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Optional summary"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">
                Version
              </label>
              <input
                className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-2 text-sm text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="e.g. 1.0.0"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="addIsRequired"
              className="rounded border-neutral-200 text-primary-600 focus:ring-primary-500"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <label htmlFor="addIsRequired" className="text-sm text-foreground">
              Required — agents cannot disable this skill
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">
              Config (JSON)
              <span className="ml-1 font-normal text-foreground-500">
                — skill-specific settings pushed to the agent
              </span>
            </label>
            <textarea
              className={`w-full bg-background border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 h-24 resize-none ${configError ? "border-danger-500" : "border-neutral-200"}`}
              placeholder={'{\n "apiKey": "...",\n "maxResults": 10\n}'}
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
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">
              Instructions (Markdown)
              <span className="ml-1 font-normal text-foreground-500">
                — injected into the agent's system prompt
              </span>
            </label>
            <textarea
              className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 h-40 resize-y"
              placeholder={
                "# My Skill\n\nDescribe what the agent should do when this skill is active…"
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-danger-500">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-foreground-500 hover:text-foreground rounded-lg border border-neutral-200 hover:border-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-500 rounded-lg disabled:opacity-50 transition-colors"
            >
              {saving ? "Adding…" : "Add Skill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

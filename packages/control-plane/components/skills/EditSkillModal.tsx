"use client";

import { useState } from "react";
import {
  realmsClient,
  skillsClient,
  unwrap,
  ApiError,
} from "@/lib/api/ts-rest/client";
import type { RealmSkillWithMeta } from "@/lib/contracts";
import { configToText } from "./types";

export function EditSkillModal({
  entry,
  onClose,
  onSaved,
}: {
  entry: RealmSkillWithMeta;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(entry.description ?? "");
  const [version, setVersion] = useState(entry.version ?? "");
  const [isRequired, setIsRequired] = useState(entry.isRequired);
  const [content, setContent] = useState(entry.content ?? "");
  const [fetching, setFetching] = useState(false);
  const [configText, setConfigText] = useState(() => configToText(entry.config));
  const [configError, setConfigError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function fetchContent() {
    setFetching(true);
    try {
      // The source is not stored on the entry — try by name as the skillId.
      const res = await skillsClient.libraryContent({
        query: { skillId: entry.name },
      });
      if (res.status === 200 && res.body.content) setContent(res.body.content);
    } finally {
      setFetching(false);
    }
  }

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
        await realmsClient.updateSkill({
          params: { id: entry.realmId, skillId: entry.id },
          body: {
            description: description || null,
            version: version || null,
            isRequired,
            config,
            content: content || null,
          },
        })
      );
      onSaved();
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
          Edit Skill
        </h2>
        <p className="text-xs text-foreground-500 mb-4">
          <span className="font-mono font-medium text-foreground">
            {entry.name}
          </span>{" "}
          in{" "}
          <span className="font-medium text-foreground">{entry.realmName}</span>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-foreground-500 mb-1">
                Description
              </label>
              <input
                className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-2 text-sm text-foreground placeholder-foreground-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="editRequired"
              className="rounded border-neutral-200 text-primary-600 focus:ring-primary-500"
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
            />
            <label htmlFor="editRequired" className="text-sm text-foreground">
              Required — agents cannot disable this skill
            </label>
          </div>
          <div>
            <label className="block text-xs font-medium text-foreground-500 mb-1">
              Config (JSON)
            </label>
            <textarea
              className={`w-full bg-background border rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 h-28 resize-none ${configError ? "border-danger-500" : "border-neutral-200"}`}
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
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-foreground-500">
                Instructions (Markdown)
                <span className="ml-1 font-normal text-foreground-500">
                  — injected into the agent's system prompt
                </span>
              </label>
            </div>
            <textarea
              className="w-full bg-background border border-neutral-200 rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 h-48 resize-y"
              placeholder={
                "# Skill Name\n\nDescribe what the agent should do when this skill is active…"
              }
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
            <button
              type="button"
              onClick={fetchContent}
              disabled={fetching}
              className="mt-1 text-xs text-primary-400 hover:text-primary-300 disabled:opacity-50"
            >
              {fetching
                ? "Fetching from library…"
                : "Re-fetch from skills library"}
            </button>
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
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Check, Globe2, X } from "lucide-react";
import {
  userApi,
} from "@/lib/api/ts-rest/client";
import type { WorkspaceDetail } from "@/lib/contracts";
import { PRESET_COLORS } from "./types";

/** Inline editor for a workspace's name, description and color. */
export function EditWorkspacePanel({
  workspace,
  onClose,
  onSaved,
}: {
  workspace: WorkspaceDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(workspace.name);
  const [desc, setDesc] = useState(workspace.description ?? "");
  const [color, setColor] = useState(workspace.color);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await userApi.workspaces.update({
      params: { id: workspace.id },
      body: { name, description: desc, color },
    });
    setSaving(false);
    onClose();
    onSaved();
  }

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-2xl overflow-hidden">
      <div className="h-1.5" style={{ backgroundColor: color }} />
      <div className="p-5 flex items-start gap-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{
            backgroundColor: color + "22",
            border: `1px solid ${color}44`,
          }}
        >
          <Globe2 className="w-6 h-6" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-background border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-foreground w-full max-w-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            rows={2}
            className="bg-background border border-neutral-200 rounded-lg px-3 py-1.5 text-sm text-foreground w-full focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            placeholder="Description"
          />
          <div className="flex gap-1.5 flex-wrap">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{
                  backgroundColor: c,
                  borderColor: color === c ? "white" : "transparent",
                  boxShadow: color === c ? `0 0 0 2px ${c}` : "none",
                }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-200 text-foreground-500 hover:text-foreground text-xs transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

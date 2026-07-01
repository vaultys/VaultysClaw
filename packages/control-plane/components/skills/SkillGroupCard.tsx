"use client";

import { useState } from "react";
import {
  Puzzle,
  Plus,
  Pencil,
  Trash2,
  Globe2,
  ChevronDown,
  ChevronRight,
  Shield,
  Users,
  Share2,
} from "lucide-react";
import type { WorkspaceSkillWithMeta } from "@/lib/contracts";
import type { SkillGroup } from "./types";

export function SkillGroupCard({
  group,
  onEdit,
  onDelete,
  onAddToWorkspace,
}: {
  group: SkillGroup;
  onEdit: (entry: WorkspaceSkillWithMeta) => void;
  onDelete: (entry: WorkspaceSkillWithMeta) => void;
  onAddToWorkspace: (group: SkillGroup) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const isShared = group.entries.length > 1;

  return (
    <div className="bg-background-100 border border-neutral-200 rounded-xl overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-background/50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-foreground-500">
          {expanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </span>
        <Puzzle className="w-4 h-4 text-primary-400 flex-shrink-0" />
        <span className="font-mono text-sm font-semibold text-foreground">
          {group.name}
        </span>
        {isShared && (
          <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 border border-primary-300">
            <Share2 className="w-3 h-3" />
            shared · {group.entries.length} workspaces
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {/* Workspace badges */}
          <div className="flex gap-1">
            {group.entries.map((e) => (
              <span
                key={e.id}
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-background border border-neutral-200 text-foreground-500"
              >
                <Globe2 className="w-3 h-3" />
                {e.workspaceName}
              </span>
            ))}
          </div>
          <button
            onClick={(ev) => {
              ev.stopPropagation();
              onAddToWorkspace(group);
            }}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-dashed border-primary-500/50 text-primary-400 hover:bg-primary-500/10 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add to workspace
          </button>
        </div>
      </div>

      {/* Expanded per-workspace detail */}
      {expanded && (
        <div className="border-t border-neutral-200 divide-y divide-neutral-200">
          {group.entries.map((entry) => (
            <div key={entry.id} className="px-4 py-3 flex items-start gap-4">
              {/* Workspace label */}
              <div className="w-36 flex-shrink-0 pt-0.5">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Globe2 className="w-3.5 h-3.5 text-foreground-500" />
                  {entry.workspaceName}
                </div>
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0">
                {entry.description && (
                  <p className="text-xs text-foreground-500 truncate mb-1.5">
                    {entry.description}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {entry.version && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-background border border-neutral-200 text-foreground-500 font-mono">
                      v{entry.version}
                    </span>
                  )}
                  {entry.isRequired && (
                    <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-warning-100 border border-warning-300 text-warning-700">
                      <Shield className="w-3 h-3" /> Required
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-xs text-foreground-500">
                    <Users className="w-3 h-3" />
                    {entry.agentCount} agent
                    {entry.agentCount !== 1 ? "s" : ""}
                    {entry.overrideCount > 0 &&
                      `, ${entry.overrideCount} override${entry.overrideCount !== 1 ? "s" : ""}`}
                  </span>
                  {entry.content ? (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-primary-100 border border-primary-300 text-primary-700">
                      instructions
                    </span>
                  ) : (
                    <span className="text-xs text-foreground-500/50">
                      no instructions
                    </span>
                  )}
                </div>
              </div>

              {/* Config preview */}
              {(() => {
                const cfgStr = entry.config
                  ? typeof entry.config === "string"
                    ? entry.config
                    : JSON.stringify(entry.config)
                  : null;
                return cfgStr && cfgStr !== "{}" ? (
                  <div className="w-40 flex-shrink-0">
                    <pre className="text-xs font-mono text-foreground-500 bg-background border border-neutral-200 rounded px-2 py-1 overflow-hidden whitespace-nowrap text-ellipsis">
                      {cfgStr}
                    </pre>
                  </div>
                ) : null;
              })()}

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => onEdit(entry)}
                  className="p-1.5 rounded hover:bg-background text-foreground-500 hover:text-foreground transition-colors"
                  title="Edit"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDelete(entry)}
                  className="p-1.5 rounded hover:bg-danger-500/10 text-foreground-500 hover:text-danger-500 transition-colors"
                  title="Remove from workspace"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

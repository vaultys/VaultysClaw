"use client";

import React, { useState } from "react";
import {
  Bot,
  GitBranch,
  Clock,
  Type,
  User,
  Wrench,
  Trash2,
  ChevronDown,
  Plus,
  type LucideIcon,
} from "lucide-react";

interface NodePaletteItem {
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind classes for the icon chip (semantic tokens only). */
  chip: string;
}

const NODE_ITEMS: NodePaletteItem[] = [
  {
    type: "agent",
    label: "Agent",
    description: "Run an AI agent",
    icon: Bot,
    chip: "bg-primary-100 text-primary-600",
  },
  {
    type: "condition",
    label: "Condition",
    description: "Branch on a value",
    icon: GitBranch,
    chip: "bg-warning-100 text-warning-600",
  },
  {
    type: "delay",
    label: "Delay",
    description: "Pause execution",
    icon: Clock,
    chip: "bg-background-200 text-foreground-600",
  },
  {
    type: "label",
    label: "Label",
    description: "Annotate the canvas",
    icon: Type,
    chip: "bg-primary-50 text-primary-500",
  },
  {
    type: "user",
    label: "User",
    description: "Human approval step",
    icon: User,
    chip: "bg-primary-100 text-primary-600",
  },
  {
    type: "skill",
    label: "Skill",
    description: "Invoke a skill",
    icon: Wrench,
    chip: "bg-success-100 text-success-600",
  },
];

interface WorkflowToolboxProps {
  onAddNode: (type: string) => void;
  onClear: () => void;
  defaultInput: string;
  onDefaultInputChange: (value: string) => void;
}

/**
 * Floating "toolbox" palette rendered over the canvas. Holds the node-creation
 * buttons (drag-and-drop alternative) and the run-settings (default input),
 * keeping construction tools off the page toolbar.
 */
export const WorkflowToolbox: React.FC<WorkflowToolboxProps> = ({
  onAddNode,
  onClear,
  defaultInput,
  onDefaultInputChange,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute top-4 left-4 z-10 w-60 rounded-xl border border-neutral-200 bg-background-100/95 backdrop-blur shadow-lg shadow-black/5">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Plus className="w-4 h-4 text-primary-600" />
          Toolbox
        </span>
        <ChevronDown
          className={`w-4 h-4 text-foreground-400 transition-transform ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
      </button>

      {!collapsed && (
        <div className="px-2 pb-2">
          <p className="px-1 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-foreground-400">
            Add node
          </p>
          <div className="space-y-1">
            {NODE_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  onClick={() => onAddNode(item.type)}
                  className="w-full flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-background-200 transition-colors group"
                >
                  <span
                    className={`flex items-center justify-center w-7 h-7 rounded-md shrink-0 ${item.chip}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground leading-tight">
                      {item.label}
                    </span>
                    <span className="block text-[11px] text-foreground-500 truncate">
                      {item.description}
                    </span>
                  </span>
                  <Plus className="w-3.5 h-3.5 ml-auto shrink-0 text-foreground-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>

          <div className="mt-2 pt-2 border-t border-neutral-200">
            <label className="block px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-foreground-400">
              Default input
            </label>
            <textarea
              value={defaultInput}
              onChange={(e) => onDefaultInputChange(e.target.value)}
              placeholder="Input for the first node (optional)…"
              rows={2}
              className="w-full resize-none rounded-lg border border-neutral-200 bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-foreground-400 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />

            <button
              onClick={onClear}
              className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg border border-danger-300 px-2 py-1.5 text-xs font-medium text-danger-600 hover:bg-danger-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear canvas
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

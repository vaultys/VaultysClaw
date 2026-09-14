"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { getActorKindMeta } from "@/lib/actor-kinds";
import { cssToken, kindToken } from "./colors";
import { graphNodeHref } from "./types";
import type { GraphTooltipState } from "./useActorForceGraph";

/**
 * Hover detail, rendered by React rather than by the library.
 *
 * The library's own tooltip assigns its label accessor to `innerHTML`, and both `Actor.name` and
 * `ActorLink.label` are operator-entered text — so that accessor is disabled and this takes over.
 * It also gives the one thing a canvas cannot: a real `<a>`, so the node is reachable by
 * middle-click, ⌘-click, and the keyboard.
 */
export function GraphTooltip({
  tooltip,
  onClose,
}: {
  tooltip: GraphTooltipState;
  onClose: () => void;
}) {
  const { node } = tooltip;
  const isWorkspace = node.nodeKind === "workspace";
  const href = graphNodeHref(node);
  const swatch = isWorkspace ? node.workspaceColor ?? cssToken("primary-500") : cssToken(kindToken(node.kind));

  return (
    <div
      className="fixed z-50 bg-background border border-neutral-200 rounded-xl shadow-lg p-3 min-w-[190px] max-w-[280px]"
      style={{ top: tooltip.y + 8, left: tooltip.x + 8 }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="absolute top-2 right-2 text-foreground-400 hover:text-foreground"
        onClick={onClose}
        aria-label="Close"
      >
        <X size={12} />
      </button>

      <div className="flex items-center gap-2 mb-1.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: swatch }} />
        <span className="text-xs font-semibold text-foreground truncate pr-4">{node.label}</span>
      </div>

      <div className="text-xs text-foreground-500 space-y-0.5">
        <div>{isWorkspace ? "Workspace" : getActorKindMeta(node.kind).label}</div>
        {!isWorkspace && node.online !== undefined && (
          <div className="flex items-center gap-1">
            <span
              className={`w-1.5 h-1.5 rounded-full ${node.online ? "bg-success-500" : "bg-neutral-400"}`}
            />
            {node.online ? "Online" : "Offline"}
          </div>
        )}
        <div className="text-foreground-400">
          {node.degree} relationship{node.degree === 1 ? "" : "s"}
        </div>
        <Link
          href={href}
          className="mt-2 flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-500"
        >
          {isWorkspace ? "View workspace" : "View actor page"} →
        </Link>
      </div>
    </div>
  );
}

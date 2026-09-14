"use client";

import { ACTOR_KIND_META } from "@/lib/actor-kinds";
import type { ActorGraphEdgeKind, ActorGraphNode } from "./types";

/**
 * Colours for the WebGL scene, read from the design system rather than re-declared.
 *
 * `app/theme.css` already inverts every token for dark mode, so there is one mapping here and no
 * light/dark branch — `--background-50` is the page ground in both themes. This deliberately does
 * *not* copy `components/map/world-map/types.ts`'s parallel hex tables: that file predates the
 * tokens and has to be kept in sync by hand, which is exactly the drift worth not repeating.
 */

/** Semantic token per Actor kind. Mirrors the badge colours in `lib/actor-kinds.ts`, which are
 *  Tailwind classes and so unusable by a canvas. `__tests__/actor-graph.test.ts` fails if a kind
 *  is added there without a colour here. */
export const KIND_TOKEN: Record<string, string> = {
  human: "success-500",
  openclaw: "primary-500",
  mcp: "secondary-500",
  sensor: "neutral-400",
  device: "warning-500",
  // Red for the two kinds that refuse work rather than only reporting it — same signal the badges
  // and the map pins already carry.
  proxy: "danger-500",
  harness: "danger-500",
};
const DEFAULT_KIND_TOKEN = "neutral-400";

const EDGE_TOKEN: Record<ActorGraphEdgeKind, string> = {
  ownership: "primary-400",
  link: "secondary-400",
  workspace: "neutral-300",
};

/** Opacity per edge kind — workspace membership is context, not a statement about two actors, so
 *  it sits well behind the two real relationships. */
export const EDGE_OPACITY: Record<ActorGraphEdgeKind, number> = {
  ownership: 0.75,
  link: 0.6,
  workspace: 0.18,
};

export interface GraphPalette {
  background: string;
  node: (node: ActorGraphNode) => string;
  edge: (kind: ActorGraphEdgeKind) => string;
  highlight: string;
  dim: string;
}

/** Fallbacks for the one case `getComputedStyle` cannot serve: a token that has not resolved yet
 *  (the very first paint, or a test environment with no stylesheet). Returning `""` there makes
 *  three.js fall back to white, which is unreadable on a light ground. */
const FALLBACK: Record<string, string> = {
  "background-50": "248 250 252",
  "primary-400": "129 140 248",
  "primary-500": "99 102 241",
  "secondary-400": "167 139 250",
  "secondary-500": "139 92 246",
  "success-500": "16 185 129",
  "warning-500": "245 158 11",
  "danger-500": "239 68 68",
  "neutral-300": "212 212 216",
  "neutral-400": "161 161 170",
};
const FALLBACK_DEFAULT = "161 161 170";

/**
 * One design-system token as a colour string the renderer can actually parse.
 *
 * `app/theme.css` stores each token as a bare `r g b` triple, so Tailwind can compose an alpha onto
 * it. That triple is not a colour on its own, and the modern CSS spelling it invites —
 * `rgb(r g b / a)` — is **not** what three.js parses: it falls back to black, which is how this was
 * found (every edge drawn black on the first render while the nodes came out correctly, because
 * they were opaque and took the `rgb()` branch). Comma syntax is understood everywhere.
 */
export function cssToken(token: string, alpha = 1): string {
  const fallback = FALLBACK[token] ?? FALLBACK_DEFAULT;
  const raw =
    typeof window === "undefined"
      ? fallback
      : getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim() || fallback;
  const [r, g, b] = raw.split(/[\s,]+/);
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function kindToken(kind: string): string {
  return KIND_TOKEN[kind] ?? DEFAULT_KIND_TOKEN;
}

/**
 * Resolve the whole palette once per theme change.
 *
 * Snapshotted rather than read per accessor call: the engine asks for a colour per node per frame,
 * and `getComputedStyle` forces style recalculation every time it is called.
 */
export function readPalette(colorBy: "kind" | "workspace"): GraphPalette {
  const kindColors = new Map(
    Object.keys(ACTOR_KIND_META).map((kind) => [kind, cssToken(kindToken(kind))])
  );
  const fallbackNode = cssToken(DEFAULT_KIND_TOKEN);
  const workspaceFallback = cssToken("primary-500");
  const edgeColors = Object.fromEntries(
    (Object.keys(EDGE_TOKEN) as ActorGraphEdgeKind[]).map((k) => [
      k,
      cssToken(EDGE_TOKEN[k], EDGE_OPACITY[k]),
    ])
  ) as Record<ActorGraphEdgeKind, string>;

  return {
    background: cssToken("background-50"),
    node: (node) => {
      if (node.nodeKind === "workspace") return node.workspaceColor ?? workspaceFallback;
      if (colorBy === "workspace") return node.workspaceColor ?? fallbackNode;
      return kindColors.get(node.kind) ?? fallbackNode;
    },
    edge: (kind) => edgeColors[kind],
    highlight: cssToken("warning-500"),
    dim: cssToken("neutral-300", 0.25),
  };
}

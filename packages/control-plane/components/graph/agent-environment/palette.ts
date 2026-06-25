import {
  BookOpen,
  Bot,
  Brain,
  FolderOpen,
  Globe,
  Mail,
  Plug,
  Server,
  Users,
} from "lucide-react";

export type NodeKind =
  | "agent"
  | "cp"
  | "llm"
  | "internet"
  | "files"
  | "knowledge"
  | "peer"
  | "mail"
  | "api";

export interface NodeData {
  kind: NodeKind;
  label: string;
  sublabel?: string;
  badge?: string;
  allowed?: boolean; // capability granted?
  offline?: boolean; // peer is offline — gray out
  rightAlign?: boolean; // right-align text (peer column)
  expiry?: string | null; // policy expiry for this cap (ISO or null = no expiry)
  domains?: string[]; // internet node domain allowlist
  docCount?: number; // knowledge node
}

/**
 * Each kind maps to a coloured left-border accent, a faint tinted background
 * overlay, and a glow. All resolve against design-system CSS variables so the
 * graph adapts to light/dark automatically.
 */
export const PAL: Record<string, { accent: string; tint: string; glow: string }> =
  {
    agent: {
      accent: "rgb(var(--primary-500))",
      tint: "rgba(var(--primary-500),.07)",
      glow: "rgba(var(--primary-500),.18)",
    },
    cp: {
      accent: "rgb(var(--success-400))",
      tint: "rgba(var(--success-400),.06)",
      glow: "rgba(var(--success-400),.14)",
    },
    llm: {
      accent: "rgb(var(--warning-400))",
      tint: "rgba(var(--warning-400),.06)",
      glow: "rgba(var(--warning-400),.14)",
    },
    internet: {
      accent: "rgb(var(--success-400))",
      tint: "rgba(var(--success-400),.06)",
      glow: "rgba(var(--success-400),.14)",
    },
    files: {
      accent: "rgb(var(--primary-400))",
      tint: "rgba(var(--primary-400),.06)",
      glow: "rgba(var(--primary-400),.14)",
    },
    knowledge: {
      accent: "rgb(var(--secondary-400))",
      tint: "rgba(var(--secondary-400),.07)",
      glow: "rgba(var(--secondary-400),.15)",
    },
    peer: {
      accent: "rgb(var(--primary-300))",
      tint: "rgba(var(--primary-300),.05)",
      glow: "rgba(var(--primary-300),.12)",
    },
    peerOffline: {
      accent: "rgb(var(--neutral-500))",
      tint: "rgba(var(--neutral-500),.04)",
      glow: "rgba(var(--neutral-500),.08)",
    },
    mail: {
      accent: "rgb(var(--secondary-400))",
      tint: "rgba(var(--secondary-400),.06)",
      glow: "rgba(var(--secondary-400),.14)",
    },
    api: {
      accent: "rgb(var(--success-400))",
      tint: "rgba(var(--success-400),.06)",
      glow: "rgba(var(--success-400),.13)",
    },
    denied: {
      accent: "rgb(var(--danger-400))",
      tint: "rgba(var(--danger-400),.06)",
      glow: "rgba(var(--danger-400),.14)",
    },
  };

export const EDGE_COLORS = {
  transport: "rgb(var(--primary-500))",
  llm: "rgb(var(--warning-500))",
  internet: "rgb(var(--success-500))",
  files: "rgb(var(--primary-500))",
  knowledge: "rgb(var(--secondary-500))",
  peer: "rgb(var(--primary-300))",
  mail: "rgb(var(--secondary-400))",
  api: "rgb(var(--success-400))",
  denied: "rgb(var(--danger-500))",
} as const;

export const ICON_MAP: Record<NodeKind, React.ElementType> = {
  agent: Bot,
  cp: Server,
  llm: Brain,
  internet: Globe,
  files: FolderOpen,
  knowledge: BookOpen,
  peer: Users,
  mail: Mail,
  api: Plug,
};

/**
 * CSS-variable tokens for theme-aware text inside inline-styled ReactFlow
 * nodes. The browser resolves them at paint time, so they switch automatically
 * when the `.dark` class toggles on `<html>`.
 */
export const CV = {
  text: "rgb(var(--foreground-900))",
  muted: "rgb(var(--foreground-500))",
  subtle: "rgb(var(--foreground-400))",
  surface: "rgb(var(--background-100))",
  raised: "rgb(var(--background-200))",
  border: "rgb(var(--neutral-200))",
};

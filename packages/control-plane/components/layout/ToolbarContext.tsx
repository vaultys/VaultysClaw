"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";

/**
 * A single action rendered on the right side of the page toolbar.
 *
 * - `button` — a clickable button (primary or default style).
 * - `tabs`   — a segmented control to switch between views (e.g. list / map).
 * - `badge`  — a non-interactive status pill (e.g. a "Live" indicator).
 */
export type ToolbarAction =
  | {
      kind: "button";
      id: string;
      label: string;
      icon?: ReactNode;
      onClick: () => void;
      variant?: "primary" | "default";
      disabled?: boolean;
    }
  | {
      kind: "tabs";
      id: string;
      value: string;
      onChange: (value: string) => void;
      options: { value: string; label: string; icon?: ReactNode }[];
    }
  | {
      kind: "badge";
      id: string;
      label: string;
      icon?: ReactNode;
      tone?: "success" | "neutral" | "warning" | "danger";
    };

/** A removable pill shown inside the search bar for an active filter. */
export interface ToolbarSearchChip {
  id: string;
  label: ReactNode;
  onRemove: () => void;
}

/** A single selectable option inside a filter group (a column of the panel). */
export interface ToolbarFilterOption {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  active: boolean;
  onToggle: () => void;
}

/** A column of related filter/group-by options in the advanced search panel. */
export interface ToolbarFilterGroup {
  id: string;
  label: string;
  icon?: ReactNode;
  options: ToolbarFilterOption[];
  /** Optional "clear" action rendered at the bottom of the column. */
  onClear?: () => void;
}

/**
 * Odoo-style advanced search bar: a text input prefixed with removable filter
 * chips, plus an expandable panel of filter groups (columns).
 */
export interface ToolbarSearchConfig {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Active filters shown as removable chips left of the input. */
  chips?: ToolbarSearchChip[];
  /** Columns rendered inside the expandable filter panel. */
  filterGroups?: ToolbarFilterGroup[];
}

/** A single step in the toolbar step indicator. */
export interface ToolbarStep {
  id: string;
  label: string;
}

/**
 * A wizard-style step indicator rendered in the center of the toolbar (e.g. the
 * create-agent flow). `current` is the zero-based index of the active step.
 */
export interface ToolbarStepsConfig {
  current: number;
  steps: ToolbarStep[];
  /**
   * When set, completed steps (index < current) become clickable to navigate
   * back. Receives the zero-based index of the clicked step.
   */
  onStepClick?: (index: number) => void;
}

export interface ToolbarConfig {
  /** Page title shown on the left of the toolbar. */
  title: string;
  /** Optional subtitle / description shown under the title. */
  description?: ReactNode;
  /** Optional advanced search bar rendered in the center of the toolbar. */
  search?: ToolbarSearchConfig;
  /**
   * Optional step indicator rendered in the center of the toolbar. Takes
   * precedence over `search` when both are set.
   */
  steps?: ToolbarStepsConfig;
  /** Actions rendered on the right, in order. */
  actions?: ToolbarAction[];
}

interface ToolbarContextValue {
  config: ToolbarConfig | null;
  setConfig: (config: ToolbarConfig | null) => void;
}

const ToolbarContext = createContext<ToolbarContextValue>({
  config: null,
  setConfig: () => {},
});

export function ToolbarProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ToolbarConfig | null>(null);
  return (
    <ToolbarContext.Provider value={{ config, setConfig }}>
      {children}
    </ToolbarContext.Provider>
  );
}

/** Internal: read the current toolbar config (used by the shell to render it). */
export function useToolbarState() {
  return useContext(ToolbarContext);
}

/**
 * Configure the page toolbar from a page component.
 *
 * Call this once in your page with the toolbar config and a dependency list of
 * everything the config closes over (title, counts, view state, handlers …).
 * The toolbar is cleared automatically when the page unmounts.
 *
 * @example
 * useToolbar(
 *   {
 *     title: "Agents",
 *     description: `${total} registered · ${online} online`,
 *     actions: [
 *       { kind: "badge", id: "live", label: "Live", tone: "success" },
 *       {
 *         kind: "tabs",
 *         id: "view",
 *         value: viewMode,
 *         onChange: setViewMode,
 *         options: [
 *           { value: "list", label: "List", icon: <List size={14} /> },
 *           { value: "map", label: "Map", icon: <Map size={14} /> },
 *         ],
 *       },
 *       {
 *         kind: "button",
 *         id: "create",
 *         label: "Create agent",
 *         icon: <Plus size={14} />,
 *         variant: "primary",
 *         onClick: () => router.push("/agents/create"),
 *       },
 *     ],
 *   },
 *   [total, online, viewMode],
 * );
 */
export function useToolbar(config: ToolbarConfig, deps: DependencyList) {
  const { setConfig } = useToolbarState();
  useEffect(() => {
    setConfig(config);
    return () => setConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

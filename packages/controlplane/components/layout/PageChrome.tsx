"use client";

import { useRouter } from "next/navigation";
import { useToolbar, type ToolbarConfig, type ToolbarAction } from "./ToolbarContext";
import { useBreadcrumbs, type Breadcrumb } from "./BreadcrumbContext";

/**
 * A toolbar button action described as data (an href to navigate to) rather
 * than a closure — a Server Component page can't pass a plain `onClick`
 * function across the RSC boundary to this Client Component, only a Server
 * Action (a different calling convention) or serializable data like this.
 */
export interface LinkAction {
  kind: "button";
  id: string;
  label: string;
  href: string;
  variant?: "primary" | "default" | "danger" | "success";
  icon?: React.ReactNode;
}

export type ChromeAction = LinkAction | Extract<ToolbarAction, { kind: "badge" }>;

export interface ChromeToolbarConfig extends Omit<ToolbarConfig, "actions"> {
  actions?: ChromeAction[];
}

/**
 * Bridges a server-rendered page's data into the toolbar/breadcrumb client
 * context. Server Components can't call the `useToolbar`/`useBreadcrumbs`
 * hooks directly, so pages render this leaf with pre-computed, serializable
 * props instead. Renders nothing — side effect only. Freshly mounted per
 * navigation, so an empty dependency list is correct (not just "run once ever").
 */
export default function PageChrome({
  toolbar,
  breadcrumbs,
}: {
  toolbar: ChromeToolbarConfig;
  breadcrumbs: Breadcrumb[];
}) {
  const router = useRouter();

  const actions: ToolbarAction[] | undefined = toolbar.actions?.map((action) =>
    action.kind === "badge"
      ? action
      : { ...action, onClick: () => router.push(action.href) }
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useToolbar({ ...toolbar, actions }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useBreadcrumbs(breadcrumbs, []);
  return null;
}

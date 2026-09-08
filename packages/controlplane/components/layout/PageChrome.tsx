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
 * props instead. Renders nothing — side effect only.
 *
 * A route whose toolbar content depends on `searchParams` (e.g. a `?tab=`
 * switch) only gets a fresh RSC render on navigation, not a remount of this
 * already-mounted Client Component — so the dependency array can't be empty
 * (that would freeze the toolbar at whatever it was on first mount) or the
 * raw `toolbar`/`actions` objects (fresh references every render regardless
 * of real changes, since callers always pass inline JSX literals — depending
 * on those re-fires the effect every render, and each firing updates context
 * state that itself triggers a re-render up the tree, looping forever).
 * Instead this depends on a JSON key of just the serializable content
 * (`icon`/`onClick` excluded — a ReactNode/function, and irrelevant to
 * whether the toolbar's actual content changed), so the effect only re-runs
 * when something a user would actually see has changed.
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

  const toolbarKey = JSON.stringify({
    title: toolbar.title,
    info: toolbar.info,
    description: toolbar.description,
    steps: toolbar.steps,
    search: toolbar.search,
    actions: toolbar.actions?.map((a) =>
      a.kind === "badge" ? { kind: a.kind, id: a.id, label: a.label, tone: a.tone } : { kind: a.kind, id: a.id, label: a.label, href: a.href, variant: a.variant }
    ),
  });
  const breadcrumbsKey = JSON.stringify(breadcrumbs);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useToolbar({ ...toolbar, actions }, [toolbarKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useBreadcrumbs(breadcrumbs, [breadcrumbsKey]);
  return null;
}

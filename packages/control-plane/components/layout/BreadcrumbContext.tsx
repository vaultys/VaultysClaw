"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type DependencyList,
  type ReactNode,
} from "react";

/** A single breadcrumb segment shown in the TopBar. */
export interface Breadcrumb {
  label: ReactNode;
  /** When set, the segment is a link. The last segment is usually plain text. */
  href?: string;
}

interface BreadcrumbContextValue {
  breadcrumbs: Breadcrumb[];
  setBreadcrumbs: (breadcrumbs: Breadcrumb[]) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
  breadcrumbs: [],
  setBreadcrumbs: () => {},
});

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([]);
  return (
    <BreadcrumbContext.Provider value={{ breadcrumbs, setBreadcrumbs }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

/** Internal: read the current breadcrumbs (used by the TopBar to render them). */
export function useBreadcrumbsState() {
  return useContext(BreadcrumbContext);
}

/**
 * Set the TopBar breadcrumbs from a page component. Cleared automatically when
 * the page unmounts. Pass a dependency list of everything the items close over.
 *
 * @example
 * useBreadcrumbs(
 *   [{ label: "Agents", href: "/agents" }, { label: "New agent" }],
 *   [],
 * );
 */
export function useBreadcrumbs(items: Breadcrumb[], deps: DependencyList) {
  const { setBreadcrumbs } = useBreadcrumbsState();
  useEffect(() => {
    setBreadcrumbs(items);
    return () => setBreadcrumbs([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

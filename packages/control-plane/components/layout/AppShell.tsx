"use client";

import { signOut, useSession } from "next-auth/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import Toolbar from "./Toolbar";
import { ToolbarProvider } from "./ToolbarContext";
import { BreadcrumbProvider } from "./BreadcrumbContext";
import WorkflowApprovalInbox from "@/components/workflow/WorkflowApprovalInbox";

// Pages that bypass the app shell entirely (standalone layouts).
// Auth on these routes is handled by the page itself.
const STANDALONE_PATHS = [
  "/",
  "/login",
  "/admin/setup",
  "/quick-start",
  "/admin/mission-control/fullscreen",
  "/invite/*",
];

// Pages that show only the TopBar (no sidebar). Used for full-screen flows
// that still need the global nav context (e.g. VaultysId claim after OIDC login).
const TOPBAR_ONLY_PATHS = ["/claim"];

/**
 * Match a pathname against a list of patterns. A trailing `/*` is a prefix
 * wildcard (`/invite/*` matches `/invite` and `/invite/abc`); every other
 * entry is matched exactly.
 */
function matchesPath(pathname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.endsWith("/*")) {
      const base = pattern.slice(0, -2);
      return pathname === base || pathname.startsWith(`${base}/`);
    }
    return pathname === pattern;
  });
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();

  // Read sidebar preference from localStorage after mount
  useEffect(() => {
    const stored = localStorage.getItem("vc-sidebar-collapsed");
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  // Guard against a stale-but-valid JWT after the underlying user is gone
  // (account deleted / database reset). The session callback blanks such an
  // identity to did=null AND userId=null (an unclaimed OIDC user still has a
  // userId, so it is not caught here). Sign out to clear the cookie — this also
  // makes the proxy stop granting access on subsequent requests.
  useEffect(() => {
    if (
      status === "authenticated" &&
      session &&
      !session.user?.did &&
      !session.user?.userId
    ) {
      void signOut({ callbackUrl: "/login" });
    }
  }, [status, session]);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("vc-sidebar-collapsed", String(next));
      return next;
    });
  };

  // Standalone pages (login): render children only
  if (matchesPath(pathname, STANDALONE_PATHS)) {
    return <>{children}</>;
  }

  // Top-bar-only pages (claim): render TopBar + full-height content, no sidebar
  if (matchesPath(pathname, TOPBAR_ONLY_PATHS)) {
    return (
      <BreadcrumbProvider>
        <div className="flex flex-col h-screen overflow-hidden bg-background text-foreground">
          <TopBar />
          <main className="flex-1 flex flex-col overflow-y-auto bg-background">
            {children}
          </main>
        </div>
      </BreadcrumbProvider>
    );
  }

  // Still loading session or authenticated: render full shell
  // (we show the shell skeleton even while loading to avoid layout flash)
  return (
    <BreadcrumbProvider>
      <ToolbarProvider>
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
          <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <TopBar />
            <Toolbar />
            <WorkflowApprovalInbox />
            <main className="flex-1 flex flex-col overflow-y-auto bg-background">
              {status === "loading" ? (
                <div className="flex items-center justify-center h-full">
                  <div className="w-7 h-7 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                children
              )}
            </main>
          </div>
        </div>
      </ToolbarProvider>
    </BreadcrumbProvider>
  );
}

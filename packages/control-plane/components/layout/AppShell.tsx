"use client";

import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import WorkflowApprovalInbox from "@/components/workflow/WorkflowApprovalInbox";

// Pages that bypass the app shell entirely (standalone layouts)
const STANDALONE_PATHS = ["/login", "/setup"];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Read sidebar preference from localStorage after mount
  useEffect(() => {
    const stored = localStorage.getItem("vc-sidebar-collapsed");
    if (stored !== null) setCollapsed(stored === "true");
  }, []);

  const toggleSidebar = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("vc-sidebar-collapsed", String(next));
      return next;
    });
  };

  // Standalone pages (login): render children only
  if (STANDALONE_PATHS.includes(pathname)) {
    return <>{children}</>;
  }

  // Unauthenticated on non-login pages (landing page at /): render children only
  if (status === "unauthenticated") {
    return <>{children}</>;
  }

  // Still loading session or authenticated: render full shell
  // (we show the shell skeleton even while loading to avoid layout flash)
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar collapsed={collapsed} onToggle={toggleSidebar} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <WorkflowApprovalInbox />
        <main className="flex-1 flex flex-col overflow-y-auto bg-background">
          {status === "loading" ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-7 h-7 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}

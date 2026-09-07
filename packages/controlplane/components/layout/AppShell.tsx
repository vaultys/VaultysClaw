"use client";

import { useState } from "react";
import AdminCommandPalette, { type AdminCommandItem } from "./AdminCommandPalette";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import Toolbar from "./Toolbar";
import { ToolbarProvider } from "./ToolbarContext";
import { BreadcrumbProvider } from "./BreadcrumbContext";

/**
 * The admin console chrome — sidebar + top bar + page toolbar. The
 * authentication/capability gate lives in app/admin/layout.tsx (a server
 * component); this only renders once that gate has already passed.
 */
export default function AppShell({
  children,
  orgName,
  commandItems,
}: {
  children: React.ReactNode;
  orgName: string;
  commandItems: AdminCommandItem[];
}) {
  const [commandOpen, setCommandOpen] = useState(false);

  return (
    <BreadcrumbProvider>
      <ToolbarProvider>
        <div className="flex h-screen overflow-hidden bg-background text-foreground">
          <Sidebar orgName={orgName} />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <TopBar onOpenCommand={() => setCommandOpen(true)} />
            <Toolbar />
            <main className="flex-1 flex flex-col overflow-y-auto bg-background">{children}</main>
          </div>
        </div>
        <AdminCommandPalette
          open={commandOpen}
          onOpenChange={setCommandOpen}
          items={commandItems}
        />
      </ToolbarProvider>
    </BreadcrumbProvider>
  );
}

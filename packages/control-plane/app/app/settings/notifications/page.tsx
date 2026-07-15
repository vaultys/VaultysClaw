"use client";

import { NotificationsTab } from "@/components/settings/NotificationsTab";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";

export default function NotificationsSettingsPage() {
  useBreadcrumbs(
    [
      { label: "Settings", href: "/app/settings/profile" },
      { label: "Notifications" },
    ],
    []
  );
  useToolbar(
    {
      title: "Settings",
      description: "Choose what you get notified about and how",
    },
    []
  );

  return (
    <div className="p-6 w-full max-w-3xl mx-auto space-y-5">
      <NotificationsTab />
    </div>
  );
}

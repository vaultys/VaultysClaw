"use client";

import { AppearanceTab } from "@/components/settings/AppearanceTab";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";

export default function AppearanceSettingsPage() {
  useBreadcrumbs(
    [
      { label: "Settings", href: "/app/settings/profile" },
      { label: "Appearance" },
    ],
    []
  );
  useToolbar(
    { title: "Settings", description: "Customize the look and feel" },
    []
  );

  return (
    <div className="p-6 w-full max-w-3xl mx-auto space-y-5">
      <AppearanceTab />
    </div>
  );
}

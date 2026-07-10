"use client";

import { WorkspacesTab } from "@/components/settings/WorkspacesTab";
import { useSettingsData } from "@/components/settings/SettingsContext";
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";

export default function WorkspacesSettingsPage() {
  const { workspaces, loading } = useSettingsData();

  useBreadcrumbs(
    [
      { label: "Settings", href: "/admin/settings/profile" },
      { label: "Workspaces" },
    ],
    []
  );
  useToolbar(
    { title: "Settings", description: "Your workspace memberships" },
    []
  );

  if (loading) return <SettingsSkeleton />;
  return (
    <div className="p-6 w-full max-w-3xl mx-auto space-y-5">
      <WorkspacesTab workspaces={workspaces} />
    </div>
  );
}

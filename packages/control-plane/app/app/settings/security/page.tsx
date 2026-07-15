"use client";

import { SecurityTab } from "@/components/settings/SecurityTab";
import { useSettingsData } from "@/components/settings/SettingsContext";
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";

export default function SecuritySettingsPage() {
  const { profile, loading } = useSettingsData();

  useBreadcrumbs(
    [
      { label: "Settings", href: "/app/settings/profile" },
      { label: "Security" },
    ],
    []
  );
  useToolbar(
    { title: "Settings", description: "Manage your security settings" },
    []
  );

  if (loading) return <SettingsSkeleton />;
  return (
    <div className="p-6 w-full max-w-3xl mx-auto space-y-5">
      <SecurityTab profile={profile} />
    </div>
  );
}

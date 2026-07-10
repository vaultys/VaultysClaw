"use client";

import { ApiKeysSection } from "@/components/settings/ApiKeysSection";
import { useSettingsData } from "@/components/settings/SettingsContext";
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";

export default function ApiKeysSettingsPage() {
  const { isAdmin, loading } = useSettingsData();

  useBreadcrumbs(
    [
      { label: "Settings", href: "/admin/settings/profile" },
      { label: "API Keys" },
    ],
    []
  );
  useToolbar(
    { title: "Settings", description: "Manage your API keys" },
    []
  );

  if (loading) return <SettingsSkeleton />;
  if (!isAdmin) {
    return (
      <div className="p-6 w-full max-w-2xl mx-auto">
        <div className="bg-warning-50 border border-warning-300 rounded-xl px-4 py-3 text-warning-700 text-sm">
          You must be an administrator or owner to manage API keys.
        </div>
      </div>
    );
  }
  return (
    <div className="p-6 w-full max-w-3xl mx-auto space-y-5">
      <ApiKeysSection />
    </div>
  );
}

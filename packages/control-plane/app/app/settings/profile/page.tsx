"use client";

import { ProfileTab } from "@/components/settings/ProfileTab";
import { useSettingsData } from "@/components/settings/SettingsContext";
import { SettingsSkeleton } from "@/components/settings/SettingsSkeleton";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";

export default function ProfileSettingsPage() {
  const { profile, patchProfile, loading } = useSettingsData();

  useBreadcrumbs(
    [{ label: "Settings", href: "/app/settings/profile" }, { label: "Profile" }],
    []
  );
  useToolbar({ title: "Settings", description: "Manage your profile" }, []);

  if (loading) return <SettingsSkeleton />;
  return (
    <div className="p-6 w-full max-w-3xl mx-auto space-y-5">
      <ProfileTab profile={profile} onPatch={patchProfile} />
    </div>
  );
}

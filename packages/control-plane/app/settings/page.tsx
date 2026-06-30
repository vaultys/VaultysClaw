"use client";

import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { Sun, Shield, Key, User, Globe2 } from "lucide-react";
import { usersClient, unwrap, realmsClient } from "@/lib/api/ts-rest/client";
import type { MeProfile, UserRealmWithRealm } from "@/lib/contracts";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import { ProfileTab } from "@/components/settings/ProfileTab";
import { SecurityTab } from "@/components/settings/SecurityTab";
import { RealmsTab } from "@/components/settings/RealmsTab";
import { AppearanceTab } from "@/components/settings/AppearanceTab";
import { ApiKeysSection } from "@/components/settings/ApiKeysSection";
import { isAdminRole } from "@/lib/roles";

type Tab = "profile" | "security" | "api-keys" | "realms" | "appearance";

const TABS: {
  id: Tab;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "security", label: "Security", icon: Shield },
  { id: "api-keys", label: "API Keys", icon: Key, adminOnly: true },
  { id: "realms", label: "Realms", icon: Globe2 },
  { id: "appearance", label: "Appearance", icon: Sun },
];

export default function AccountPage() {
  const { data: session } = useSession();

  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [realms, setRealms] = useState<UserRealmWithRealm[]>([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("profile");

  useEffect(() => {
    if (!session?.user) return;
    Promise.all([usersClient.me(), realmsClient.listMyRealms()])
      .then(([meRes, realmsRes]) => {
        setProfile(unwrap(meRes));
        setRealms(unwrap(realmsRes).userRealms);
      })
      .catch(() => {})
      .finally(() => setProfileLoading(false));
  }, [session?.user]);

  const patchProfile = async (fields: {
    name?: string;
    email?: string;
    description?: string;
  }) => {
    const data = unwrap(await usersClient.updateMe({ body: fields }));
    setProfile((p) =>
      p
        ? {
            ...p,
            name: data.name,
            email: data.email,
            description: data.description,
          }
        : p
    );
  };

  const isAdmin = isAdminRole(profile?.role);
  const visibleTabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  useBreadcrumbs([{ label: "Account" }], []);

  useToolbar(
    {
      title: "Account",
      description: "Manage your profile, security, and preferences",
      actions: [
        {
          kind: "tabs",
          id: "tab",
          value: activeTab,
          onChange: (v) => setActiveTab(v as Tab),
          options: visibleTabs.map((t) => ({
            value: t.id,
            label: t.label,
            icon: <t.icon className="w-3.5 h-3.5" />,
          })),
        },
      ],
    },
    [activeTab, isAdmin]
  );

  if (profileLoading) {
    return (
      <div className="p-6 w-full max-w-3xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-10 bg-background-200 rounded-xl w-2/3" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-background-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 w-full max-w-3xl mx-auto space-y-5">
      {activeTab === "profile" && (
        <ProfileTab profile={profile} onPatch={patchProfile} />
      )}
      {activeTab === "security" && <SecurityTab profile={profile} />}
      {activeTab === "api-keys" && isAdmin && <ApiKeysSection />}
      {activeTab === "realms" && <RealmsTab realms={realms} />}
      {activeTab === "appearance" && <AppearanceTab />}
    </div>
  );
}

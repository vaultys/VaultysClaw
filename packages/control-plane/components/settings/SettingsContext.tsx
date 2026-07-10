"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "next-auth/react";
import { userApi, unwrap } from "@/lib/api/ts-rest/client";
import type { MeProfile, UserWorkspaceWithWorkspace } from "@/lib/contracts";
import { isAdminRole } from "@/lib/roles";

interface SettingsData {
  profile: MeProfile | null;
  workspaces: UserWorkspaceWithWorkspace[];
  loading: boolean;
  isAdmin: boolean;
  patchProfile: (fields: {
    name?: string;
    email?: string;
    description?: string;
  }) => Promise<void>;
}

const SettingsContext = createContext<SettingsData | null>(null);

export function SettingsDataProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [workspaces, setWorkspaces] = useState<UserWorkspaceWithWorkspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.user) return;
    Promise.all([userApi.users.me(), userApi.workspaces.listMyWorkspaces()])
      .then(([meRes, workspacesRes]) => {
        setProfile(unwrap(meRes));
        setWorkspaces(unwrap(workspacesRes).userWorkspaces);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [session?.user]);

  const patchProfile = async (fields: {
    name?: string;
    email?: string;
    description?: string;
  }) => {
    const data = unwrap(await userApi.users.updateMe({ body: fields }));
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

  const value: SettingsData = {
    profile,
    workspaces,
    loading,
    isAdmin: isAdminRole(profile?.role),
    patchProfile,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettingsData(): SettingsData {
  const ctx = useContext(SettingsContext);
  if (!ctx)
    throw new Error("useSettingsData must be used within SettingsDataProvider");
  return ctx;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminApi,
  userApi,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { MapMarker, WorkspaceDetail, WorkspaceSkill } from "@/lib/contracts";
import type { WorkspaceRouterKeyData } from "@/components/workspaces/WorkspaceLiteLLMKeyCard";
import type { Channel } from "@vaultysclaw/shared";
import type { WorkspaceModelRow } from "../components/workspaces/types";

/**
 * Owns all server state for the workspace detail page: the workspace payload, its
 * skills / models / channels, map markers, and the mutating actions. UI-only
 * state (active tab, open modals, inline-edit) stays in the page component.
 */
export function useWorkspaceDetail(id: string) {
  const router = useRouter();

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<WorkspaceSkill[]>([]);
  const [workspaceModels, setWorkspaceModels] = useState<WorkspaceModelRow[]>([]);
  const [routerKey, setRouterKey] = useState<WorkspaceRouterKeyData | null>(null);
  const [litellmConfigured, setLitellmConfigured] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [mapLoading, setMapLoading] = useState(false);

  const load = useCallback(async () => {
    const [workspaceRes, skillsRes, modelsRes, channelsRes] = await Promise.all([
      userApi.workspaces.getOne({ params: { id } }),
      userApi.workspaces.listSkills({ params: { id } }),
      userApi.workspaces.listModels({ params: { id } }),
      adminApi.channels.list({ query: { workspace: id } }),
    ]);
    if (workspaceRes.status === 404) {
      router.replace("/workspaces");
      return;
    }
    setWorkspace(unwrap(workspaceRes));
    setSkills(unwrap(skillsRes).skills ?? []);
    if (modelsRes.status === 200) {
      const modelsData = modelsRes.body as unknown as {
        models: WorkspaceModelRow[];
        routerKey: WorkspaceRouterKeyData | null;
        litellmConfigured: boolean;
      };
      setWorkspaceModels(modelsData.models ?? []);
      setRouterKey(modelsData.routerKey);
      setLitellmConfigured(modelsData.litellmConfigured ?? false);
    }
    if (channelsRes.status === 200) {
      setChannels(channelsRes.body.channels ?? []);
    }
    setLoading(false);
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshMapMarkers = useCallback(() => {
    setMapLoading(true);
    userApi.map
      .get({ query: { workspace: id } })
      .then((r) => setMapMarkers(r.status === 200 ? r.body.markers : []))
      .catch(() => {})
      .finally(() => setMapLoading(false));
  }, [id]);

  const saveWorkspaceMarkerLocation = useCallback(
    async (
      marker: MapMarker,
      loc: { lat: number; lon: number; label: string } | null
    ) => {
      const body =
        loc === null
          ? { lat: null }
          : { lat: loc.lat, lon: loc.lon, label: loc.label };
      if (marker.type === "agent")
        unwrap(
          await adminApi.agents.setLocation({ params: { did: marker.id }, body })
        );
      else if (marker.type === "user")
        unwrap(
          await adminApi.users.setLocation({ params: { did: marker.id }, body })
        );
      else return;
      refreshMapMarkers();
    },
    [refreshMapMarkers]
  );

  const removeAgent = useCallback(
    async (did: string) => {
      if (!confirm("Remove agent from this workspace?")) return;
      await userApi.workspaces.removeAgent({
        params: { id },
        body: { agentDid: did },
      });
      load();
    },
    [id, load]
  );

  const removeUser = useCallback(
    async (did: string) => {
      if (!confirm("Remove user from this workspace?")) return;
      await userApi.workspaces.removeUser({ params: { id }, body: { userDid: did } });
      load();
    },
    [id, load]
  );

  const setUserRole = useCallback(
    async (did: string, role: "Admin" | "Member") => {
      unwrap(
        await userApi.workspaces.updateUser({
          params: { id },
          body: { userDid: did, role },
        })
      );
      load();
    },
    [id, load]
  );

  const transferOwner = useCallback(
    async (did: string) => {
      if (!confirm("Transfer ownership of this workspace to this user?")) return;
      unwrap(
        await userApi.workspaces.transferOwner({
          params: { id },
          body: { userDid: did },
        })
      );
      load();
    },
    [id, load]
  );

  const setDefault = useCallback(async () => {
    await adminApi.workspaces.setDefault({ params: { id } });
    load();
  }, [id, load]);

  const remove = useCallback(async () => {
    if (!confirm("Delete this workspace? This cannot be undone.")) return;
    await userApi.workspaces.remove({ params: { id } });
    router.push("/workspaces");
  }, [id, router]);

  return {
    workspace,
    loading,
    agents: workspace?.agentWorkspaces ?? [],
    users: workspace?.userWorkspaces ?? [],
    workflows: workspace?.workflows ?? [],
    tokenUsage: workspace?.tokenUsage ?? null,
    skills,
    workspaceModels,
    routerKey,
    litellmConfigured,
    channels,
    setChannels,
    mapMarkers,
    mapLoading,
    refreshMapMarkers,
    saveWorkspaceMarkerLocation,
    load,
    removeAgent,
    removeUser,
    setUserRole,
    transferOwner,
    setDefault,
    remove,
  };
}

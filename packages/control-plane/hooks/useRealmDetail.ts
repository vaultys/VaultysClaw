"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  agentsClient,
  channelsClient,
  mapClient,
  realmsClient,
  usersClient,
  unwrap,
} from "@/lib/api/ts-rest/client";
import type { MapMarker, RealmDetail, RealmSkill } from "@/lib/contracts";
import type { RealmRouterKeyData } from "@/components/realms/RealmLiteLLMKeyCard";
import type { Channel } from "@vaultysclaw/shared";
import type { RealmModelRow } from "../components/realms/types";

/**
 * Owns all server state for the realm detail page: the realm payload, its
 * skills / models / channels, map markers, and the mutating actions. UI-only
 * state (active tab, open modals, inline-edit) stays in the page component.
 */
export function useRealmDetail(id: string) {
  const router = useRouter();

  const [realm, setRealm] = useState<RealmDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState<RealmSkill[]>([]);
  const [realmModels, setRealmModels] = useState<RealmModelRow[]>([]);
  const [routerKey, setRouterKey] = useState<RealmRouterKeyData | null>(null);
  const [litellmConfigured, setLitellmConfigured] = useState(false);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [mapMarkers, setMapMarkers] = useState<MapMarker[]>([]);
  const [mapLoading, setMapLoading] = useState(false);

  const load = useCallback(async () => {
    const [realmRes, skillsRes, modelsRes, channelsRes] = await Promise.all([
      realmsClient.getOne({ params: { id } }),
      realmsClient.listSkills({ params: { id } }),
      realmsClient.listModels({ params: { id } }),
      channelsClient.list({ query: { realm: id } }),
    ]);
    if (realmRes.status === 404) {
      router.replace("/realms");
      return;
    }
    setRealm(unwrap(realmRes));
    setSkills(unwrap(skillsRes).skills ?? []);
    if (modelsRes.status === 200) {
      const modelsData = modelsRes.body as unknown as {
        models: RealmModelRow[];
        routerKey: RealmRouterKeyData | null;
        litellmConfigured: boolean;
      };
      setRealmModels(modelsData.models ?? []);
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
    mapClient
      .get({ query: { realm: id } })
      .then((r) => setMapMarkers(r.status === 200 ? r.body.markers : []))
      .catch(() => {})
      .finally(() => setMapLoading(false));
  }, [id]);

  const saveRealmMarkerLocation = useCallback(
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
          await agentsClient.setLocation({ params: { did: marker.id }, body })
        );
      else if (marker.type === "user")
        unwrap(
          await usersClient.setLocation({ params: { did: marker.id }, body })
        );
      else return;
      refreshMapMarkers();
    },
    [refreshMapMarkers]
  );

  const removeAgent = useCallback(
    async (did: string) => {
      if (!confirm("Remove agent from this realm?")) return;
      await realmsClient.removeAgent({
        params: { id },
        body: { agentDid: did },
      });
      load();
    },
    [id, load]
  );

  const removeUser = useCallback(
    async (did: string) => {
      if (!confirm("Remove user from this realm?")) return;
      await realmsClient.removeUser({ params: { id }, body: { userDid: did } });
      load();
    },
    [id, load]
  );

  const setDefault = useCallback(async () => {
    await realmsClient.setDefault({ params: { id } });
    load();
  }, [id, load]);

  const remove = useCallback(async () => {
    if (!confirm("Delete this realm? This cannot be undone.")) return;
    await realmsClient.remove({ params: { id } });
    router.push("/realms");
  }, [id, router]);

  return {
    realm,
    loading,
    agents: realm?.agentRealms ?? [],
    users: realm?.userRealms ?? [],
    workflows: realm?.workflows ?? [],
    tokenUsage: realm?.tokenUsage ?? null,
    skills,
    realmModels,
    routerKey,
    litellmConfigured,
    channels,
    setChannels,
    mapMarkers,
    mapLoading,
    refreshMapMarkers,
    saveRealmMarkerLocation,
    load,
    removeAgent,
    removeUser,
    setDefault,
    remove,
  };
}

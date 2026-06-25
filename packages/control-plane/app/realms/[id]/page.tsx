"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Network, Pencil, Star, Trash2 } from "lucide-react";
import { useToolbar } from "@/components/layout/ToolbarContext";
import { useBreadcrumbs } from "@/components/layout/BreadcrumbContext";
import EmbeddedOrgChart from "@/components/graph/EmbeddedOrgChart";
import { useRole } from "@/hooks/useRole";
import { AddMemberModal } from "../../../components/realms/AddMemberModal";
import { AgentsTab } from "../../../components/realms/AgentsTab";
import { ChannelsTab } from "../../../components/realms/ChannelsTab";
import { ConfigTab } from "../../../components/realms/ConfigTab";
import { EditRealmPanel } from "../../../components/realms/EditRealmPanel";
import { MapTab } from "../../../components/realms/MapTab";
import { ModelsTab } from "../../../components/realms/ModelsTab";
import { RealmTabBar } from "../../../components/realms/RealmTabBar";
import { SkillsTab } from "../../../components/realms/SkillsTab";
import { TokenMetricsCards } from "../../../components/realms/TokenMetricsCards";
import { UsersTab } from "../../../components/realms/UsersTab";
import { WorkflowsTab } from "../../../components/realms/WorkflowsTab";
import { useRealmDetail } from "../../../hooks/useRealmDetail";
import type { RealmTab } from "../../../components/realms/types";

export default function RealmDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { isGlobalAdmin } = useRole();

  const {
    realm,
    loading,
    agents,
    users,
    workflows,
    tokenUsage,
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
  } = useRealmDetail(id);

  const [tab, setTab] = useState<RealmTab>("agents");
  const [addModal, setAddModal] = useState<"agent" | "user" | null>(null);
  const [editing, setEditing] = useState(false);

  useBreadcrumbs(
    [{ label: "Realms", href: "/realms" }, { label: realm?.name ?? "Realm" }],
    [realm?.name]
  );

  useToolbar(
    {
      title: realm?.name ?? "Realm",
      description: realm ? (
        <span className="flex items-center gap-2 flex-wrap">
          <code className="font-mono text-foreground-400">{realm.slug}</code>
          {realm.description && (
            <span className="text-foreground-500">· {realm.description}</span>
          )}
          <span className="text-foreground-400">
            · {agents.length} agent{agents.length !== 1 ? "s" : ""} ·{" "}
            {users.length} user{users.length !== 1 ? "s" : ""} ·{" "}
            {workflows.length} workflow{workflows.length !== 1 ? "s" : ""} ·{" "}
            {(tokenUsage?.promptTokens ?? 0).toLocaleString()} in /{" "}
            {(tokenUsage?.completionTokens ?? 0).toLocaleString()} out tokens
          </span>
        </span>
      ) : (
        "Loading…"
      ),
      actions: realm
        ? [
            {
              kind: "button",
              id: "graph",
              label: "Graph",
              icon: <Network className="w-3.5 h-3.5" />,
              onClick: () => router.push(`/realms/${id}/graph`),
            },
            {
              kind: "button",
              id: "edit",
              label: "Edit",
              icon: <Pencil className="w-3.5 h-3.5" />,
              onClick: () => setEditing(true),
            },
            {
              kind: "button",
              id: "default",
              label: realm.isDefault ? "Default" : "Set default",
              icon: <Star className="w-3.5 h-3.5" />,
              variant: realm.isDefault ? "success" : "default",
              disabled: realm.isDefault,
              onClick: setDefault,
            },
            {
              kind: "button",
              id: "delete",
              label: "Delete",
              icon: <Trash2 className="w-3.5 h-3.5" />,
              variant: "danger",
              disabled: realm.isDefault,
              onClick: remove,
            },
          ]
        : [],
    },
    [
      realm,
      agents.length,
      users.length,
      workflows.length,
      tokenUsage,
      id,
      router,
      setDefault,
      remove,
    ]
  );

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!realm) return null;

  return (
    <div className="p-6 w-full max-w-7xl mx-auto space-y-5">
      {editing && (
        <EditRealmPanel
          realm={realm}
          onClose={() => setEditing(false)}
          onSaved={load}
        />
      )}

      <TokenMetricsCards tokenUsage={tokenUsage} />

      <RealmTabBar
        active={tab}
        counts={{
          agents: agents.length,
          users: users.length,
          workflows: workflows.length,
          skills: skills.length,
          models: realmModels.length,
          channels: channels.length,
        }}
        onSelect={(t) => {
          setTab(t);
          if (t === "map") refreshMapMarkers();
        }}
      />

      {tab === "agents" && (
        <AgentsTab
          agents={agents}
          canRemove={!realm.isDefault}
          onAdd={() => setAddModal("agent")}
          onRemove={removeAgent}
        />
      )}
      {tab === "users" && (
        <UsersTab
          users={users}
          canRemove={!realm.isDefault}
          onAdd={() => setAddModal("user")}
          onRemove={removeUser}
        />
      )}
      {tab === "workflows" && (
        <WorkflowsTab realmId={id} workflows={workflows} />
      )}
      {tab === "skills" && (
        <SkillsTab realmId={id} skills={skills} onChanged={load} />
      )}
      {tab === "models" && (
        <ModelsTab
          realmId={id}
          models={realmModels}
          routerKey={routerKey}
          litellmConfigured={litellmConfigured}
          onRefresh={load}
        />
      )}
      {tab === "channels" && (
        <ChannelsTab
          realmId={id}
          channels={channels}
          setChannels={setChannels}
        />
      )}
      {tab === "org-chart" && (
        <div className="space-y-3">
          <EmbeddedOrgChart
            query={`?realm=${id}`}
            height={600}
            showFullscreenBtn={true}
          />
        </div>
      )}
      {tab === "map" && (
        <MapTab
          markers={mapMarkers}
          loading={mapLoading}
          canEdit={isGlobalAdmin}
          onSaveLocation={saveRealmMarkerLocation}
        />
      )}
      {tab === "config" && <ConfigTab realm={realm} onSaved={load} />}

      {addModal && (
        <AddMemberModal
          realm={realm}
          type={addModal}
          onClose={() => setAddModal(null)}
          onAdded={load}
        />
      )}
    </div>
  );
}
